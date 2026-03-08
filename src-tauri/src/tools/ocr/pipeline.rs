use std::mem;
use std::path::Path;
use std::process::Stdio;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::time::timeout;

use crate::shared::ffmpeg_progress::FfmpegProgressTracker;
use crate::shared::process::terminate_process;
use crate::shared::sleep_inhibit::SleepInhibitGuard;
use crate::shared::store::resolve_ffmpeg_path;
use crate::shared::validation::validate_media_path;
use crate::tools::ffprobe::get_media_duration_us;
use crate::tools::ocr::engine::{
    create_ocr_engine, get_ocr_models_dir, resolve_ocr_engine_threads, resolve_ocr_worker_count,
};
use crate::tools::ocr::progress::OcrProgressEmitter;
use crate::tools::ocr::subtitles::generate_subtitles_core;
use crate::tools::ocr::{
    OcrPipelineResult, OcrPipelineTimings, OcrRegion, OcrSubtitleCleanupOptions,
};

const OCR_PIPELINE_TIMEOUT: Duration = Duration::from_secs(1800);
const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
const PNG_IEND_TYPE: &[u8; 4] = b"IEND";
const FRAME_CHANNEL_CAPACITY: usize = 8;
const WORKER_QUEUE_CAPACITY: usize = 1;

