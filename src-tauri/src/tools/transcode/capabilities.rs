use std::collections::{BTreeSet, HashSet};

use serde::{Deserialize, Serialize};
use tokio::process::Command;

use crate::shared::store::resolve_ffmpeg_path;
use crate::tools::media_metadata::{ContainerMetadataSchema, metadata_schema_for_container};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TranscodeCapabilities {
    pub(crate) ffmpeg_version: String,
    pub(crate) hwaccels: Vec<String>,
    pub(crate) containers: Vec<TranscodeContainerCapability>,
    pub(crate) video_encoders: Vec<TranscodeVideoEncoderCapability>,
    pub(crate) audio_encoders: Vec<TranscodeAudioEncoderCapability>,
    pub(crate) subtitle_encoders: Vec<TranscodeSubtitleEncoderCapability>,
    pub(crate) default_analysis_frame_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TranscodeContainerCapability {
    pub(crate) id: String,
    pub(crate) label: String,
    pub(crate) extension: String,
    pub(crate) kind: String,
    pub(crate) muxer_name: String,
    pub(crate) supported_video_encoder_ids: Vec<String>,
    pub(crate) supported_audio_encoder_ids: Vec<String>,
    pub(crate) supported_subtitle_encoder_ids: Vec<String>,
    pub(crate) supported_subtitle_modes: Vec<String>,
    pub(crate) default_video_encoder_id: Option<String>,
    pub(crate) default_audio_encoder_id: Option<String>,
    pub(crate) default_subtitle_encoder_id: Option<String>,
    pub(crate) metadata_schema: ContainerMetadataSchema,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TranscodeVideoEncoderCapability {
    pub(crate) id: String,
    pub(crate) codec: String,
    pub(crate) label: String,
    pub(crate) is_hardware: bool,
    pub(crate) supported_pixel_formats: Vec<String>,
    pub(crate) supported_profiles: Vec<String>,
    pub(crate) supported_levels: Vec<String>,
    pub(crate) supported_bit_depths: Vec<u8>,
    pub(crate) supports_preset: bool,
    pub(crate) supports_crf: bool,
    pub(crate) supports_qp: bool,
    pub(crate) supports_bitrate: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TranscodeAudioEncoderCapability {
    pub(crate) id: String,
    pub(crate) codec: String,
    pub(crate) label: String,
    pub(crate) supports_bitrate: bool,
    pub(crate) supports_channels: bool,
    pub(crate) supports_sample_rate: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TranscodeSubtitleEncoderCapability {
    pub(crate) id: String,
    pub(crate) codec: String,
    pub(crate) label: String,
    pub(crate) kind: String,
}

#[derive(Debug, Clone, Copy)]
struct KnownVideoEncoder {
    id: &'static str,
    codec: &'static str,
    label: &'static str,
    is_hardware: bool,
    supported_container_ids: &'static [&'static str],
}

#[derive(Debug, Clone, Copy)]
struct KnownAudioEncoder {
    id: &'static str,
    codec: &'static str,
    label: &'static str,
    supported_container_ids: &'static [&'static str],
}

#[derive(Debug, Clone, Copy)]
struct KnownSubtitleEncoder {
    id: &'static str,
    codec: &'static str,
    label: &'static str,
    kind: &'static str,
    supported_container_ids: &'static [&'static str],
}

#[derive(Debug, Clone, Copy)]
struct KnownContainer {
    id: &'static str,
    label: &'static str,
    extension: &'static str,
    kind: &'static str,
    muxer_name: &'static str,
    default_video_encoder_priority: &'static [&'static str],
    default_audio_encoder_priority: &'static [&'static str],
    default_subtitle_encoder_priority: &'static [&'static str],
}

const DEFAULT_ANALYSIS_FRAME_COUNT: usize = 6;

