use std::collections::HashSet;
use std::path::Path;
use std::process::Stdio;

use tauri::Emitter;
use tokio::process::Command;
use tokio::time::{Duration, timeout};

use crate::shared::hash::stable_hash64;
use crate::shared::sleep_inhibit::SleepInhibitGuard;
use crate::shared::store::resolve_ffmpeg_path;
use crate::shared::validation::validate_media_path;
use crate::tools::ffprobe::{get_media_duration_us, get_media_duration_us_with_ffprobe};

/// Timeout for video transcoding for preview (10 minutes)
const VIDEO_PREVIEW_TRANSCODE_TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EncoderProfile {
    Standard,
    Vaapi,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PreviewVideoEncoder {
    ffmpeg_name: &'static str,
    display_name: &'static str,
    is_hardware: bool,
    profile: EncoderProfile,
}

const HEVC_VIDEOTOOLBOX: PreviewVideoEncoder = PreviewVideoEncoder {
    ffmpeg_name: "hevc_videotoolbox",
    display_name: "HEVC (VideoToolbox)",
    is_hardware: true,
    profile: EncoderProfile::Standard,
};

const HEVC_VAAPI: PreviewVideoEncoder = PreviewVideoEncoder {
    ffmpeg_name: "hevc_vaapi",
    display_name: "HEVC (VAAPI)",
    is_hardware: true,
    profile: EncoderProfile::Vaapi,
};

const HEVC_NVENC: PreviewVideoEncoder = PreviewVideoEncoder {
    ffmpeg_name: "hevc_nvenc",
    display_name: "HEVC (NVENC)",
    is_hardware: true,
    profile: EncoderProfile::Standard,
};

const HEVC_QSV: PreviewVideoEncoder = PreviewVideoEncoder {
    ffmpeg_name: "hevc_qsv",
    display_name: "HEVC (QSV)",
    is_hardware: true,
    profile: EncoderProfile::Standard,
};

const HEVC_AMF: PreviewVideoEncoder = PreviewVideoEncoder {
    ffmpeg_name: "hevc_amf",
    display_name: "HEVC (AMF)",
    is_hardware: true,
    profile: EncoderProfile::Standard,
};

const LIBX264: PreviewVideoEncoder = PreviewVideoEncoder {
    ffmpeg_name: "libx264",
    display_name: "H.264 (libx264)",
    is_hardware: false,
    profile: EncoderProfile::Standard,
};

fn encoder_from_name(name: &str) -> Option<PreviewVideoEncoder> {
    match name {
        "hevc_videotoolbox" => Some(HEVC_VIDEOTOOLBOX),
        "hevc_vaapi" => Some(HEVC_VAAPI),
        "hevc_nvenc" => Some(HEVC_NVENC),
        "hevc_qsv" => Some(HEVC_QSV),
        "hevc_amf" => Some(HEVC_AMF),
        "libx264" => Some(LIBX264),
        _ => None,
    }
}

fn hardware_encoder_candidates_for_os(os: &str) -> &'static [&'static str] {
    match os {
        "macos" => &["hevc_videotoolbox"],
        "linux" => &["hevc_vaapi", "hevc_nvenc", "hevc_qsv", "hevc_amf"],
        "windows" => &["hevc_nvenc", "hevc_qsv", "hevc_amf"],
        _ => &[],
    }
}

fn parse_ffmpeg_encoder_names(output: &str) -> HashSet<String> {
    let mut encoders = HashSet::new();

    for line in output.lines() {
        let mut parts = line.split_whitespace();
        let Some(flags) = parts.next() else {
            continue;
        };
        let Some(name) = parts.next() else {
            continue;
        };

        if flags.len() == 6 && name != "=" {
            encoders.insert(name.to_string());
        }
    }

    encoders
}

fn select_preview_video_encoder(
    available_encoders: &HashSet<String>,
    os: &str,
) -> PreviewVideoEncoder {
    for candidate in hardware_encoder_candidates_for_os(os) {
        if available_encoders.contains(*candidate) {
            return encoder_from_name(candidate).unwrap_or(LIBX264);
        }
    }

    LIBX264
}

fn should_fallback_to_libx264(encoder: PreviewVideoEncoder, attempt_succeeded: bool) -> bool {
    encoder.is_hardware && !attempt_succeeded && encoder.ffmpeg_name != LIBX264.ffmpeg_name
}

