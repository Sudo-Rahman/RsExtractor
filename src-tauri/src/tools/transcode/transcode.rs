use std::path::Path;
use std::process::Stdio;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::time::timeout;

use crate::shared::ffmpeg_progress::FfmpegProgressTracker;
use crate::shared::process::terminate_process;
use crate::shared::sleep_inhibit::SleepInhibitGuard;
use crate::shared::store::{resolve_ffmpeg_path, resolve_ffprobe_path};
use crate::shared::validation::{validate_media_path, validate_output_path};
use crate::tools::ffprobe::{get_media_duration_us_with_ffprobe, probe::probe_file_with_ffprobe};

const TRANSCODE_TIMEOUT: Duration = Duration::from_secs(7200);

#[cfg_attr(not(test), allow(dead_code))]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TranscodeProgressEvent {
    pub(crate) input_path: String,
    pub(crate) output_path: String,
    pub(crate) progress: i32,
    pub(crate) speed_bytes_per_sec: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TranscodeAdditionalArg {
    pub(crate) id: Option<String>,
    pub(crate) flag: String,
    pub(crate) value: Option<String>,
    pub(crate) enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TranscodeVideoSettings {
    pub(crate) mode: String,
    pub(crate) encoder_id: Option<String>,
    pub(crate) profile: Option<String>,
    pub(crate) level: Option<String>,
    pub(crate) pixel_format: Option<String>,
    pub(crate) quality_mode: Option<String>,
    pub(crate) crf: Option<f64>,
    pub(crate) qp: Option<i32>,
    pub(crate) bitrate_kbps: Option<u32>,
    pub(crate) preset: Option<String>,
    #[serde(default)]
    pub(crate) additional_args: Vec<TranscodeAdditionalArg>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TranscodeAudioSettings {
    pub(crate) mode: String,
    pub(crate) encoder_id: Option<String>,
    pub(crate) bitrate_kbps: Option<u32>,
    pub(crate) channels: Option<u8>,
    pub(crate) sample_rate: Option<u32>,
    #[serde(default)]
    pub(crate) additional_args: Vec<TranscodeAdditionalArg>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TranscodeSubtitleSettings {
    pub(crate) mode: String,
    pub(crate) encoder_id: Option<String>,
    #[serde(default)]
    pub(crate) additional_args: Vec<TranscodeAdditionalArg>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TranscodeRequest {
    pub(crate) input_path: String,
    pub(crate) output_path: String,
    pub(crate) container_id: String,
    pub(crate) video: TranscodeVideoSettings,
    pub(crate) audio: TranscodeAudioSettings,
    pub(crate) subtitles: TranscodeSubtitleSettings,
}

#[derive(Debug, Clone)]
struct StreamInfo {
    relative_index: usize,
    codec_name: String,
}

fn emit_transcode_progress(
    app: &tauri::AppHandle,
    input_path: &str,
    output_path: &str,
    progress: i32,
    speed_bytes_per_sec: Option<f64>,
) {
    let _ = app.emit(
        "media-transcode-progress",
        serde_json::json!({
            "inputPath": input_path,
            "outputPath": output_path,
            "progress": progress,
            "speedBytesPerSec": speed_bytes_per_sec
        }),
    );
}

fn is_text_subtitle_codec(codec: &str) -> bool {
    matches!(
        codec,
        "ass"
            | "ssa"
            | "srt"
            | "subrip"
            | "mov_text"
            | "text"
            | "ttml"
            | "webvtt"
            | "jacosub"
            | "microdvd"
    )
}

fn can_copy_subtitle_codec(container_id: &str, codec: &str) -> bool {
    matches!(
        (container_id, codec),
        ("mp4", "mov_text" | "tx3g")
            | ("mov", "mov_text" | "tx3g")
            | (
                "mkv",
                "ass" | "dvd_subtitle" | "hdmv_pgs_subtitle" | "ssa" | "srt" | "subrip" | "webvtt"
            )
            | ("webm", "webvtt")
    )
}

fn can_copy_video_codec(container_id: &str, codec: &str) -> bool {
    matches!(
        (container_id, codec),
        (
            "mp4",
            "av1" | "h264" | "hevc" | "mjpeg" | "mpeg4" | "prores"
        ) | (
            "mov",
            "av1" | "dvvideo" | "h264" | "hevc" | "mjpeg" | "mpeg4" | "prores"
        ) | (
            "mkv",
            "av1"
                | "ffv1"
                | "h264"
                | "hevc"
                | "mjpeg"
                | "mpeg2video"
                | "mpeg4"
                | "prores"
                | "theora"
                | "vp8"
                | "vp9"
        ) | ("webm", "av1" | "vp8" | "vp9")
    )
}

fn can_copy_audio_codec(container_id: &str, codec: &str) -> bool {
    matches!(
        (container_id, codec),
        (
            "mov",
            "aac"
                | "ac3"
                | "alac"
                | "eac3"
                | "mp3"
                | "pcm_f32le"
                | "pcm_f64le"
                | "pcm_s16le"
                | "pcm_s24le"
                | "pcm_s32le"
        ) | ("mp4", "aac" | "ac3" | "alac" | "eac3" | "mp3")
            | (
                "mkv",
                "aac"
                    | "ac3"
                    | "alac"
                    | "dts"
                    | "eac3"
                    | "flac"
                    | "mp2"
                    | "mp3"
                    | "opus"
                    | "pcm_f32le"
                    | "pcm_f64le"
                    | "pcm_s16le"
                    | "pcm_s24le"
                    | "pcm_s32le"
                    | "truehd"
                    | "vorbis"
            )
            | ("webm", "opus" | "vorbis")
            | ("aac", "aac")
            | ("mp3", "mp3")
            | ("flac", "flac")
            | ("opus", "opus")
            | ("ogg", "flac" | "opus" | "vorbis")
            | (
                "wav",
                "pcm_alaw"
                    | "pcm_f32le"
                    | "pcm_f64le"
                    | "pcm_mulaw"
                    | "pcm_s16le"
                    | "pcm_s24le"
                    | "pcm_s32le"
                    | "pcm_u8"
            )
    )
}

fn validate_output_path_matches_container(request: &TranscodeRequest) -> Result<(), String> {
    let Some(expected_extension) =
        super::capabilities::container_extension_for_id(&request.container_id)
    else {
        return Ok(());
    };

    let actual_extension = Path::new(&request.output_path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{}", value.to_lowercase()))
        .unwrap_or_default();

    if actual_extension != expected_extension {
        return Err(format!(
            "Output path extension {} does not match the selected container {} (expected {}). Update the output filename in the Output tab.",
            if actual_extension.is_empty() {
                "(none)"
            } else {
                actual_extension.as_str()
            },
            request.container_id.to_uppercase(),
            expected_extension
        ));
    }

    Ok(())
}

fn extract_streams_by_type(streams: &[Value], codec_type: &str) -> Vec<StreamInfo> {
    streams
        .iter()
        .filter(|stream| {
            stream
                .get("codec_type")
                .and_then(|value| value.as_str())
                .is_some_and(|value| value == codec_type)
        })
        .enumerate()
        .map(|(relative_index, stream)| StreamInfo {
            relative_index,
            codec_name: stream
                .get("codec_name")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_string(),
        })
        .collect()
}

fn has_enabled_additional_arg(additional_args: &[TranscodeAdditionalArg], flag: &str) -> bool {
    additional_args
        .iter()
        .any(|additional_arg| additional_arg.enabled && additional_arg.flag.trim() == flag)
}

fn libopus_uses_default_mapping_family(channel_layout: &str) -> bool {
    matches!(
        channel_layout,
        "mono" | "stereo" | "3.0" | "quad" | "5.0" | "5.1" | "6.1" | "7.1"
    )
}

fn should_force_libopus_mapping_family_255(request: &TranscodeRequest, streams: &[Value]) -> bool {
    if request.audio.encoder_id.as_deref() != Some("libopus")
        || request.audio.channels.is_some()
        || has_enabled_additional_arg(&request.audio.additional_args, "-mapping_family")
    {
        return false;
    }

    streams.iter().any(|stream| {
        if stream.get("codec_type").and_then(|value| value.as_str()) != Some("audio") {
            return false;
        }

        let channels = stream
            .get("channels")
            .and_then(|value| value.as_u64())
            .unwrap_or_default();
        let channel_layout = stream
            .get("channel_layout")
            .and_then(|value| value.as_str())
            .unwrap_or_default();

        channels > 2
            && !channel_layout.is_empty()
            && !libopus_uses_default_mapping_family(channel_layout)
    })
}

fn apply_safe_additional_args(
    args: &mut Vec<String>,
    additional_args: &[TranscodeAdditionalArg],
) -> Result<(), String> {
    const BLOCKED_FLAGS: &[&str] = &[
        "-i",
        "-map",
        "-progress",
        "-f",
        "-y",
        "-n",
        "-filter_complex",
        "-filter_script",
        "-vf",
        "-af",
    ];

    for additional_arg in additional_args {
        if !additional_arg.enabled {
            continue;
        }

        let flag = additional_arg.flag.trim();
        if !flag.starts_with('-') {
            return Err(format!("Invalid additional argument flag: {}", flag));
        }
        if BLOCKED_FLAGS.contains(&flag) {
            return Err(format!("Additional argument is not allowed here: {}", flag));
        }

        args.push(flag.to_string());
        if let Some(value) = additional_arg.value.as_deref() {
            if !value.trim().is_empty() {
                args.push(value.trim().to_string());
            }
        }
    }

    Ok(())
}

fn validate_libaom_cpu_used(preset: &str) -> Result<(), String> {
    let parsed = preset
        .parse::<u8>()
        .map_err(|_| "libaom-av1 preset must be an integer from 0 to 8".to_string())?;

    if parsed > 8 {
        return Err("libaom-av1 preset must be an integer from 0 to 8".to_string());
    }

    Ok(())
}

fn apply_video_preset_arg(
    args: &mut Vec<String>,
    encoder_id: &str,
    preset: &str,
) -> Result<(), String> {
    if encoder_id == "libaom-av1" {
        validate_libaom_cpu_used(preset)?;
        args.push("-cpu-used".to_string());
        args.push(preset.to_string());
        return Ok(());
    }

    args.push("-preset".to_string());
    args.push(preset.to_string());
    Ok(())
}

fn build_transcode_args(
    request: &TranscodeRequest,
    streams: &[Value],
    duration_us: Option<u64>,
) -> Result<Vec<String>, String> {
    let video_streams = extract_streams_by_type(streams, "video");
    let audio_streams = extract_streams_by_type(streams, "audio");
    let subtitle_streams = extract_streams_by_type(streams, "subtitle");

    let mut args = vec![
        "-hide_banner".to_string(),
        "-y".to_string(),
        "-i".to_string(),
        request.input_path.clone(),
    ];

    let mut mapped_any_stream = false;

    if !video_streams.is_empty() && request.video.mode != "disable" {
        args.push("-map".to_string());
        args.push("0:v:0".to_string());
        mapped_any_stream = true;
    }

    if !audio_streams.is_empty() && request.audio.mode != "disable" {
        args.push("-map".to_string());
        args.push("0:a?".to_string());
        mapped_any_stream = true;
    }

    let mut mapped_subtitle_output_indices = Vec::new();
    if !subtitle_streams.is_empty() && request.subtitles.mode != "disable" {
        for subtitle_stream in &subtitle_streams {
            args.push("-map".to_string());
            args.push(format!("0:s:{}", subtitle_stream.relative_index));
            mapped_subtitle_output_indices.push(subtitle_stream.codec_name.clone());
            mapped_any_stream = true;
        }
    }

    if !mapped_any_stream {
        return Err("No streams selected for output".to_string());
    }

    if !video_streams.is_empty() {
        match request.video.mode.as_str() {
            "copy" => {
                if let Some(unsupported_codec) = video_streams
                    .first()
                    .map(|stream| stream.codec_name.as_str())
                    .filter(|codec| !can_copy_video_codec(&request.container_id, codec))
                {
                    return Err(format!(
                        "Container {} cannot copy video codec {}. Choose video transcoding or a compatible container.",
                        request.container_id.to_uppercase(),
                        unsupported_codec
                    ));
                }

                args.push("-c:v".to_string());
                args.push("copy".to_string());
            }
            "transcode" => {
                let Some(encoder_id) = request.video.encoder_id.as_deref() else {
                    return Err(
                        "A video encoder is required when video transcoding is enabled".to_string(),
                    );
                };

                args.push("-c:v".to_string());
                args.push(encoder_id.to_string());

                if let Some(profile) = request.video.profile.as_deref() {
                    if !profile.trim().is_empty() {
                        args.push("-profile:v".to_string());
                        args.push(profile.trim().to_string());
                    }
                }

                if let Some(level) = request.video.level.as_deref() {
                    if !level.trim().is_empty() {
                        args.push("-level:v".to_string());
                        args.push(level.trim().to_string());
                    }
                }

                if let Some(pixel_format) = request.video.pixel_format.as_deref() {
                    if !pixel_format.trim().is_empty() {
                        args.push("-pix_fmt".to_string());
                        args.push(pixel_format.trim().to_string());
                    }
                }

                match request.video.quality_mode.as_deref().unwrap_or("crf") {
                    "crf" => {
                        if let Some(crf) = request.video.crf {
                            args.push("-crf".to_string());
                            args.push(crf.to_string());
                        }
                    }
                    "qp" => {
                        if let Some(qp) = request.video.qp {
                            args.push("-qp".to_string());
                            args.push(qp.to_string());
                        }
                    }
                    "bitrate" => {
                        if let Some(bitrate_kbps) = request.video.bitrate_kbps {
                            args.push("-b:v".to_string());
                            args.push(format!("{}k", bitrate_kbps));
                        }
                    }
                    _ => {}
                }

                if let Some(preset) = request.video.preset.as_deref() {
                    if !preset.trim().is_empty() {
                        apply_video_preset_arg(&mut args, encoder_id, preset.trim())?;
                    }
                }

                if matches!(request.container_id.as_str(), "mp4" | "mov")
                    && encoder_id.starts_with("hevc")
                {
                    args.push("-tag:v".to_string());
                    args.push("hvc1".to_string());
                }

                if request.container_id == "mp4" {
                    args.push("-movflags".to_string());
                    args.push("+faststart".to_string());
                }

                apply_safe_additional_args(&mut args, &request.video.additional_args)?;
            }
            "disable" => {}
            other => return Err(format!("Unsupported video mode: {}", other)),
        }
    }

    if !audio_streams.is_empty() {
        match request.audio.mode.as_str() {
            "copy" => {
                if let Some(unsupported_codec) = audio_streams
                    .iter()
                    .find(|stream| !can_copy_audio_codec(&request.container_id, &stream.codec_name))
                    .map(|stream| stream.codec_name.as_str())
                {
                    return Err(format!(
                        "Container {} cannot copy audio codec {}. Choose audio transcoding or a compatible container.",
                        request.container_id.to_uppercase(),
                        unsupported_codec
                    ));
                }

                args.push("-c:a".to_string());
                args.push("copy".to_string());
            }
            "transcode" => {
                let Some(encoder_id) = request.audio.encoder_id.as_deref() else {
                    return Err(
                        "An audio encoder is required when audio transcoding is enabled"
                            .to_string(),
                    );
                };

                args.push("-c:a".to_string());
                args.push(encoder_id.to_string());

                if should_force_libopus_mapping_family_255(request, streams) {
                    args.push("-mapping_family".to_string());
                    args.push("255".to_string());
                }

                if let Some(bitrate_kbps) = request.audio.bitrate_kbps {
                    args.push("-b:a".to_string());
                    args.push(format!("{}k", bitrate_kbps));
                }

                if let Some(channels) = request.audio.channels {
                    if channels > 0 {
                        args.push("-ac".to_string());
                        args.push(channels.to_string());
                    }
                }

                if let Some(sample_rate) = request.audio.sample_rate {
                    if sample_rate > 0 {
                        args.push("-ar".to_string());
                        args.push(sample_rate.to_string());
                    }
                }

                apply_safe_additional_args(&mut args, &request.audio.additional_args)?;
            }
            "disable" => {}
            other => return Err(format!("Unsupported audio mode: {}", other)),
        }
    }

    if !mapped_subtitle_output_indices.is_empty() {
        match request.subtitles.mode.as_str() {
            "copy" => {
                if let Some(unsupported_codec) = mapped_subtitle_output_indices
                    .iter()
                    .find(|codec| !can_copy_subtitle_codec(&request.container_id, codec))
                {
                    return Err(format!(
                        "Container {} cannot copy subtitle codec {}. Choose subtitle conversion or disable subtitles for this output format.",
                        request.container_id.to_uppercase(),
                        unsupported_codec
                    ));
                }

                for output_index in 0..mapped_subtitle_output_indices.len() {
                    args.push(format!("-c:s:{}", output_index));
                    args.push("copy".to_string());
                }
            }
            "convert_text" => {
                let Some(encoder_id) = request.subtitles.encoder_id.as_deref() else {
                    return Err(
                        "A subtitle encoder is required when subtitle conversion is enabled"
                            .to_string(),
                    );
                };

                for (output_index, codec_name) in mapped_subtitle_output_indices.iter().enumerate()
                {
                    if !is_text_subtitle_codec(codec_name)
                        && !can_copy_subtitle_codec(&request.container_id, codec_name)
                    {
                        return Err(format!(
                            "Container {} cannot keep subtitle codec {} while converting text subtitles. Disable subtitles or choose a compatible container.",
                            request.container_id.to_uppercase(),
                            codec_name
                        ));
                    }

                    args.push(format!("-c:s:{}", output_index));
                    if is_text_subtitle_codec(codec_name) {
                        args.push(encoder_id.to_string());
                    } else {
                        args.push("copy".to_string());
                    }
                }

                apply_safe_additional_args(&mut args, &request.subtitles.additional_args)?;
            }
            "disable" => {}
            other => return Err(format!("Unsupported subtitle mode: {}", other)),
        }
    }

    if let Some(duration_us) = duration_us {
        if duration_us > 0 {
            let duration_seconds = duration_us as f64 / 1_000_000.0;
            args.push("-metadata".to_string());
            args.push(format!(
                "mediaflow.duration_seconds={:.3}",
                duration_seconds
            ));
        }
    }

    args.push("-progress".to_string());
    args.push("pipe:1".to_string());
    args.push(request.output_path.clone());

    Ok(args)
}

#[cfg_attr(not(test), allow(dead_code))]
pub(crate) async fn transcode_media_with_bins(
    ffmpeg_path: &str,
    ffprobe_path: &str,
    request: &TranscodeRequest,
) -> Result<String, String> {
    validate_media_path(&request.input_path)?;
    validate_output_path(&request.output_path)?;
    validate_output_path_matches_container(request)?;

    let probe_json = probe_file_with_ffprobe(ffprobe_path, &request.input_path).await?;
    let probe_value: Value = serde_json::from_str(&probe_json)
        .map_err(|error| format!("Invalid probe JSON: {}", error))?;
    let streams = probe_value
        .get("streams")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    let duration_us = get_media_duration_us_with_ffprobe(ffprobe_path, &request.input_path)
        .await
        .ok();

    let args = build_transcode_args(request, &streams, duration_us)?;

    let output = timeout(
        TRANSCODE_TIMEOUT,
        Command::new(ffmpeg_path).args(&args).output(),
    )
    .await
    .map_err(|_| {
        format!(
            "Transcode timeout after {} seconds",
            TRANSCODE_TIMEOUT.as_secs()
        )
    })?
    .map_err(|error| format!("Failed to execute ffmpeg: {}", error))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Transcode failed: {}", stderr.trim()));
    }

    if !Path::new(&request.output_path).exists() {
        return Err("Transcode failed: output file not created".to_string());
    }

    Ok(request.output_path.clone())
}

#[tauri::command]
pub(crate) async fn transcode_media(
    app: tauri::AppHandle,
    request: TranscodeRequest,
) -> Result<String, String> {
    validate_media_path(&request.input_path)?;
    validate_output_path(&request.output_path)?;
    validate_output_path_matches_container(&request)?;

    let _sleep_guard = SleepInhibitGuard::try_acquire("Media transcoding").ok();
    let ffmpeg_path = resolve_ffmpeg_path(&app)?;
    let ffprobe_path = resolve_ffprobe_path(&app)?;

    let probe_json = probe_file_with_ffprobe(&ffprobe_path, &request.input_path).await?;
    let probe_value: Value = serde_json::from_str(&probe_json)
        .map_err(|error| format!("Invalid probe JSON: {}", error))?;
    let streams = probe_value
        .get("streams")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    let duration_us = get_media_duration_us_with_ffprobe(&ffprobe_path, &request.input_path)
        .await
        .ok();
    let args = build_transcode_args(&request, &streams, duration_us)?;

    let mut child = Command::new(&ffmpeg_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Failed to start ffmpeg: {}", error))?;

    emit_transcode_progress(&app, &request.input_path, &request.output_path, 0, None);

    if let Some(pid) = child.id() {
        if let Ok(mut guard) = super::state::TRANSCODE_PROCESS_IDS.lock() {
            guard.insert(request.input_path.clone(), pid);
        }
    }

    if let Ok(mut guard) = super::state::TRANSCODE_OUTPUT_PATHS.lock() {
        guard.insert(request.input_path.clone(), request.output_path.clone());
    }

    if let Some(stdout) = child.stdout.take() {
        let app_for_progress = app.clone();
        let input_path_for_progress = request.input_path.clone();
        let output_path_for_progress = request.output_path.clone();

        tokio::spawn(async move {
            let mut tracker = FfmpegProgressTracker::new(duration_us);
            let mut last_progress = 0;
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();

            while let Ok(Some(line)) = lines.next_line().await {
                if let Some(update) = tracker.handle_line(&line) {
                    if let Some(progress) = update.progress {
                        last_progress = progress;
                    }

                    emit_transcode_progress(
                        &app_for_progress,
                        &input_path_for_progress,
                        &output_path_for_progress,
                        last_progress,
                        update.speed_bytes_per_sec,
                    );
                }
            }
        });
    }

    let input_path_for_cleanup = request.input_path.clone();
    let output_path_for_cleanup = request.output_path.clone();
    let child_pid = child.id();
    let output = match timeout(TRANSCODE_TIMEOUT, child.wait_with_output()).await {
        Ok(result) => result.map_err(|error| {
            if let Ok(mut guard) = super::state::TRANSCODE_PROCESS_IDS.lock() {
                guard.remove(&input_path_for_cleanup);
            }
            if let Ok(mut guard) = super::state::TRANSCODE_OUTPUT_PATHS.lock() {
                guard.remove(&input_path_for_cleanup);
            }
            let _ = std::fs::remove_file(&output_path_for_cleanup);
            format!("Failed to execute ffmpeg: {}", error)
        })?,
        Err(_) => {
            if let Some(pid) = child_pid {
                terminate_process(pid);
                tokio::time::sleep(Duration::from_millis(200)).await;
            }

            if let Ok(mut guard) = super::state::TRANSCODE_PROCESS_IDS.lock() {
                guard.remove(&input_path_for_cleanup);
            }
            if let Ok(mut guard) = super::state::TRANSCODE_OUTPUT_PATHS.lock() {
                guard.remove(&input_path_for_cleanup);
            }
            let _ = std::fs::remove_file(&output_path_for_cleanup);
            return Err(format!(
                "Transcode timeout after {} seconds",
                TRANSCODE_TIMEOUT.as_secs()
            ));
        }
    };

    if let Ok(mut guard) = super::state::TRANSCODE_PROCESS_IDS.lock() {
        guard.remove(&request.input_path);
    }
    if let Ok(mut guard) = super::state::TRANSCODE_OUTPUT_PATHS.lock() {
        guard.remove(&request.input_path);
    }

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let _ = std::fs::remove_file(&request.output_path);
        return Err(format!("Transcode failed: {}", stderr.trim()));
    }

    if !Path::new(&request.output_path).exists() {
        return Err("Transcode failed: output file not created".to_string());
    }

    emit_transcode_progress(&app, &request.input_path, &request.output_path, 100, None);

    Ok(request.output_path)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        TranscodeAdditionalArg, TranscodeAudioSettings, TranscodeRequest,
        TranscodeSubtitleSettings, TranscodeVideoSettings, build_transcode_args,
        transcode_media_with_bins,
    };

    fn build_request(output_path: &str) -> TranscodeRequest {
        TranscodeRequest {
            input_path: "/tmp/input.mp4".to_string(),
            output_path: output_path.to_string(),
            container_id: "mp4".to_string(),
            video: TranscodeVideoSettings {
                mode: "transcode".to_string(),
                encoder_id: Some("libx264".to_string()),
                profile: Some("high".to_string()),
                level: Some("4.1".to_string()),
                pixel_format: Some("yuv420p".to_string()),
                quality_mode: Some("crf".to_string()),
                crf: Some(20.0),
                qp: None,
                bitrate_kbps: None,
                preset: Some("medium".to_string()),
                additional_args: Vec::new(),
            },
            audio: TranscodeAudioSettings {
                mode: "transcode".to_string(),
                encoder_id: Some("aac".to_string()),
                bitrate_kbps: Some(160),
                channels: Some(2),
                sample_rate: Some(48000),
                additional_args: Vec::new(),
            },
            subtitles: TranscodeSubtitleSettings {
                mode: "convert_text".to_string(),
                encoder_id: Some("mov_text".to_string()),
                additional_args: Vec::new(),
            },
        }
    }

    #[test]
    fn build_transcode_args_includes_main_video_audio_and_safe_subtitle_handling() {
        let mut request = build_request("/tmp/output.mkv");
        request.container_id = "mkv".to_string();
        request.subtitles.encoder_id = Some("srt".to_string());
        let streams = vec![
            json!({ "codec_type": "video", "codec_name": "h264" }),
            json!({ "codec_type": "audio", "codec_name": "aac" }),
            json!({ "codec_type": "subtitle", "codec_name": "subrip" }),
            json!({ "codec_type": "subtitle", "codec_name": "hdmv_pgs_subtitle" }),
        ];

        let args =
            build_transcode_args(&request, &streams, Some(10_000_000)).expect("args should build");

        assert!(args.windows(2).any(|window| window == ["-c:v", "libx264"]));
        assert!(args.windows(2).any(|window| window == ["-c:a", "aac"]));
        assert!(args.windows(2).any(|window| window == ["-c:s:0", "srt"]));
        assert!(args.windows(2).any(|window| window == ["-c:s:1", "copy"]));
        assert!(
            args.windows(2)
                .any(|window| window == ["-progress", "pipe:1"])
        );
    }

    #[test]
    fn build_transcode_args_rejects_blocked_additional_args() {
        let mut request = build_request("/tmp/output.mp4");
        request.video.additional_args = vec![TranscodeAdditionalArg {
            id: None,
            flag: "-map".to_string(),
            value: Some("0".to_string()),
            enabled: true,
        }];
        let streams = vec![json!({ "codec_type": "video", "codec_name": "h264" })];

        let error =
            build_transcode_args(&request, &streams, None).expect_err("blocked arg should fail");
        assert!(error.contains("not allowed"));
    }

    #[test]
    fn build_transcode_args_rejects_copying_subrip_subtitles_into_mp4() {
        let mut request = build_request("/tmp/output.mp4");
        request.subtitles.mode = "copy".to_string();
        request.subtitles.encoder_id = None;
        let streams = vec![
            json!({ "codec_type": "video", "codec_name": "h264" }),
            json!({ "codec_type": "subtitle", "codec_name": "subrip" }),
        ];

        let error = build_transcode_args(&request, &streams, None)
            .expect_err("subrip copy to mp4 should fail");
        assert!(error.contains("cannot copy subtitle codec"));
    }

    #[test]
    fn build_transcode_args_rejects_copying_h264_video_into_webm() {
        let mut request = build_request("/tmp/output.webm");
        request.container_id = "webm".to_string();
        request.video.mode = "copy".to_string();
        request.audio.mode = "disable".to_string();
        request.subtitles.mode = "disable".to_string();
        let streams = vec![json!({ "codec_type": "video", "codec_name": "h264" })];

        let error = build_transcode_args(&request, &streams, None)
            .expect_err("h264 copy to webm should fail");
        assert!(error.contains("cannot copy video codec"));
    }

    #[test]
    fn build_transcode_args_rejects_copying_aac_audio_into_webm() {
        let mut request = build_request("/tmp/output.webm");
        request.container_id = "webm".to_string();
        request.video.mode = "disable".to_string();
        request.audio.mode = "copy".to_string();
        request.subtitles.mode = "disable".to_string();
        let streams = vec![json!({ "codec_type": "audio", "codec_name": "aac" })];

        let error = build_transcode_args(&request, &streams, None)
            .expect_err("aac copy to webm should fail");
        assert!(error.contains("cannot copy audio codec"));
    }

    #[test]
    fn build_transcode_args_maps_libaom_preset_to_cpu_used() {
        let mut request = build_request("/tmp/output.mkv");
        request.container_id = "mkv".to_string();
        request.video.encoder_id = Some("libaom-av1".to_string());
        request.video.preset = Some("4".to_string());
        let streams = vec![json!({ "codec_type": "video", "codec_name": "h264" })];

        let args =
            build_transcode_args(&request, &streams, None).expect("libaom args should build");

        assert!(args.windows(2).any(|window| window == ["-cpu-used", "4"]));
        assert!(!args.iter().any(|arg| arg == "-preset"));
    }

    #[test]
    fn build_transcode_args_rejects_invalid_libaom_preset() {
        let mut request = build_request("/tmp/output.mkv");
        request.container_id = "mkv".to_string();
        request.video.encoder_id = Some("libaom-av1".to_string());
        request.video.preset = Some("9".to_string());
        let streams = vec![json!({ "codec_type": "video", "codec_name": "h264" })];

        let error = build_transcode_args(&request, &streams, None)
            .expect_err("invalid libaom preset should fail");

        assert!(error.contains("libaom-av1 preset must be an integer from 0 to 8"));
    }

    #[test]
    fn build_transcode_args_sets_mapping_family_255_for_unsupported_libopus_layouts() {
        let mut request = build_request("/tmp/output.opus");
        request.container_id = "opus".to_string();
        request.video.mode = "disable".to_string();
        request.audio.encoder_id = Some("libopus".to_string());
        request.subtitles.mode = "disable".to_string();
        request.audio.channels = None;

        let streams = vec![json!({
            "codec_type": "audio",
            "codec_name": "flac",
            "channels": 6,
            "channel_layout": "5.1(side)"
        })];

        let args =
            build_transcode_args(&request, &streams, None).expect("libopus args should build");

        assert!(
            args.windows(2)
                .any(|window| window == ["-mapping_family", "255"])
        );
    }

    #[test]
    fn build_transcode_args_keeps_default_mapping_family_for_supported_libopus_layouts() {
        let mut request = build_request("/tmp/output.opus");
        request.container_id = "opus".to_string();
        request.video.mode = "disable".to_string();
        request.audio.encoder_id = Some("libopus".to_string());
        request.subtitles.mode = "disable".to_string();
        request.audio.channels = None;

        let streams = vec![json!({
            "codec_type": "audio",
            "codec_name": "flac",
            "channels": 6,
            "channel_layout": "5.1"
        })];

        let args =
            build_transcode_args(&request, &streams, None).expect("libopus args should build");

        assert!(!args.iter().any(|arg| arg == "-mapping_family"));
    }

    #[test]
    fn build_transcode_args_does_not_force_mapping_family_when_channels_are_overridden() {
        let mut request = build_request("/tmp/output.opus");
        request.container_id = "opus".to_string();
        request.video.mode = "disable".to_string();
        request.audio.encoder_id = Some("libopus".to_string());
        request.subtitles.mode = "disable".to_string();
        request.audio.channels = Some(6);

        let streams = vec![json!({
            "codec_type": "audio",
            "codec_name": "flac",
            "channels": 6,
            "channel_layout": "5.1(side)"
        })];

        let args =
            build_transcode_args(&request, &streams, None).expect("libopus args should build");

        assert!(!args.iter().any(|arg| arg == "-mapping_family"));
        assert!(args.windows(2).any(|window| window == ["-ac", "6"]));
    }

    #[test]
    fn build_transcode_args_keeps_svtav1_preset_mapping() {
        let mut request = build_request("/tmp/output.mkv");
        request.container_id = "mkv".to_string();
        request.video.encoder_id = Some("libsvtav1".to_string());
        request.video.preset = Some("6".to_string());
        let streams = vec![json!({ "codec_type": "video", "codec_name": "h264" })];

        let args =
            build_transcode_args(&request, &streams, None).expect("svtav1 args should build");

        assert!(args.windows(2).any(|window| window == ["-preset", "6"]));
        assert!(!args.iter().any(|arg| arg == "-cpu-used"));
    }

    #[test]
    fn transcode_request_rejects_output_extension_mismatch() {
        let request = build_request("/tmp/output.mkv");

        let error = super::validate_output_path_matches_container(&request)
            .expect_err("container and extension mismatch should fail");
        assert!(error.contains("does not match the selected container"));
    }

    #[tokio::test]
    async fn transcode_media_with_bins_generates_output_file() {
        let input = crate::test_support::assets::ensure_sample_video()
            .await
            .expect("failed to load local sample video");
        let temp = tempfile::tempdir().expect("failed to create tempdir");
        let output = temp.path().join("sample-transcoded.mp4");

        let mut request = build_request(output.to_string_lossy().as_ref());
        request.input_path = input.to_string_lossy().to_string();

        let result_path = transcode_media_with_bins("ffmpeg", "ffprobe", &request)
            .await
            .expect("transcode should succeed");

        assert_eq!(result_path, output.to_string_lossy().to_string());
        assert!(output.exists());
    }
}