const KNOWN_VIDEO_ENCODERS: &[KnownVideoEncoder] = &[
    KnownVideoEncoder {
        id: "h264_videotoolbox",
        codec: "h264",
        label: "H.264 (VideoToolbox)",
        is_hardware: true,
        supported_container_ids: &["mp4", "mkv", "mov"],
    },
    KnownVideoEncoder {
        id: "hevc_videotoolbox",
        codec: "hevc",
        label: "HEVC (VideoToolbox)",
        is_hardware: true,
        supported_container_ids: &["mp4", "mkv", "mov"],
    },
    KnownVideoEncoder {
        id: "libx264",
        codec: "h264",
        label: "H.264 (libx264)",
        is_hardware: false,
        supported_container_ids: &["mp4", "mkv", "mov"],
    },
    KnownVideoEncoder {
        id: "libx265",
        codec: "hevc",
        label: "HEVC (libx265)",
        is_hardware: false,
        supported_container_ids: &["mp4", "mkv", "mov"],
    },
    KnownVideoEncoder {
        id: "libsvtav1",
        codec: "av1",
        label: "AV1 (SVT-AV1)",
        is_hardware: false,
        supported_container_ids: &["mp4", "mkv"],
    },
    KnownVideoEncoder {
        id: "libaom-av1",
        codec: "av1",
        label: "AV1 (libaom)",
        is_hardware: false,
        supported_container_ids: &["mp4", "mkv"],
    },
    KnownVideoEncoder {
        id: "libvpx-vp9",
        codec: "vp9",
        label: "VP9 (libvpx)",
        is_hardware: false,
        supported_container_ids: &["webm", "mkv"],
    },
    KnownVideoEncoder {
        id: "prores_ks",
        codec: "prores",
        label: "Apple ProRes (prores_ks)",
        is_hardware: false,
        supported_container_ids: &["mov", "mkv"],
    },
    KnownVideoEncoder {
        id: "prores_videotoolbox",
        codec: "prores",
        label: "Apple ProRes (VideoToolbox)",
        is_hardware: true,
        supported_container_ids: &["mov"],
    },
];

const KNOWN_AUDIO_ENCODERS: &[KnownAudioEncoder] = &[
    KnownAudioEncoder {
        id: "aac",
        codec: "aac",
        label: "AAC",
        supported_container_ids: &["mp4", "mkv", "mov", "aac"],
    },
    KnownAudioEncoder {
        id: "aac_at",
        codec: "aac",
        label: "AAC (AudioToolbox)",
        supported_container_ids: &["mp4", "mkv", "mov", "aac"],
    },
    KnownAudioEncoder {
        id: "libopus",
        codec: "opus",
        label: "Opus",
        supported_container_ids: &["mkv", "webm", "opus", "ogg"],
    },
    KnownAudioEncoder {
        id: "libvorbis",
        codec: "vorbis",
        label: "Vorbis",
        supported_container_ids: &["mkv", "webm", "ogg"],
    },
    KnownAudioEncoder {
        id: "libmp3lame",
        codec: "mp3",
        label: "MP3 (LAME)",
        supported_container_ids: &["mkv", "mp3"],
    },
    KnownAudioEncoder {
        id: "flac",
        codec: "flac",
        label: "FLAC",
        supported_container_ids: &["mkv", "flac"],
    },
    KnownAudioEncoder {
        id: "pcm_s16le",
        codec: "pcm_s16le",
        label: "PCM 16-bit",
        supported_container_ids: &["mkv", "wav"],
    },
];

const KNOWN_SUBTITLE_ENCODERS: &[KnownSubtitleEncoder] = &[
    KnownSubtitleEncoder {
        id: "mov_text",
        codec: "mov_text",
        label: "MP4 Timed Text",
        kind: "text",
        supported_container_ids: &["mp4", "mov"],
    },
    KnownSubtitleEncoder {
        id: "srt",
        codec: "srt",
        label: "SubRip (SRT)",
        kind: "text",
        supported_container_ids: &["mkv"],
    },
    KnownSubtitleEncoder {
        id: "ass",
        codec: "ass",
        label: "ASS",
        kind: "text",
        supported_container_ids: &["mkv"],
    },
    KnownSubtitleEncoder {
        id: "webvtt",
        codec: "webvtt",
        label: "WebVTT",
        kind: "text",
        supported_container_ids: &["webm"],
    },
];