fn build_preview_transcode_args(
    input_path: &str,
    output_path: &str,
    encoder: PreviewVideoEncoder,
) -> Vec<String> {
    let mut args = vec!["-y".to_string(), "-i".to_string(), input_path.to_string()];

    match encoder.profile {
        EncoderProfile::Standard => {
            args.push("-vf".to_string());
            args.push("scale=-2:480".to_string());
        }
        EncoderProfile::Vaapi => {
            args.push("-vaapi_device".to_string());
            args.push("/dev/dri/renderD128".to_string());
            args.push("-vf".to_string());
            args.push("format=nv12,hwupload,scale_vaapi=w=-2:h=480".to_string());
        }
    }

    args.push("-c:v".to_string());
    args.push(encoder.ffmpeg_name.to_string());

    if encoder.ffmpeg_name.starts_with("hevc_") {
        args.extend([
            "-tag:v".to_string(),
            "hvc1".to_string(),
            "-profile:v".to_string(),
            "main".to_string(),
        ]);
    }

    if encoder.ffmpeg_name == HEVC_VIDEOTOOLBOX.ffmpeg_name {
        args.extend(["-pix_fmt".to_string(), "yuv420p".to_string()]);
    }

    if encoder.ffmpeg_name == LIBX264.ffmpeg_name {
        args.extend([
            "-preset".to_string(),
            "fast".to_string(),
            "-crf".to_string(),
            "28".to_string(),
        ]);
    }

    args.extend([
        "-c:a".to_string(),
        "aac".to_string(),
        "-b:a".to_string(),
        "96k".to_string(),
        "-ac".to_string(),
        "1".to_string(),
        "-progress".to_string(),
        "pipe:1".to_string(),
        output_path.to_string(),
    ]);

    args
}

async fn probe_available_ffmpeg_encoders(ffmpeg_path: &str) -> HashSet<String> {
    let output = Command::new(ffmpeg_path)
        .args(["-hide_banner", "-encoders"])
        .output()
        .await;

    let Ok(output) = output else {
        return HashSet::new();
    };

    let mut combined = String::from_utf8_lossy(&output.stdout).to_string();
    if !output.stderr.is_empty() {
        if !combined.is_empty() {
            combined.push('\n');
        }
        combined.push_str(&String::from_utf8_lossy(&output.stderr));
    }

    parse_ffmpeg_encoder_names(&combined)
}

fn emit_transcoding_progress(
    app: &tauri::AppHandle,
    file_id: &str,
    current: i32,
    message: String,
    codec_label: &str,
) {
    let _ = app.emit(
        "ocr-progress",
        serde_json::json!({
            "fileId": file_id,
            "phase": "transcoding",
            "current": current,
            "total": 100,
            "message": message,
            "transcodingCodec": codec_label
        }),
    );
}

fn clear_ocr_process_tracking(file_id: &str) {
    if let Ok(mut guard) = super::state::OCR_PROCESS_IDS.lock() {
        guard.remove(file_id);
    }
}

fn clear_ocr_transcode_tracking(file_id: &str) {
    if let Ok(mut guard) = super::state::OCR_TRANSCODE_PATHS.lock() {
        guard.remove(file_id);
    }
}

fn is_ocr_transcode_cancelled(file_id: &str) -> bool {
    if let Ok(guard) = super::state::OCR_TRANSCODE_PATHS.lock() {
        return !guard.contains_key(file_id);
    }
    false
}