fn summarize_ocr_results(
    frame_index: u32,
    time_ms: u64,
    ocr_results: &[ocr_rs::OcrResult_],
) -> crate::tools::ocr::OcrFrameResult {
    let mut sorted_results: Vec<_> = ocr_results.iter().collect();
    sorted_results.sort_by(|a, b| {
        let a_top = a.bbox.rect.top();
        let b_top = b.bbox.rect.top();
        a_top
            .partial_cmp(&b_top)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let combined_text = sorted_results
        .iter()
        .map(|result| result.text.trim())
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    let avg_confidence = if sorted_results.is_empty() {
        0.0
    } else {
        sorted_results
            .iter()
            .map(|result| result.confidence)
            .sum::<f32>() as f64
            / sorted_results.len() as f64
    };

    crate::tools::ocr::OcrFrameResult {
        frame_index,
        time_ms,
        text: combined_text,
        confidence: avg_confidence,
    }
}

#[derive(Clone)]
struct PipelineProgressContext {
    app: tauri::AppHandle,
    file_id: String,
    extraction: OcrProgressEmitter,
    ocr: OcrProgressEmitter,
}

impl PipelineProgressContext {
    fn new(app: tauri::AppHandle, file_id: String, estimated_frames: u32) -> Self {
        Self {
            extraction: OcrProgressEmitter::new(
                app.clone(),
                file_id.clone(),
                "extracting",
                estimated_frames,
            ),
            ocr: OcrProgressEmitter::new(app.clone(), file_id.clone(), "ocr", estimated_frames),
            app,
            file_id,
        }
    }

    fn emit_extraction_complete(&self, frame_count: u32) {
        OcrProgressEmitter::new(
            self.app.clone(),
            self.file_id.clone(),
            "extracting",
            frame_count,
        )
        .emit_force(frame_count, format!("Extracted {} frames", frame_count));
    }

    fn emit_ocr_complete(&self, frame_count: u32) {
        OcrProgressEmitter::new(self.app.clone(), self.file_id.clone(), "ocr", frame_count)
            .emit_force(frame_count, "OCR processing complete".to_string());
    }

    fn new_generating_emitter(&self, total: u32) -> OcrProgressEmitter {
        OcrProgressEmitter::new(self.app.clone(), self.file_id.clone(), "generating", total)
    }
}

struct StreamedFrame {
    frame_index: u32,
    time_ms: u64,
    png_bytes: Vec<u8>,
}

enum WorkerMessage {
    Frame(StreamedFrame),
    Shutdown,
}

fn is_operation_cancelled(file_id: &str) -> bool {
    super::state::OCR_PROCESS_IDS
        .lock()
        .map(|guard| !guard.contains_key(file_id))
        .unwrap_or(false)
}

fn set_operation_pid(file_id: &str, pid: u32) {
    if let Ok(mut guard) = super::state::OCR_PROCESS_IDS.lock() {
        guard.insert(file_id.to_string(), pid);
    }
}

fn clear_operation_pid(file_id: &str) -> Option<u32> {
    super::state::OCR_PROCESS_IDS
        .lock()
        .ok()
        .and_then(|mut guard| guard.remove(file_id))
}

fn build_ocr_filter_string(fps: f64, region: Option<&OcrRegion>) -> String {
    let mut filters = vec![format!("fps={}", fps)];
    if let Some(region) = region {
        filters.push(format!(
            "crop=iw*{}:ih*{}:iw*{}:ih*{}",
            region.width, region.height, region.x, region.y
        ));
    }
    filters.join(",")
}

fn set_fatal_error(target: &Arc<Mutex<Option<String>>>, message: String) {
    if let Ok(mut guard) = target.lock() {
        if guard.is_none() {
            *guard = Some(message);
        }
    }
}

fn take_fatal_error(target: &Arc<Mutex<Option<String>>>) -> Option<String> {
    target.lock().ok().and_then(|mut guard| guard.take())
}

fn has_fatal_error(target: &Arc<Mutex<Option<String>>>) -> bool {
    target.lock().map(|guard| guard.is_some()).unwrap_or(false)
}

fn find_png_signature(buffer: &[u8]) -> Option<usize> {
    buffer
        .windows(PNG_SIGNATURE.len())
        .position(|window| window == PNG_SIGNATURE)
}

fn take_next_png_frame(buffer: &mut Vec<u8>) -> Result<Option<Vec<u8>>, String> {
    let Some(signature_index) = find_png_signature(buffer) else {
        let tail_len = buffer.len().min(PNG_SIGNATURE.len().saturating_sub(1));
        if buffer.len() > tail_len {
            buffer.drain(..buffer.len() - tail_len);
        }
        return Ok(None);
    };

    if signature_index > 0 {
        buffer.drain(..signature_index);
    }

    if buffer.len() < PNG_SIGNATURE.len() {
        return Ok(None);
    }

    let mut cursor = PNG_SIGNATURE.len();
    loop {
        if buffer.len() < cursor + 8 {
            return Ok(None);
        }

        let chunk_len = u32::from_be_bytes([
            buffer[cursor],
            buffer[cursor + 1],
            buffer[cursor + 2],
            buffer[cursor + 3],
        ]) as usize;
        let chunk_type = &buffer[cursor + 4..cursor + 8];
        let chunk_end = cursor
            .checked_add(12)
            .and_then(|value| value.checked_add(chunk_len))
            .ok_or_else(|| "PNG chunk length overflow".to_string())?;

        if buffer.len() < chunk_end {
            return Ok(None);
        }

        cursor = chunk_end;
        if chunk_type == PNG_IEND_TYPE {
            return Ok(Some(buffer.drain(..cursor).collect()));
        }
    }
}

async fn read_ffmpeg_png_stream(
    stdout: tokio::process::ChildStdout,
    fps: f64,
    frame_tx: tokio::sync::mpsc::Sender<StreamedFrame>,
) -> Result<u32, String> {
    let mut stdout = stdout;
    let mut read_buffer = vec![0_u8; 64 * 1024];
    let mut png_buffer = Vec::new();
    let mut frame_index = 0_u32;
    let frame_duration_ms = 1000.0 / fps;

    loop {
        let read_bytes = stdout
            .read(&mut read_buffer)
            .await
            .map_err(|error| format!("Failed to read streamed OCR frames: {}", error))?;
        if read_bytes == 0 {
            break;
        }

        png_buffer.extend_from_slice(&read_buffer[..read_bytes]);
        while let Some(frame_bytes) = take_next_png_frame(&mut png_buffer)? {
            let time_ms = ((frame_index as f64) * frame_duration_ms).round() as u64;
            frame_tx
                .send(StreamedFrame {
                    frame_index,
                    time_ms,
                    png_bytes: frame_bytes,
                })
                .await
                .map_err(|_| "OCR frame channel closed unexpectedly".to_string())?;
            frame_index = frame_index.saturating_add(1);
        }
    }

    drop(frame_tx);

    if !png_buffer.is_empty() {
        return Err("Incomplete PNG frame received from ffmpeg".to_string());
    }

    Ok(frame_index)
}

async fn read_ffmpeg_progress(
    stderr: tokio::process::ChildStderr,
    duration_us: Option<u64>,
    estimated_frames: u32,
    progress: Option<PipelineProgressContext>,
) -> Result<String, String> {
    let mut tracker = FfmpegProgressTracker::new(duration_us);
    let stderr_reader = BufReader::new(stderr);
    let mut lines = stderr_reader.lines();
    let mut error_lines: Vec<String> = Vec::new();

    while let Some(line) = lines
        .next_line()
        .await
        .map_err(|error| format!("Failed to read ffmpeg progress: {}", error))?
    {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if let Some(update) = tracker.handle_line(trimmed) {
            if let (Some(progress_ctx), Some(percent)) = (progress.as_ref(), update.progress) {
                let current = if estimated_frames > 0 {
                    (((percent as f64) / 100.0) * estimated_frames as f64).round() as u32
                } else {
                    0
                };
                let message = if update.is_end {
                    "Finishing frame extraction...".to_string()
                } else {
                    format!("Extracting frame {}...", current.max(1))
                };
                progress_ctx.extraction.emit(current, message);
            }
            continue;
        }

        if trimmed.contains('=') {
            continue;
        }

        error_lines.push(trimmed.to_string());
    }

    Ok(error_lines.join("\n"))
}

fn process_streamed_frames(
    frame_rx: tokio::sync::mpsc::Receiver<StreamedFrame>,
    models_dir: &Path,
    language: &str,
    use_gpu: bool,
    requested_workers: u32,
    progress: Option<OcrProgressEmitter>,
    total_frames_hint: u32,
    file_id: &str,
) -> Result<Vec<crate::tools::ocr::OcrFrameResult>, String> {
    let worker_count = resolve_ocr_worker_count(requested_workers);
    let engine_threads = resolve_ocr_engine_threads(worker_count);
    let processed_frames = Arc::new(AtomicU32::new(0));
    let fatal_error = Arc::new(Mutex::new(None));
    let results = Arc::new(Mutex::new(Vec::new()));

    let mut worker_senders = Vec::with_capacity(worker_count);
    let mut worker_handles = Vec::with_capacity(worker_count);

    for _worker_index in 0..worker_count {
        let (worker_tx, worker_rx) =
            std::sync::mpsc::sync_channel::<WorkerMessage>(WORKER_QUEUE_CAPACITY);
        worker_senders.push(worker_tx);

        let models_dir = models_dir.to_path_buf();
        let language = language.to_string();
        let file_id = file_id.to_string();
        let processed_frames = Arc::clone(&processed_frames);
        let fatal_error = Arc::clone(&fatal_error);
        let results = Arc::clone(&results);
        let progress = progress.clone();

        worker_handles.push(std::thread::spawn(move || {
            let engine = match create_ocr_engine(&models_dir, &language, use_gpu, engine_threads) {
                Ok(engine) => engine,
                Err(error) => {
                    set_fatal_error(&fatal_error, error);
                    return;
                }
            };

            while let Ok(message) = worker_rx.recv() {
                match message {
                    WorkerMessage::Shutdown => break,
                    WorkerMessage::Frame(frame) => {
                        if is_operation_cancelled(&file_id) {
                            set_fatal_error(&fatal_error, "OCR cancelled".to_string());
                            break;
                        }

                        let image = match image::load_from_memory(&frame.png_bytes) {
                            Ok(image) => image,
                            Err(_) => {
                                let current = processed_frames.fetch_add(1, Ordering::Relaxed) + 1;
                                if let Some(progress) = progress.as_ref() {
                                    progress.emit(
                                        current,
                                        format!(
                                            "Processing frame {}/{}...",
                                            current, total_frames_hint
                                        ),
                                    );
                                }
                                continue;
                            }
                        };

                        if let Ok(ocr_results) = engine.recognize(&image) {
                            let frame_result = summarize_ocr_results(
                                frame.frame_index,
                                frame.time_ms,
                                &ocr_results,
                            );
                            if let Ok(mut guard) = results.lock() {
                                guard.push(frame_result);
                            }
                        }

                        let current = processed_frames.fetch_add(1, Ordering::Relaxed) + 1;
                        if let Some(progress) = progress.as_ref() {
                            progress.emit(
                                current,
                                format!("Processing frame {}/{}...", current, total_frames_hint),
                            );
                        }
                    }
                }

                if has_fatal_error(&fatal_error) {
                    break;
                }
            }
        }));
    }

    let dispatch_result = (|| -> Result<(), String> {
        let mut frame_rx = frame_rx;
        let mut next_worker = 0_usize;

        while let Some(frame) = frame_rx.blocking_recv() {
            if has_fatal_error(&fatal_error) {
                return Err(take_fatal_error(&fatal_error)
                    .unwrap_or_else(|| "OCR processing failed".to_string()));
            }

            if is_operation_cancelled(file_id) {
                return Err("OCR cancelled".to_string());
            }

            worker_senders[next_worker]
                .send(WorkerMessage::Frame(frame))
                .map_err(|_| "Failed to dispatch OCR frame to worker".to_string())?;
            next_worker = (next_worker + 1) % worker_count;
        }

        Ok(())
    })();

    for worker_sender in worker_senders {
        let _ = worker_sender.send(WorkerMessage::Shutdown);
    }

    for worker_handle in worker_handles {
        if worker_handle.join().is_err() {
            return Err("OCR worker thread panicked".to_string());
        }
    }

    dispatch_result?;

    if let Some(error) = take_fatal_error(&fatal_error) {
        return Err(error);
    }

    let mut guard = results
        .lock()
        .map_err(|_| "Failed to collect OCR results".to_string())?;
    let mut collected = mem::take(&mut *guard);
    drop(guard);
    collected.sort_by_key(|result| result.frame_index);
    Ok(collected)
}

async fn run_ocr_pipeline_with_bins(
    ffmpeg_path: &str,
    video_path: &str,
    file_id: &str,
    models_dir: &Path,
    language: &str,
    fps: f64,
    use_gpu: bool,
    requested_workers: u32,
    min_confidence: f64,
    cleanup: OcrSubtitleCleanupOptions,
    region: Option<OcrRegion>,
    duration_us: Option<u64>,
    estimated_frames: u32,
    progress: Option<PipelineProgressContext>,
) -> Result<OcrPipelineResult, String> {
    validate_media_path(video_path)?;

    if fps <= 0.0 {
        return Err("FPS must be greater than 0".to_string());
    }

    let result = async {
        let total_timer = Instant::now();
        let filter_str = build_ocr_filter_string(fps, region.as_ref());

        let mut child = tokio::process::Command::new(ffmpeg_path)
            .args([
                "-y",
                "-v",
                "error",
                "-nostats",
                "-i",
                video_path,
                "-vf",
                &filter_str,
                "-c:v",
                "png",
                "-f",
                "image2pipe",
                "-progress",
                "pipe:2",
                "pipe:1",
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("Failed to start ffmpeg: {}", error))?;

        let child_pid = child.id().unwrap_or(0);
        set_operation_pid(file_id, child_pid);

        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Failed to capture ffmpeg stdout".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Failed to capture ffmpeg stderr".to_string())?;

        let extraction_start = Instant::now();
        let (frame_tx, frame_rx) = tokio::sync::mpsc::channel(FRAME_CHANNEL_CAPACITY);
        let stderr_progress = progress.clone();
        let stderr_task = tokio::spawn(read_ffmpeg_progress(
            stderr,
            duration_us,
            estimated_frames,
            stderr_progress,
        ));
        let stream_reader_task = tokio::spawn(read_ffmpeg_png_stream(stdout, fps, frame_tx));

        let ocr_start = Instant::now();
        let ocr_progress = progress.as_ref().map(|progress| progress.ocr.clone());
        let models_dir = models_dir.to_path_buf();
        let language = language.to_string();
        let file_id_owned = file_id.to_string();
        let ocr_task = tokio::task::spawn_blocking(move || {
            process_streamed_frames(
                frame_rx,
                &models_dir,
                &language,
                use_gpu,
                requested_workers,
                ocr_progress,
                estimated_frames,
                &file_id_owned,
            )
        });

        let wait_status = timeout(OCR_PIPELINE_TIMEOUT, child.wait())
            .await
            .map_err(|_| {
                terminate_process(child_pid);
                format!(
                    "OCR pipeline timeout after {} seconds",
                    OCR_PIPELINE_TIMEOUT.as_secs()
                )
            })?
            .map_err(|error| format!("Failed to wait for ffmpeg: {}", error))?;

        if !is_operation_cancelled(file_id) {
            set_operation_pid(file_id, 0);
        }

        let was_cancelled = is_operation_cancelled(file_id);

        let stderr_output = match stderr_task.await {
            Ok(Ok(output)) => output,
            Ok(Err(_)) | Err(_) if was_cancelled => String::new(),
            Ok(Err(error)) => return Err(error),
            Err(error) => return Err(format!("FFmpeg progress task failed: {}", error)),
        };
        let frame_count = match stream_reader_task.await {
            Ok(Ok(frame_count)) => frame_count,
            Ok(Err(_)) | Err(_) if was_cancelled => 0,
            Ok(Err(error)) => return Err(error),
            Err(error) => return Err(format!("Stream reader task failed: {}", error)),
        };
        let extract_ms = extraction_start.elapsed().as_millis() as u64;

        if let Some(progress) = progress.as_ref() {
            progress.emit_extraction_complete(frame_count);
        }

        if was_cancelled {
            let _ = ocr_task.await;
            return Err("OCR cancelled".to_string());
        }

        if !wait_status.success() {
            if stderr_output.trim().is_empty() {
                return Err(format!(
                    "Frame extraction failed with status {}",
                    wait_status
                ));
            }
            return Err(format!("Frame extraction failed: {}", stderr_output));
        }

        let raw_ocr = ocr_task
            .await
            .map_err(|error| format!("OCR processing task failed: {}", error))??;
        let ocr_ms = ocr_start.elapsed().as_millis() as u64;

        if is_operation_cancelled(file_id) {
            return Err("OCR cancelled".to_string());
        }

        if let Some(progress) = progress.as_ref() {
            progress.emit_ocr_complete(frame_count);
        }

        let subtitle_start = Instant::now();
        let generating_progress = progress
            .as_ref()
            .map(|progress| progress.new_generating_emitter(raw_ocr.len() as u32));
        if let Some(progress) = generating_progress.as_ref() {
            progress.emit_force(0, "Generating subtitles...".to_string());
        }

        let subtitles =
            generate_subtitles_core(&raw_ocr, fps, min_confidence, cleanup, |current, total| {
                if let Some(progress) = generating_progress.as_ref() {
                    progress.emit(
                        current as u32,
                        format!("Processing frame {}/{}...", current, total),
                    );
                }
            })?;
        let subtitle_ms = subtitle_start.elapsed().as_millis() as u64;

        if let Some(progress) = generating_progress.as_ref() {
            progress.emit_force(
                raw_ocr.len() as u32,
                format!("Generated {} subtitles", subtitles.len()),
            );
        }

        Ok(OcrPipelineResult {
            frame_count,
            raw_ocr,
            subtitles,
            timings: OcrPipelineTimings {
                extract_ms,
                ocr_ms,
                subtitle_ms,
                total_ms: total_timer.elapsed().as_millis() as u64,
            },
        })
    }
    .await;

    if result.is_err() {
        if let Some(pid) = clear_operation_pid(file_id) {
            terminate_process(pid);
        }
    } else {
        clear_operation_pid(file_id);
    }

    result
}

#[tauri::command]
pub(crate) async fn run_ocr_pipeline(
    app: tauri::AppHandle,
    video_path: String,
    file_id: String,
    language: String,
    fps: f64,
    use_gpu: bool,
    num_workers: u32,
    min_confidence: f64,
    cleanup: Option<OcrSubtitleCleanupOptions>,
    region: Option<OcrRegion>,
) -> Result<OcrPipelineResult, String> {
    validate_media_path(&video_path)?;

    if fps <= 0.0 {
        return Err("FPS must be greater than 0".to_string());
    }

    let _sleep_guard = SleepInhibitGuard::try_acquire("Running OCR pipeline").ok();
    let ffmpeg_path = resolve_ffmpeg_path(&app)?;
    let models_dir = get_ocr_models_dir(&app)?;
    let duration_us = get_media_duration_us(&app, &video_path).await.ok();
    let estimated_frames = duration_us
        .map(|duration_us| {
            (((duration_us as f64 / 1_000_000.0) * fps).ceil() as u32).saturating_add(1)
        })
        .unwrap_or(1000);

    let progress = PipelineProgressContext::new(app, file_id.clone(), estimated_frames);
    progress
        .extraction
        .emit_force(0, "Starting frame extraction...".to_string());

    run_ocr_pipeline_with_bins(
        &ffmpeg_path,
        &video_path,
        &file_id,
        &models_dir,
        &language,
        fps,
        use_gpu,
        num_workers,
        min_confidence,
        cleanup.unwrap_or_default(),
        region,
        duration_us,
        estimated_frames,
        Some(progress),
    )
    .await
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;
    use std::time::Duration;

    use serial_test::serial;

    use crate::tools::ocr::OcrSubtitleCleanupOptions;

    use super::{PNG_SIGNATURE, run_ocr_pipeline_with_bins, take_next_png_frame};

    fn make_test_png(width: u32, height: u32) -> Vec<u8> {
        let image = image::DynamicImage::new_rgba8(width, height);
        let mut bytes = Vec::new();
        image
            .write_to(
                &mut std::io::Cursor::new(&mut bytes),
                image::ImageFormat::Png,
            )
            .expect("png generation should succeed");
        bytes
    }

    async fn ensure_models_dir() -> Result<std::path::PathBuf, String> {
        let models_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("ocr-models");
        for file in [
            "PP-OCRv5_mobile_det.mnn",
            "PP-OCRv5_mobile_rec.mnn",
            "ppocr_keys_v5.txt",
        ] {
            let path = models_dir.join(file);
            if !path.exists() {
                return Err(format!("Missing OCR model file: {}", path.display()));
            }
        }
        Ok(models_dir)
    }

    fn default_cleanup() -> OcrSubtitleCleanupOptions {
        OcrSubtitleCleanupOptions::default()
    }

    fn normalized_words(text: &str) -> Vec<String> {
        text.chars()
            .map(|character| {
                if character.is_ascii_alphanumeric() {
                    character.to_ascii_uppercase()
                } else {
                    ' '
                }
            })
            .collect::<String>()
            .split_whitespace()
            .map(|word| word.to_string())
            .collect()
    }

    fn assert_contains_expected_ocr_words(
        results: &[crate::tools::ocr::OcrFrameResult],
        expected: &str,
    ) {
        let mut observed = HashSet::new();
        for result in results {
            for word in normalized_words(&result.text) {
                observed.insert(word);
            }
        }

        for word in normalized_words(expected) {
            assert!(
                observed.contains(&word),
                "expected OCR output to contain word '{}', observed words: {:?}",
                word,
                observed
            );
        }
    }

    #[test]
    fn take_next_png_frame_handles_partial_reads() {
        let png = make_test_png(4, 4);
        let mut buffer = png[..png.len() / 2].to_vec();
        assert!(
            take_next_png_frame(&mut buffer)
                .expect("partial png should parse")
                .is_none()
        );

        buffer.extend_from_slice(&png[png.len() / 2..]);
        let frame = take_next_png_frame(&mut buffer)
            .expect("complete png should parse")
            .expect("png frame should be extracted");
        assert_eq!(frame, png);
        assert!(buffer.is_empty());
    }

    #[test]
    fn take_next_png_frame_extracts_multiple_concatenated_frames() {
        let first = make_test_png(3, 3);
        let second = make_test_png(5, 5);
        let mut buffer = first.clone();
        buffer.extend_from_slice(&second);

        let extracted_first = take_next_png_frame(&mut buffer)
            .expect("first png should parse")
            .expect("first frame should exist");
        assert_eq!(extracted_first, first);

        let extracted_second = take_next_png_frame(&mut buffer)
            .expect("second png should parse")
            .expect("second frame should exist");
        assert_eq!(extracted_second, second);
        assert!(buffer.is_empty());
    }

    #[test]
    fn take_next_png_frame_discards_trailing_noise_before_signature() {
        let png = make_test_png(2, 2);
        let mut buffer = b"noise".to_vec();
        buffer.extend_from_slice(PNG_SIGNATURE);
        buffer.extend_from_slice(&png[PNG_SIGNATURE.len()..]);

        let extracted = take_next_png_frame(&mut buffer)
            .expect("png with leading noise should parse")
            .expect("frame should be extracted");
        assert_eq!(extracted, png);
        assert!(buffer.is_empty());
    }

    #[tokio::test]
    async fn run_ocr_pipeline_returns_results_for_sample_video() {
        let video = crate::test_support::assets::ensure_ocr_video()
            .await
            .expect("failed to prepare ocr video");
        let models_dir = ensure_models_dir().await.expect("models should exist");
        let result = run_ocr_pipeline_with_bins(
            "ffmpeg",
            video.to_string_lossy().as_ref(),
            "sample-pipeline",
            &models_dir,
            "multi",
            1.0,
            false,
            1,
            0.5,
            default_cleanup(),
            None,
            None,
            100,
            None,
        )
        .await
        .expect("pipeline should succeed");

        assert!(!result.raw_ocr.is_empty());
        assert!(!result.subtitles.is_empty());
        assert_contains_expected_ocr_words(&result.raw_ocr, "HELLO OCR TEST");
    }

    #[tokio::test]
    #[serial]
    async fn run_ocr_pipeline_cancels_active_ffmpeg_process() {
        let video = crate::test_support::assets::ensure_ocr_video()
            .await
            .expect("failed to prepare ocr video");
        let models_dir = ensure_models_dir().await.expect("models should exist");
        let file_id = "cancel-streamed-ocr".to_string();

        let task = tokio::spawn({
            let video_path = video.to_string_lossy().to_string();
            let file_id = file_id.clone();
            let models_dir = models_dir.clone();
            async move {
                run_ocr_pipeline_with_bins(
                    "ffmpeg",
                    &video_path,
                    &file_id,
                    &models_dir,
                    "multi",
                    30.0,
                    false,
                    1,
                    0.5,
                    default_cleanup(),
                    None,
                    None,
                    1000,
                    None,
                )
                .await
            }
        });

        tokio::time::sleep(Duration::from_millis(100)).await;
        crate::tools::ocr::cancel::cancel_ocr_operation(file_id.clone())
            .await
            .expect("cancel should succeed");

        let result = task.await.expect("pipeline task should resolve");
        let error = result.expect_err("pipeline should be cancelled");
        assert!(error.to_lowercase().contains("cancel"));
        assert!(
            !super::super::state::OCR_PROCESS_IDS
                .lock()
                .expect("ocr pid map should lock")
                .contains_key(&file_id)
        );
    }
}