const KNOWN_CONTAINERS: &[KnownContainer] = &[
    KnownContainer {
        id: "mp4",
        label: "MP4",
        extension: ".mp4",
        kind: "video",
        muxer_name: "mp4",
        default_video_encoder_priority: &[
            "hevc_videotoolbox",
            "h264_videotoolbox",
            "libx265",
            "libx264",
        ],
        default_audio_encoder_priority: &["aac_at", "aac"],
        default_subtitle_encoder_priority: &["mov_text"],
    },
    KnownContainer {
        id: "mkv",
        label: "MKV",
        extension: ".mkv",
        kind: "video",
        muxer_name: "matroska",
        default_video_encoder_priority: &[
            "hevc_videotoolbox",
            "h264_videotoolbox",
            "libx265",
            "libx264",
            "libsvtav1",
            "libaom-av1",
            "libvpx-vp9",
        ],
        default_audio_encoder_priority: &[
            "libopus",
            "flac",
            "libvorbis",
            "aac_at",
            "aac",
            "libmp3lame",
        ],
        default_subtitle_encoder_priority: &["srt", "ass"],
    },
    KnownContainer {
        id: "mov",
        label: "MOV",
        extension: ".mov",
        kind: "video",
        muxer_name: "mov",
        default_video_encoder_priority: &[
            "hevc_videotoolbox",
            "h264_videotoolbox",
            "libx265",
            "libx264",
            "prores_videotoolbox",
            "prores_ks",
        ],
        default_audio_encoder_priority: &["aac_at", "aac"],
        default_subtitle_encoder_priority: &["mov_text"],
    },
    KnownContainer {
        id: "webm",
        label: "WebM",
        extension: ".webm",
        kind: "video",
        muxer_name: "webm",
        default_video_encoder_priority: &["libvpx-vp9", "libsvtav1", "libaom-av1"],
        default_audio_encoder_priority: &["libopus", "libvorbis"],
        default_subtitle_encoder_priority: &["webvtt"],
    },
    KnownContainer {
        id: "aac",
        label: "AAC",
        extension: ".aac",
        kind: "audio",
        muxer_name: "adts",
        default_video_encoder_priority: &[],
        default_audio_encoder_priority: &["aac_at", "aac"],
        default_subtitle_encoder_priority: &[],
    },
    KnownContainer {
        id: "mp3",
        label: "MP3",
        extension: ".mp3",
        kind: "audio",
        muxer_name: "mp3",
        default_video_encoder_priority: &[],
        default_audio_encoder_priority: &["libmp3lame"],
        default_subtitle_encoder_priority: &[],
    },
    KnownContainer {
        id: "flac",
        label: "FLAC",
        extension: ".flac",
        kind: "audio",
        muxer_name: "flac",
        default_video_encoder_priority: &[],
        default_audio_encoder_priority: &["flac"],
        default_subtitle_encoder_priority: &[],
    },
    KnownContainer {
        id: "opus",
        label: "Opus",
        extension: ".opus",
        kind: "audio",
        muxer_name: "opus",
        default_video_encoder_priority: &[],
        default_audio_encoder_priority: &["libopus"],
        default_subtitle_encoder_priority: &[],
    },
    KnownContainer {
        id: "ogg",
        label: "Ogg",
        extension: ".ogg",
        kind: "audio",
        muxer_name: "ogg",
        default_video_encoder_priority: &[],
        default_audio_encoder_priority: &["libvorbis", "libopus"],
        default_subtitle_encoder_priority: &[],
    },
    KnownContainer {
        id: "wav",
        label: "WAV",
        extension: ".wav",
        kind: "audio",
        muxer_name: "wav",
        default_video_encoder_priority: &[],
        default_audio_encoder_priority: &["pcm_s16le"],
        default_subtitle_encoder_priority: &[],
    },
];

#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn container_extension_for_id(container_id: &str) -> Option<&'static str> {
    KNOWN_CONTAINERS
        .iter()
        .find(|container| container.id == container_id)
        .map(|container| container.extension)
}

async fn run_ffmpeg_command(ffmpeg_path: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(ffmpeg_path)
        .args(args)
        .output()
        .await
        .map_err(|error| format!("Failed to run ffmpeg {}: {}", args.join(" "), error))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "ffmpeg {} failed: {}",
            args.join(" "),
            stderr.trim()
        ));
    }

    let mut combined = String::from_utf8_lossy(&output.stdout).to_string();
    if !output.stderr.is_empty() {
        if !combined.is_empty() {
            combined.push('\n');
        }
        combined.push_str(&String::from_utf8_lossy(&output.stderr));
    }
    Ok(combined)
}