async fn run_preview_transcode_attempt(
    app: &tauri::AppHandle,
    ffmpeg_path: &str,
    input_path: &str,
    output_path: &str,
    file_id: &str,
    duration_us: u64,
    encoder: PreviewVideoEncoder,
) -> Result<(), String> {
    let args = build_preview_transcode_args(input_path, output_path, encoder);
    let mut child = Command::new(ffmpeg_path)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start ffmpeg: {}", e))?;

    // Store PID for cancellation
    if let Some(pid) = child.id() {
        if let Ok(mut guard) = super::state::OCR_PROCESS_IDS.lock() {
            guard.insert(file_id.to_string(), pid);
        }
    }

    // Read stdout for progress
    if let Some(mut stdout) = child.stdout.take() {
        use tokio::io::{AsyncBufReadExt, BufReader};

        let app_clone = app.clone();
        let file_id_clone = file_id.to_string();
        let codec_label = encoder.display_name.to_string();

        tokio::spawn(async move {
            let reader = BufReader::new(&mut stdout);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                if line.starts_with("out_time_us=") {
                    if let Ok(time_us) = line.trim_start_matches("out_time_us=").parse::<u64>() {
                        if duration_us > 0 {
                            let progress =
                                ((time_us as f64 / duration_us as f64) * 100.0).min(99.0) as i32;
                            emit_transcoding_progress(
                                &app_clone,
                                &file_id_clone,
                                progress,
                                format!("Transcoding video... {}%", progress),
                                &codec_label,
                            );
                        }
                    }
                }
            }
        });
    }

    let file_id_for_cleanup = file_id.to_string();
    let output_path_for_cleanup = output_path.to_string();
    let output = timeout(VIDEO_PREVIEW_TRANSCODE_TIMEOUT, child.wait_with_output())
        .await
        .map_err(|_| {
            clear_ocr_process_tracking(&file_id_for_cleanup);
            let _ = std::fs::remove_file(&output_path_for_cleanup);
            format!(
                "Video transcoding timeout after {} seconds",
                VIDEO_PREVIEW_TRANSCODE_TIMEOUT.as_secs()
            )
        })?
        .map_err(|e| {
            clear_ocr_process_tracking(&file_id_for_cleanup);
            let _ = std::fs::remove_file(&output_path_for_cleanup);
            format!("FFmpeg error: {}", e)
        })?;

    clear_ocr_process_tracking(file_id);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let _ = std::fs::remove_file(output_path);
        return Err(format!(
            "Video transcoding failed with {}: {}",
            encoder.ffmpeg_name, stderr
        ));
    }

    if !Path::new(output_path).exists() {
        return Err("Transcoding failed: output file not created".to_string());
    }

    Ok(())
}