fn parse_ffmpeg_version(output: &str) -> String {
    output
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(2))
        .unwrap_or("Unknown")
        .to_string()
}

pub(crate) fn parse_ffmpeg_encoder_names(output: &str) -> HashSet<String> {
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

pub(crate) fn parse_ffmpeg_muxer_names(output: &str) -> HashSet<String> {
    let mut muxers = HashSet::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('-') || trimmed.starts_with("Formats:") {
            continue;
        }

        let mut parts = trimmed.split_whitespace();
        let Some(flags) = parts.next() else {
            continue;
        };
        if !flags.contains('E') {
            continue;
        }

        if let Some(name) = parts.next() {
            if let Some(primary) = name.split(',').next() {
                muxers.insert(primary.to_string());
            }
        }
    }

    muxers
}

pub(crate) fn parse_ffmpeg_hwaccel_names(output: &str) -> Vec<String> {
    output
        .lines()
        .skip_while(|line| !line.trim().starts_with("Hardware acceleration methods:"))
        .skip(1)
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                return None;
            }
            Some(trimmed.to_string())
        })
        .collect()
}

fn parse_supported_pixel_formats(output: &str) -> Vec<String> {
    output
        .lines()
        .find_map(|line| {
            line.split_once("Supported pixel formats:")
                .map(|(_, values)| {
                    values
                        .split_whitespace()
                        .map(|value| value.trim().to_string())
                        .collect::<Vec<_>>()
                })
        })
        .unwrap_or_default()
}

fn parse_option_enum_values(output: &str, option_name: &str) -> Vec<String> {
    let mut results = Vec::new();
    let mut in_option = false;
    let option_prefix = format!("-{}", option_name);

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if in_option {
                break;
            }
            continue;
        }

        if trimmed.starts_with('-') {
            if trimmed.starts_with(&option_prefix) {
                in_option = true;
                continue;
            }

            if in_option {
                break;
            }
            continue;
        }

        if in_option {
            let mut parts = trimmed.split_whitespace();
            if let Some(value) = parts.next() {
                results.push(value.to_string());
            }
        }
    }

    results
}

fn help_supports_flag(output: &str, flag: &str) -> bool {
    output.lines().any(|line| line.contains(flag))
}

fn video_encoder_supports_bitrate(help: &str) -> bool {
    ["-crf", "-qp", "-constant_bit_rate"]
        .iter()
        .any(|flag| help_supports_flag(help, flag))
}

pub(crate) fn derive_bit_depths_from_pixel_formats(pixel_formats: &[String]) -> Vec<u8> {
    let mut depths = BTreeSet::new();

    for pixel_format in pixel_formats {
        if pixel_format.contains("p010") || pixel_format.contains("10") {
            depths.insert(10);
            continue;
        }
        if pixel_format.contains("12") {
            depths.insert(12);
            continue;
        }
        depths.insert(8);
    }

    depths.into_iter().collect()
}

async fn build_video_encoder_capabilities(
    ffmpeg_path: &str,
    available_encoders: &HashSet<String>,
) -> Vec<TranscodeVideoEncoderCapability> {
    let mut capabilities = Vec::new();

    for encoder in KNOWN_VIDEO_ENCODERS {
        if !available_encoders.contains(encoder.id) {
            continue;
        }

        let help = run_ffmpeg_command(
            ffmpeg_path,
            &["-hide_banner", "-h", &format!("encoder={}", encoder.id)],
        )
        .await
        .unwrap_or_default();
        let supported_pixel_formats = parse_supported_pixel_formats(&help);
        let supported_profiles = parse_option_enum_values(&help, "profile");
        let supported_levels = parse_option_enum_values(&help, "level");
        let supports_crf = help_supports_flag(&help, "-crf");
        let supports_qp = help_supports_flag(&help, "-qp");

        capabilities.push(TranscodeVideoEncoderCapability {
            id: encoder.id.to_string(),
            codec: encoder.codec.to_string(),
            label: encoder.label.to_string(),
            is_hardware: encoder.is_hardware,
            supported_pixel_formats: supported_pixel_formats.clone(),
            supported_profiles,
            supported_levels,
            supported_bit_depths: derive_bit_depths_from_pixel_formats(&supported_pixel_formats),
            supports_preset: help_supports_flag(&help, "-preset"),
            supports_crf,
            supports_qp,
            supports_bitrate: video_encoder_supports_bitrate(&help),
        });
    }

    capabilities
}

async fn build_audio_encoder_capabilities(
    ffmpeg_path: &str,
    available_encoders: &HashSet<String>,
) -> Vec<TranscodeAudioEncoderCapability> {
    let mut capabilities = Vec::new();

    for encoder in KNOWN_AUDIO_ENCODERS {
        if !available_encoders.contains(encoder.id) {
            continue;
        }

        let _help = run_ffmpeg_command(
            ffmpeg_path,
            &["-hide_banner", "-h", &format!("encoder={}", encoder.id)],
        )
        .await
        .unwrap_or_default();

        capabilities.push(TranscodeAudioEncoderCapability {
            id: encoder.id.to_string(),
            codec: encoder.codec.to_string(),
            label: encoder.label.to_string(),
            supports_bitrate: encoder.codec != "pcm_s16le",
            supports_channels: true,
            supports_sample_rate: true,
        });
    }

    capabilities
}

async fn build_subtitle_encoder_capabilities(
    ffmpeg_path: &str,
    available_encoders: &HashSet<String>,
) -> Vec<TranscodeSubtitleEncoderCapability> {
    let mut capabilities = Vec::new();

    for encoder in KNOWN_SUBTITLE_ENCODERS {
        if !available_encoders.contains(encoder.id) {
            continue;
        }

        let _ = run_ffmpeg_command(
            ffmpeg_path,
            &["-hide_banner", "-h", &format!("encoder={}", encoder.id)],
        )
        .await
        .unwrap_or_default();

        capabilities.push(TranscodeSubtitleEncoderCapability {
            id: encoder.id.to_string(),
            codec: encoder.codec.to_string(),
            label: encoder.label.to_string(),
            kind: encoder.kind.to_string(),
        });
    }

    capabilities
}

fn select_default_encoder_id<'a>(
    available_ids: &'a HashSet<String>,
    priorities: &[&str],
) -> Option<String> {
    priorities
        .iter()
        .find(|candidate| available_ids.contains(**candidate))
        .map(|candidate| (*candidate).to_string())
}

fn build_container_capabilities(
    available_muxers: &HashSet<String>,
    video_encoders: &[TranscodeVideoEncoderCapability],
    audio_encoders: &[TranscodeAudioEncoderCapability],
    subtitle_encoders: &[TranscodeSubtitleEncoderCapability],
) -> Vec<TranscodeContainerCapability> {
    let video_encoder_ids = video_encoders
        .iter()
        .map(|encoder| encoder.id.clone())
        .collect::<HashSet<_>>();
    let audio_encoder_ids = audio_encoders
        .iter()
        .map(|encoder| encoder.id.clone())
        .collect::<HashSet<_>>();
    let subtitle_encoder_ids = subtitle_encoders
        .iter()
        .map(|encoder| encoder.id.clone())
        .collect::<HashSet<_>>();

    KNOWN_CONTAINERS
        .iter()
        .filter(|container| available_muxers.contains(container.muxer_name))
        .map(|container| {
            let supported_video_encoder_ids = KNOWN_VIDEO_ENCODERS
                .iter()
                .filter(|encoder| {
                    encoder.supported_container_ids.contains(&container.id)
                        && video_encoder_ids.contains(encoder.id)
                })
                .map(|encoder| encoder.id.to_string())
                .collect::<Vec<_>>();
            let supported_audio_encoder_ids = KNOWN_AUDIO_ENCODERS
                .iter()
                .filter(|encoder| {
                    encoder.supported_container_ids.contains(&container.id)
                        && audio_encoder_ids.contains(encoder.id)
                })
                .map(|encoder| encoder.id.to_string())
                .collect::<Vec<_>>();
            let supported_subtitle_encoder_ids = KNOWN_SUBTITLE_ENCODERS
                .iter()
                .filter(|encoder| {
                    encoder.supported_container_ids.contains(&container.id)
                        && subtitle_encoder_ids.contains(encoder.id)
                })
                .map(|encoder| encoder.id.to_string())
                .collect::<Vec<_>>();

            let mut supported_subtitle_modes = vec!["disable".to_string()];
            if container.kind == "video" {
                supported_subtitle_modes.push("copy".to_string());
                if !supported_subtitle_encoder_ids.is_empty() {
                    supported_subtitle_modes.push("convert_text".to_string());
                }
            }

            TranscodeContainerCapability {
                id: container.id.to_string(),
                label: container.label.to_string(),
                extension: container.extension.to_string(),
                kind: container.kind.to_string(),
                muxer_name: container.muxer_name.to_string(),
                supported_video_encoder_ids: supported_video_encoder_ids.clone(),
                supported_audio_encoder_ids: supported_audio_encoder_ids.clone(),
                supported_subtitle_encoder_ids: supported_subtitle_encoder_ids.clone(),
                supported_subtitle_modes,
                default_video_encoder_id: select_default_encoder_id(
                    &supported_video_encoder_ids
                        .iter()
                        .cloned()
                        .collect::<HashSet<_>>(),
                    container.default_video_encoder_priority,
                ),
                default_audio_encoder_id: select_default_encoder_id(
                    &supported_audio_encoder_ids
                        .iter()
                        .cloned()
                        .collect::<HashSet<_>>(),
                    container.default_audio_encoder_priority,
                ),
                default_subtitle_encoder_id: select_default_encoder_id(
                    &supported_subtitle_encoder_ids
                        .iter()
                        .cloned()
                        .collect::<HashSet<_>>(),
                    container.default_subtitle_encoder_priority,
                ),
                metadata_schema: metadata_schema_for_container(container.id),
            }
        })
        .collect()
}