async fn run_preview_transcode_attempt_without_progress(
    ffmpeg_path: &str,
    input_path: &str,
    output_path: &str,
    encoder: PreviewVideoEncoder,
) -> Result<(), String> {
    let args = build_preview_transcode_args(input_path, output_path, encoder);
    let ffmpeg_path_owned = ffmpeg_path.to_string();
    let output_path_owned = output_path.to_string();
    let wait_future = async move {
        Command::new(ffmpeg_path_owned)
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
    };

    let output = timeout(VIDEO_PREVIEW_TRANSCODE_TIMEOUT, wait_future)
        .await
        .map_err(|_| {
            let _ = std::fs::remove_file(&output_path_owned);
            format!(
                "Video transcoding timeout after {} seconds",
                VIDEO_PREVIEW_TRANSCODE_TIMEOUT.as_secs()
            )
        })?
        .map_err(|e| {
            let _ = std::fs::remove_file(&output_path_owned);
            format!("FFmpeg error: {}", e)
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let _ = std::fs::remove_file(output_path);
        return Err(format!(
            "Video transcoding failed with {}: {}",
            encoder.ffmpeg_name, stderr
        ));
    }

    if !Path::new(output_path).exists() {
        return Err("Transcoding failed: output file not created".to_string());
    }

    Ok(())
}

/// Transcode video to 480p MP4 for HTML5 preview
/// Uses H.264 video, AAC audio (mono 96kbps)
#[cfg_attr(not(test), allow(dead_code))]
async fn transcode_for_preview_with_bins_and_encoder(
    ffmpeg_path: &str,
    ffprobe_path: &str,
    input_path: &str,
) -> Result<(String, PreviewVideoEncoder), String> {
    validate_media_path(input_path)?;

    let input = Path::new(input_path);
    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("video");
    let path_hash = format!("{:x}", stable_hash64(input_path));

    let temp_dir = std::env::temp_dir().join("mediaflow_preview");
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp directory: {}", e))?;

    let output_path = temp_dir.join(format!("{}_{}.mp4", stem, &path_hash[..8]));
    let output_str = output_path.to_string_lossy().to_string();
    let _ = std::fs::remove_file(&output_path);

    let _duration_us = get_media_duration_us_with_ffprobe(ffprobe_path, input_path)
        .await
        .unwrap_or(0);

    let available_encoders = probe_available_ffmpeg_encoders(ffmpeg_path).await;
    let selected_encoder = select_preview_video_encoder(&available_encoders, std::env::consts::OS);
    let mut active_encoder = selected_encoder;

    if let Err(primary_error) = run_preview_transcode_attempt_without_progress(
        ffmpeg_path,
        input_path,
        &output_str,
        selected_encoder,
    )
    .await
    {
        if should_fallback_to_libx264(selected_encoder, false) {
            active_encoder = LIBX264;
            let _ = std::fs::remove_file(&output_path);
            if let Err(fallback_error) = run_preview_transcode_attempt_without_progress(
                ffmpeg_path,
                input_path,
                &output_str,
                active_encoder,
            )
            .await
            {
                let _ = std::fs::remove_file(&output_path);
                return Err(format!(
                    "Hardware HEVC transcoding failed ({}): {}. Software fallback failed: {}",
                    selected_encoder.ffmpeg_name, primary_error, fallback_error
                ));
            }
        } else {
            let _ = std::fs::remove_file(&output_path);
            return Err(primary_error);
        }
    }

    if !output_path.exists() {
        return Err("Transcoding failed: output file not created".to_string());
    }

    Ok((output_str, active_encoder))
}

#[cfg_attr(not(test), allow(dead_code))]
pub(super) async fn transcode_for_preview_with_bins(
    ffmpeg_path: &str,
    ffprobe_path: &str,
    input_path: &str,
) -> Result<String, String> {
    let (output_str, _) =
        transcode_for_preview_with_bins_and_encoder(ffmpeg_path, ffprobe_path, input_path).await?;
    Ok(output_str)
}

/// Transcode video to 480p MP4 for HTML5 preview.
/// Prefers hardware HEVC encoders and falls back to libx264 when needed.
#[tauri::command]
pub(crate) async fn transcode_for_preview(
    app: tauri::AppHandle,
    input_path: String,
    file_id: String,
) -> Result<String, String> {
    validate_media_path(&input_path)?;

    let _sleep_guard = SleepInhibitGuard::try_acquire("Video preview transcoding").ok();

    // Create output path in temp directory
    let input = Path::new(&input_path);
    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("video");
    let path_hash = format!("{:x}", stable_hash64(&input_path));

    let temp_dir = std::env::temp_dir().join("mediaflow_preview");
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| format!("Failed to create temp directory: {}", e))?;

    let output_path = temp_dir.join(format!("{}_{}.mp4", stem, &path_hash[..8]));
    let output_str = output_path.to_string_lossy().to_string();

    // Check if already transcoded
    if output_path.exists() {
        return Ok(output_str);
    }

    let ffmpeg_path = resolve_ffmpeg_path(&app)?;
    let available_encoders = probe_available_ffmpeg_encoders(&ffmpeg_path).await;
    let selected_encoder = select_preview_video_encoder(&available_encoders, std::env::consts::OS);
    let mut active_encoder = selected_encoder;

    // Get duration for progress
    let duration_us = get_media_duration_us(&app, &input_path).await.unwrap_or(0);

    // Emit initial progress
    emit_transcoding_progress(
        &app,
        &file_id,
        0,
        format!(
            "Starting video transcoding with {}...",
            active_encoder.display_name
        ),
        active_encoder.display_name,
    );

    // Store output path for cleanup on cancel/error
    if let Ok(mut guard) = super::state::OCR_TRANSCODE_PATHS.lock() {
        guard.insert(file_id.clone(), output_str.clone());
    }

    let transcode_result = run_preview_transcode_attempt(
        &app,
        &ffmpeg_path,
        &input_path,
        &output_str,
        &file_id,
        duration_us,
        selected_encoder,
    )
    .await;

    if let Err(primary_error) = transcode_result {
        if should_fallback_to_libx264(selected_encoder, false)
            && !is_ocr_transcode_cancelled(&file_id)
        {
            active_encoder = LIBX264;
            let _ = std::fs::remove_file(&output_path);

            emit_transcoding_progress(
                &app,
                &file_id,
                0,
                format!(
                    "{} failed, retrying with {}...",
                    selected_encoder.display_name, active_encoder.display_name
                ),
                active_encoder.display_name,
            );

            if let Err(fallback_error) = run_preview_transcode_attempt(
                &app,
                &ffmpeg_path,
                &input_path,
                &output_str,
                &file_id,
                duration_us,
                active_encoder,
            )
            .await
            {
                clear_ocr_process_tracking(&file_id);
                clear_ocr_transcode_tracking(&file_id);
                let _ = std::fs::remove_file(&output_path);
                return Err(format!(
                    "Hardware HEVC transcoding failed ({}): {}. Software fallback failed: {}",
                    selected_encoder.ffmpeg_name, primary_error, fallback_error
                ));
            }
        } else {
            clear_ocr_process_tracking(&file_id);
            clear_ocr_transcode_tracking(&file_id);
            let _ = std::fs::remove_file(&output_path);
            return Err(primary_error);
        }
    }

    clear_ocr_process_tracking(&file_id);
    clear_ocr_transcode_tracking(&file_id);

    // Emit completion
    emit_transcoding_progress(
        &app,
        &file_id,
        100,
        "Transcoding complete".to_string(),
        active_encoder.display_name,
    );

    Ok(output_str)
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::{
        HEVC_NVENC, HEVC_QSV, HEVC_VAAPI, HEVC_VIDEOTOOLBOX, LIBX264, build_preview_transcode_args,
        parse_ffmpeg_encoder_names, select_preview_video_encoder, should_fallback_to_libx264,
        transcode_for_preview_with_bins, transcode_for_preview_with_bins_and_encoder,
    };

    fn encoder_set(names: &[&str]) -> HashSet<String> {
        names.iter().map(|name| (*name).to_string()).collect()
    }

    fn args_contain_pair(args: &[String], flag: &str, value: &str) -> bool {
        args.windows(2)
            .any(|window| window[0] == flag && window[1] == value)
    }

    fn parse_ffprobe_key_value(text: &str, key: &str) -> Option<String> {
        for line in text.lines() {
            if let Some((line_key, line_value)) = line.split_once('=') {
                if line_key.trim() == key {
                    return Some(line_value.trim().to_string());
                }
            }
        }
        None
    }

    #[tokio::test]
    async fn transcode_for_preview_creates_mp4_file() {
        let input = crate::test_support::assets::ensure_sample_video()
            .await
            .expect("failed to load local sample video");

        let output =
            transcode_for_preview_with_bins("ffmpeg", "ffprobe", input.to_string_lossy().as_ref())
                .await
                .expect("preview transcode should succeed");

        assert!(std::path::Path::new(&output).exists());
        assert!(output.ends_with(".mp4"));
    }

    #[tokio::test]
    async fn transcode_for_preview_outputs_expected_codec_for_selected_encoder() {
        let input = crate::test_support::assets::ensure_sample_video()
            .await
            .expect("failed to load local sample video");
        let temp_dir = tempfile::tempdir().expect("failed to create temp dir");
        let unique_input = temp_dir.path().join("codec-check-input.mp4");
        std::fs::copy(&input, &unique_input).expect("failed to copy sample video");

        let (output, active_encoder) = transcode_for_preview_with_bins_and_encoder(
            "ffmpeg",
            "ffprobe",
            unique_input.to_string_lossy().as_ref(),
        )
        .await
        .expect("preview transcode should succeed");

        let ffprobe_output = std::process::Command::new("ffprobe")
            .args([
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=codec_name,codec_tag_string",
                "-of",
                "default=noprint_wrappers=1",
                &output,
            ])
            .output()
            .expect("failed to run ffprobe");

        assert!(
            ffprobe_output.status.success(),
            "ffprobe failed: {}",
            String::from_utf8_lossy(&ffprobe_output.stderr)
        );

        let ffprobe_text = String::from_utf8_lossy(&ffprobe_output.stdout);
        let codec_name = parse_ffprobe_key_value(&ffprobe_text, "codec_name");
        let codec_tag = parse_ffprobe_key_value(&ffprobe_text, "codec_tag_string");

        if active_encoder.ffmpeg_name.starts_with("hevc_") {
            assert_eq!(codec_name.as_deref(), Some("hevc"));
            assert_eq!(codec_tag.as_deref(), Some("hvc1"));
        } else {
            assert_eq!(active_encoder.ffmpeg_name, LIBX264.ffmpeg_name);
            assert_eq!(codec_name.as_deref(), Some("h264"));
        }
    }

    #[test]
    fn parse_ffmpeg_encoder_names_extracts_encoder_ids() {
        let sample = r#"
        Encoders:
        V..... = Video
        A..... = Audio
        ------
        V....D libx264              libx264 H.264 / AVC
        V....D hevc_videotoolbox    VideoToolbox H.265 Encoder
        V....D hevc_nvenc           NVIDIA NVENC hevc encoder
        "#;

        let parsed = parse_ffmpeg_encoder_names(sample);
        assert!(parsed.contains("libx264"));
        assert!(parsed.contains("hevc_videotoolbox"));
        assert!(parsed.contains("hevc_nvenc"));
        assert!(!parsed.contains("="));
    }

    #[test]
    fn select_preview_video_encoder_falls_back_to_libx264_when_no_hw_encoder_available() {
        let available = encoder_set(&["libx264", "h264_videotoolbox"]);
        let selected = select_preview_video_encoder(&available, "macos");
        assert_eq!(selected.ffmpeg_name, LIBX264.ffmpeg_name);
    }

    #[test]
    fn select_preview_video_encoder_prefers_macos_videotoolbox() {
        let available = encoder_set(&["libx264", "hevc_videotoolbox"]);
        let selected = select_preview_video_encoder(&available, "macos");
        assert_eq!(selected.ffmpeg_name, HEVC_VIDEOTOOLBOX.ffmpeg_name);
    }

    #[test]
    fn select_preview_video_encoder_prefers_linux_vaapi_first() {
        let available = encoder_set(&["hevc_nvenc", "hevc_vaapi", "libx264"]);
        let selected = select_preview_video_encoder(&available, "linux");
        assert_eq!(selected.ffmpeg_name, HEVC_VAAPI.ffmpeg_name);
    }

    #[test]
    fn select_preview_video_encoder_uses_windows_priority_order() {
        let available = encoder_set(&["hevc_qsv", "hevc_amf", "hevc_nvenc", "libx264"]);
        let selected = select_preview_video_encoder(&available, "windows");
        assert_eq!(selected.ffmpeg_name, HEVC_NVENC.ffmpeg_name);

        let available_without_nvenc = encoder_set(&["hevc_qsv", "hevc_amf", "libx264"]);
        let selected_without_nvenc =
            select_preview_video_encoder(&available_without_nvenc, "windows");
        assert_eq!(selected_without_nvenc.ffmpeg_name, HEVC_QSV.ffmpeg_name);
    }

    #[test]
    fn should_fallback_to_libx264_only_for_failed_hardware_encoders() {
        assert!(should_fallback_to_libx264(HEVC_VIDEOTOOLBOX, false));
        assert!(!should_fallback_to_libx264(HEVC_VIDEOTOOLBOX, true));
        assert!(!should_fallback_to_libx264(LIBX264, false));
    }

    #[test]
    fn build_preview_transcode_args_adds_safari_compatible_flags_for_videotoolbox() {
        let args = build_preview_transcode_args("input.mp4", "output.mp4", HEVC_VIDEOTOOLBOX);

        assert!(args_contain_pair(&args, "-c:v", "hevc_videotoolbox"));
        assert!(args_contain_pair(&args, "-tag:v", "hvc1"));
        assert!(args_contain_pair(&args, "-profile:v", "main"));
        assert!(args_contain_pair(&args, "-pix_fmt", "yuv420p"));
    }

    #[test]
    fn build_preview_transcode_args_keeps_libx264_specific_flags() {
        let args = build_preview_transcode_args("input.mp4", "output.mp4", LIBX264);

        assert!(args_contain_pair(&args, "-c:v", "libx264"));
        assert!(args_contain_pair(&args, "-preset", "fast"));
        assert!(args_contain_pair(&args, "-crf", "28"));
        assert!(!args_contain_pair(&args, "-tag:v", "hvc1"));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn macos_environment_prefers_videotoolbox_when_encoder_is_available() {
        let output = std::process::Command::new("ffmpeg")
            .args(["-hide_banner", "-encoders"])
            .output();

        let Ok(output) = output else {
            return;
        };

        let mut combined = String::from_utf8_lossy(&output.stdout).to_string();
        if !output.stderr.is_empty() {
            if !combined.is_empty() {
                combined.push('\n');
            }
            combined.push_str(&String::from_utf8_lossy(&output.stderr));
        }

        let parsed = parse_ffmpeg_encoder_names(&combined);
        if parsed.contains("hevc_videotoolbox") {
            let selected = select_preview_video_encoder(&parsed, "macos");
            assert_eq!(selected.ffmpeg_name, HEVC_VIDEOTOOLBOX.ffmpeg_name);
        }
    }
}