pub(crate) async fn get_transcode_capabilities_with_ffmpeg_path(
    ffmpeg_path: &str,
) -> Result<TranscodeCapabilities, String> {
    let version_output = run_ffmpeg_command(ffmpeg_path, &["-version"]).await?;
    let encoder_output = run_ffmpeg_command(ffmpeg_path, &["-hide_banner", "-encoders"]).await?;
    let muxer_output = run_ffmpeg_command(ffmpeg_path, &["-hide_banner", "-muxers"]).await?;
    let hwaccel_output = run_ffmpeg_command(ffmpeg_path, &["-hide_banner", "-hwaccels"])
        .await
        .unwrap_or_default();

    let available_encoders = parse_ffmpeg_encoder_names(&encoder_output);
    let available_muxers = parse_ffmpeg_muxer_names(&muxer_output);
    let hwaccels = parse_ffmpeg_hwaccel_names(&hwaccel_output);

    let video_encoders = build_video_encoder_capabilities(ffmpeg_path, &available_encoders).await;
    let audio_encoders = build_audio_encoder_capabilities(ffmpeg_path, &available_encoders).await;
    let subtitle_encoders =
        build_subtitle_encoder_capabilities(ffmpeg_path, &available_encoders).await;
    let containers = build_container_capabilities(
        &available_muxers,
        &video_encoders,
        &audio_encoders,
        &subtitle_encoders,
    );

    Ok(TranscodeCapabilities {
        ffmpeg_version: parse_ffmpeg_version(&version_output),
        hwaccels,
        containers,
        video_encoders,
        audio_encoders,
        subtitle_encoders,
        default_analysis_frame_count: DEFAULT_ANALYSIS_FRAME_COUNT,
    })
}

#[tauri::command]
pub(crate) async fn get_transcode_capabilities(
    app: tauri::AppHandle,
) -> Result<TranscodeCapabilities, String> {
    let ffmpeg_path = resolve_ffmpeg_path(&app)?;
    get_transcode_capabilities_with_ffmpeg_path(&ffmpeg_path).await
}

#[cfg(test)]
mod tests {
    use super::{
        TranscodeAudioEncoderCapability, TranscodeSubtitleEncoderCapability,
        TranscodeVideoEncoderCapability, build_container_capabilities,
        derive_bit_depths_from_pixel_formats, parse_ffmpeg_encoder_names,
        parse_ffmpeg_hwaccel_names, parse_ffmpeg_muxer_names, parse_option_enum_values,
        parse_supported_pixel_formats, video_encoder_supports_bitrate,
    };
    use std::collections::HashSet;

    fn to_set(values: &[&str]) -> HashSet<String> {
        values.iter().map(|value| (*value).to_string()).collect()
    }

    #[test]
    fn parse_ffmpeg_encoder_names_extracts_encoder_ids() {
        let sample = r#"
 V....D hevc_videotoolbox    VideoToolbox H.265 Encoder
 V....D libx264              libx264 H.264
 A....D aac                  AAC
 "#;
        let parsed = parse_ffmpeg_encoder_names(sample);
        assert!(parsed.contains("hevc_videotoolbox"));
        assert!(parsed.contains("libx264"));
        assert!(parsed.contains("aac"));
    }

    #[test]
    fn parse_ffmpeg_muxer_names_extracts_primary_muxer_ids() {
        let sample = r#"
  E  matroska        Matroska
  E  mp4             MP4
  E  stream_segment,ssegment streaming segment muxer
 "#;
        let parsed = parse_ffmpeg_muxer_names(sample);
        assert!(parsed.contains("matroska"));
        assert!(parsed.contains("mp4"));
        assert!(parsed.contains("stream_segment"));
        assert!(!parsed.contains("ssegment"));
    }

    #[test]
    fn parse_ffmpeg_hwaccel_names_extracts_hwaccels() {
        let sample = "Hardware acceleration methods:\nvideotoolbox\nqsv\n";
        let parsed = parse_ffmpeg_hwaccel_names(sample);
        assert_eq!(parsed, vec!["videotoolbox".to_string(), "qsv".to_string()]);
    }

    #[test]
    fn parse_supported_pixel_formats_extracts_formats() {
        let sample = "Supported pixel formats: videotoolbox_vld nv12 yuv420p p010le";
        assert_eq!(
            parse_supported_pixel_formats(sample),
            vec![
                "videotoolbox_vld".to_string(),
                "nv12".to_string(),
                "yuv420p".to_string(),
                "p010le".to_string()
            ]
        );
    }

    #[test]
    fn parse_option_enum_values_extracts_profile_variants() {
        let sample = r#"
  -profile           <int>        E..V....... Profile
     main            1            E..V....... Main Profile
     main10          2            E..V....... Main10 Profile
  -allow_sw          <boolean>    E..V....... Allow software encoding
 "#;
        assert_eq!(
            parse_option_enum_values(sample, "profile"),
            vec!["main".to_string(), "main10".to_string()]
        );
    }

    #[test]
    fn derive_bit_depths_from_pixel_formats_detects_ten_bit() {
        let pixel_formats = vec!["yuv420p".to_string(), "p010le".to_string()];
        assert_eq!(
            derive_bit_depths_from_pixel_formats(&pixel_formats),
            vec![8, 10]
        );
    }

    #[test]
    fn video_encoder_supports_bitrate_detects_crf_qp_based_rate_control() {
        let sample = r#"
  -crf               <float>      E..V....... Select the quality for constant quality mode
  -qp                <int>        E..V....... Constant quantization parameter rate control method
 "#;
        assert!(video_encoder_supports_bitrate(sample));
    }

    #[test]
    fn video_encoder_supports_bitrate_detects_constant_bit_rate_flag() {
        let sample = r#"
  -constant_bit_rate <boolean>    E..V....... Require constant bit rate
 "#;
        assert!(video_encoder_supports_bitrate(sample));
    }

    #[test]
    fn video_encoder_supports_bitrate_rejects_prores_ks_help() {
        let sample = r#"
ProRes encoder AVOptions:
  -profile           <int>        E..V....... (from -1 to 5) (default auto)
  -bits_per_mb       <int>        E..V....... desired bits per macroblock
 "#;
        assert!(!video_encoder_supports_bitrate(sample));
    }

    #[test]
    fn video_encoder_supports_bitrate_rejects_prores_videotoolbox_help() {
        let sample = r#"
prores_videotoolbox AVOptions:
  -profile           <int>        E..V....... Profile
  -allow_sw          <boolean>    E..V....... Allow software encoding
 "#;
        assert!(!video_encoder_supports_bitrate(sample));
    }

    #[test]
    fn build_container_capabilities_filters_by_muxers_and_encoder_support() {
        let muxers = to_set(&["mp4", "matroska"]);
        let video_encoders = vec![TranscodeVideoEncoderCapability {
            id: "hevc_videotoolbox".to_string(),
            codec: "hevc".to_string(),
            label: "HEVC".to_string(),
            is_hardware: true,
            supported_pixel_formats: vec!["p010le".to_string()],
            supported_profiles: vec!["main10".to_string()],
            supported_levels: vec![],
            supported_bit_depths: vec![10],
            supports_preset: false,
            supports_crf: false,
            supports_qp: false,
            supports_bitrate: true,
        }];
        let audio_encoders = vec![TranscodeAudioEncoderCapability {
            id: "aac".to_string(),
            codec: "aac".to_string(),
            label: "AAC".to_string(),
            supports_bitrate: true,
            supports_channels: true,
            supports_sample_rate: true,
        }];
        let subtitle_encoders = vec![TranscodeSubtitleEncoderCapability {
            id: "mov_text".to_string(),
            codec: "mov_text".to_string(),
            label: "mov_text".to_string(),
            kind: "text".to_string(),
        }];

        let containers = build_container_capabilities(
            &muxers,
            &video_encoders,
            &audio_encoders,
            &subtitle_encoders,
        );

        let mp4 = containers
            .iter()
            .find(|container| container.id == "mp4")
            .expect("mp4 capability should exist");
        assert_eq!(
            mp4.default_video_encoder_id.as_deref(),
            Some("hevc_videotoolbox")
        );
        assert!(
            mp4.supported_subtitle_modes
                .contains(&"convert_text".to_string())
        );

        let mkv = containers
            .iter()
            .find(|container| container.id == "mkv")
            .expect("mkv capability should exist");
        assert!(mkv.supported_audio_encoder_ids.contains(&"aac".to_string()));
    }

    #[test]
    fn build_container_capabilities_prefers_delivery_codecs_for_mov_defaults() {
        let muxers = to_set(&["mov"]);
        let video_encoders = vec![
            TranscodeVideoEncoderCapability {
                id: "prores_videotoolbox".to_string(),
                codec: "prores".to_string(),
                label: "ProRes VT".to_string(),
                is_hardware: true,
                supported_pixel_formats: vec!["p010le".to_string()],
                supported_profiles: vec!["hq".to_string()],
                supported_levels: vec![],
                supported_bit_depths: vec![10],
                supports_preset: false,
                supports_crf: false,
                supports_qp: false,
                supports_bitrate: false,
            },
            TranscodeVideoEncoderCapability {
                id: "prores_ks".to_string(),
                codec: "prores".to_string(),
                label: "ProRes KS".to_string(),
                is_hardware: false,
                supported_pixel_formats: vec!["yuv422p10le".to_string()],
                supported_profiles: vec!["hq".to_string()],
                supported_levels: vec![],
                supported_bit_depths: vec![10],
                supports_preset: false,
                supports_crf: false,
                supports_qp: false,
                supports_bitrate: false,
            },
            TranscodeVideoEncoderCapability {
                id: "hevc_videotoolbox".to_string(),
                codec: "hevc".to_string(),
                label: "HEVC".to_string(),
                is_hardware: true,
                supported_pixel_formats: vec!["p010le".to_string()],
                supported_profiles: vec!["main10".to_string()],
                supported_levels: vec![],
                supported_bit_depths: vec![10],
                supports_preset: false,
                supports_crf: false,
                supports_qp: false,
                supports_bitrate: true,
            },
            TranscodeVideoEncoderCapability {
                id: "h264_videotoolbox".to_string(),
                codec: "h264".to_string(),
                label: "H.264".to_string(),
                is_hardware: true,
                supported_pixel_formats: vec!["yuv420p".to_string()],
                supported_profiles: vec!["high".to_string()],
                supported_levels: vec!["4.1".to_string()],
                supported_bit_depths: vec![8],
                supports_preset: false,
                supports_crf: false,
                supports_qp: false,
                supports_bitrate: true,
            },
        ];

        let containers = build_container_capabilities(&muxers, &video_encoders, &[], &[]);
        let mov = containers
            .iter()
            .find(|container| container.id == "mov")
            .expect("mov capability should exist");

        assert_eq!(
            mov.default_video_encoder_id.as_deref(),
            Some("hevc_videotoolbox")
        );
    }
}
