use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ContainerMetadataSchema {
    pub(crate) supports_container_title: bool,
    pub(crate) supports_track_title: bool,
    pub(crate) supports_language: bool,
    pub(crate) supports_default: bool,
    pub(crate) supports_forced: bool,
    pub(crate) clears_matroska_statistics: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrackMetadataEdit {
    pub(crate) source_track_id: usize,
    pub(crate) title: Option<String>,
    pub(crate) language: Option<String>,
    pub(crate) default: Option<bool>,
    pub(crate) forced: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MediaMetadataRequest {
    pub(crate) container_title: Option<String>,
    #[serde(default)]
    pub(crate) track_edits: Vec<TrackMetadataEdit>,
}

impl Default for MediaMetadataRequest {
    fn default() -> Self {
        Self {
            container_title: None,
            track_edits: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct OutputStreamMetadata {
    pub(crate) output_index: usize,
    pub(crate) source_track_id: Option<usize>,
    pub(crate) title: Option<String>,
    pub(crate) language: Option<String>,
    pub(crate) is_default: bool,
    pub(crate) is_forced: bool,
}

const MATROSKA_STATISTICS_TAGS: &[&str] = &[
    "BPS",
    "BPS-eng",
    "DURATION",
    "DURATION-eng",
    "NUMBER_OF_BYTES",
    "NUMBER_OF_BYTES-eng",
    "NUMBER_OF_FRAMES",
    "NUMBER_OF_FRAMES-eng",
    "_STATISTICS_TAGS",
    "_STATISTICS_WRITING_APP",
    "_STATISTICS_WRITING_DATE_UTC",
];

pub(crate) fn metadata_schema_for_container(container_id: &str) -> ContainerMetadataSchema {
    match container_id {
        "mkv" | "webm" => ContainerMetadataSchema {
            supports_container_title: true,
            supports_track_title: true,
            supports_language: true,
            supports_default: true,
            supports_forced: container_id == "mkv",
            clears_matroska_statistics: true,
        },
        "mp4" | "mov" => ContainerMetadataSchema {
            supports_container_title: true,
            supports_track_title: true,
            supports_language: true,
            supports_default: true,
            supports_forced: false,
            clears_matroska_statistics: false,
        },
        "aac" | "flac" | "mp3" | "ogg" | "opus" | "wav" => ContainerMetadataSchema {
            supports_container_title: true,
            supports_track_title: true,
            supports_language: true,
            supports_default: false,
            supports_forced: false,
            clears_matroska_statistics: false,
        },
        _ => ContainerMetadataSchema {
            supports_container_title: true,
            supports_track_title: true,
            supports_language: true,
            supports_default: true,
            supports_forced: true,
            clears_matroska_statistics: false,
        },
    }
}

pub(crate) fn output_stream_metadata_from_request(
    output_index: usize,
    source_stream: &Value,
    request: &MediaMetadataRequest,
) -> OutputStreamMetadata {
    let source_track_id = source_stream
        .get("index")
        .and_then(|value| value.as_u64())
        .map(|value| value as usize);
    let edit = source_track_id.and_then(|track_id| {
        request
            .track_edits
            .iter()
            .find(|edit| edit.source_track_id == track_id)
    });

    OutputStreamMetadata {
        output_index,
        source_track_id,
        title: edit
            .and_then(|edit| edit.title.clone())
            .or_else(|| track_title_tag(source_stream)),
        language: edit
            .and_then(|edit| edit.language.clone())
            .or_else(|| metadata_tag(source_stream, "language")),
        is_default: edit
            .and_then(|edit| edit.default)
            .unwrap_or_else(|| disposition_flag(source_stream, "default")),
        is_forced: edit
            .and_then(|edit| edit.forced)
            .unwrap_or_else(|| disposition_flag(source_stream, "forced")),
    }
}

pub(crate) fn output_stream_metadata_from_config(
    output_index: usize,
    source_stream: Option<&Value>,
    config: Option<&Value>,
) -> OutputStreamMetadata {
    OutputStreamMetadata {
        output_index,
        source_track_id: source_stream
            .and_then(|stream| stream.get("index"))
            .and_then(|value| value.as_u64())
            .map(|value| value as usize),
        title: config
            .and_then(|config| string_value(config, "title"))
            .or_else(|| source_stream.and_then(track_title_tag)),
        language: config
            .and_then(|config| string_value(config, "language"))
            .or_else(|| source_stream.and_then(|stream| metadata_tag(stream, "language"))),
        is_default: config
            .and_then(|config| config.get("default"))
            .and_then(|value| value.as_bool())
            .unwrap_or_else(|| {
                source_stream
                    .map(|stream| disposition_flag(stream, "default"))
                    .unwrap_or(false)
            }),
        is_forced: config
            .and_then(|config| config.get("forced"))
            .and_then(|value| value.as_bool())
            .unwrap_or_else(|| {
                source_stream
                    .map(|stream| disposition_flag(stream, "forced"))
                    .unwrap_or(false)
            }),
    }
}

pub(crate) fn apply_metadata_args(
    args: &mut Vec<String>,
    container_id: &str,
    request: Option<&MediaMetadataRequest>,
    streams: &[OutputStreamMetadata],
) {
    let schema = metadata_schema_for_container(container_id);

    args.push("-map_metadata".to_string());
    args.push("-1".to_string());

    if let Some(container_title) = request.and_then(|request| request.container_title.as_deref()) {
        if schema.supports_container_title {
            args.push("-metadata".to_string());
            args.push(format!("title={}", container_title.trim()));
        }
    }

    for stream in streams {
        if schema.clears_matroska_statistics {
            clear_matroska_statistics_tags(args, stream.output_index);
        }

        if schema.supports_language {
            if let Some(language) = stream.language.as_deref() {
                args.push(format!("-metadata:s:{}", stream.output_index));
                args.push(format!("language={}", language.trim()));
            }
        }

        if schema.supports_track_title {
            if let Some(title) = stream.title.as_deref() {
                args.push(format!("-metadata:s:{}", stream.output_index));
                // FFmpeg's MOV/MP4 muxer accepts stream display names through the generic
                // `title` key, while ffprobe reads them back as the `name` tag.
                args.push(format!("title={}", title.trim()));
            }
        }

        let mut dispositions = Vec::new();
        if schema.supports_default && stream.is_default {
            dispositions.push("default");
        }
        if schema.supports_forced && stream.is_forced {
            dispositions.push("forced");
        }

        if schema.supports_default || schema.supports_forced {
            args.push(format!("-disposition:{}", stream.output_index));
            args.push(if dispositions.is_empty() {
                "0".to_string()
            } else {
                dispositions.join("+")
            });
        }
    }
}

fn clear_matroska_statistics_tags(args: &mut Vec<String>, output_index: usize) {
    for tag in MATROSKA_STATISTICS_TAGS {
        args.push(format!("-metadata:s:{}", output_index));
        args.push(format!("{}=", tag));
    }
}

fn metadata_tag(stream: &Value, key: &str) -> Option<String> {
    stream
        .get("tags")
        .and_then(|tags| string_value(tags, key))
        .filter(|value| !value.is_empty())
}

fn track_title_tag(stream: &Value) -> Option<String> {
    metadata_tag(stream, "title").or_else(|| metadata_tag(stream, "name"))
}

fn string_value(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
}

fn disposition_flag(stream: &Value, key: &str) -> bool {
    stream
        .get("disposition")
        .and_then(|disposition| disposition.get(key))
        .and_then(|value| value.as_u64())
        .is_some_and(|value| value == 1)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{
        MediaMetadataRequest, TrackMetadataEdit, apply_metadata_args,
        output_stream_metadata_from_request,
    };

    fn has_arg_pair(args: &[String], left: &str, right: &str) -> bool {
        args.windows(2)
            .any(|window| window[0] == left && window[1] == right)
    }

    #[test]
    fn metadata_request_overrides_source_stream_tags() {
        let stream = json!({
            "index": 3,
            "tags": {
                "title": "Old",
                "language": "jpn"
            },
            "disposition": {
                "default": 0,
                "forced": 1
            }
        });
        let request = MediaMetadataRequest {
            container_title: None,
            track_edits: vec![TrackMetadataEdit {
                source_track_id: 3,
                title: Some("New".to_string()),
                language: Some("eng".to_string()),
                default: Some(true),
                forced: Some(false),
            }],
        };

        let metadata = output_stream_metadata_from_request(1, &stream, &request);

        assert_eq!(metadata.title.as_deref(), Some("New"));
        assert_eq!(metadata.language.as_deref(), Some("eng"));
        assert!(metadata.is_default);
        assert!(!metadata.is_forced);
    }

    #[test]
    fn source_stream_name_tag_is_used_as_track_title_when_title_is_absent() {
        let metadata = output_stream_metadata_from_request(
            0,
            &json!({
                "index": 1,
                "tags": {
                    "name": "MP4 subtitle name",
                    "language": "eng"
                },
                "disposition": {
                    "default": 0,
                    "forced": 0
                }
            }),
            &MediaMetadataRequest::default(),
        );

        assert_eq!(metadata.title.as_deref(), Some("MP4 subtitle name"));
        assert_eq!(metadata.language.as_deref(), Some("eng"));
    }

    #[test]
    fn source_stream_title_tag_is_preferred_over_name_tag() {
        let metadata = output_stream_metadata_from_request(
            0,
            &json!({
                "index": 1,
                "tags": {
                    "title": "Matroska title",
                    "name": "MP4 name"
                },
                "disposition": {
                    "default": 0,
                    "forced": 0
                }
            }),
            &MediaMetadataRequest::default(),
        );

        assert_eq!(metadata.title.as_deref(), Some("Matroska title"));
    }

    #[test]
    fn matroska_metadata_args_clear_stale_statistics_tags() {
        let stream = output_stream_metadata_from_request(
            0,
            &json!({
                "index": 0,
                "tags": {
                    "title": "Main",
                    "language": "eng",
                    "BPS-eng": "999"
                },
                "disposition": {
                    "default": 1,
                    "forced": 0
                }
            }),
            &MediaMetadataRequest::default(),
        );
        let mut args = Vec::new();

        apply_metadata_args(&mut args, "mkv", None, &[stream]);

        assert!(has_arg_pair(&args, "-map_metadata", "-1"));
        assert!(has_arg_pair(&args, "-metadata:s:0", "BPS-eng="));
        assert!(has_arg_pair(&args, "-metadata:s:0", "NUMBER_OF_BYTES="));
        assert!(has_arg_pair(&args, "-metadata:s:0", "NUMBER_OF_FRAMES="));
        assert!(has_arg_pair(&args, "-metadata:s:0", "title=Main"));
        assert!(has_arg_pair(&args, "-metadata:s:0", "language=eng"));
        assert!(has_arg_pair(&args, "-disposition:0", "default"));
    }

    #[test]
    fn mp4_mov_metadata_args_do_not_add_matroska_statistics_tags() {
        let stream = output_stream_metadata_from_request(
            0,
            &json!({
                "index": 0,
                "tags": { "language": "eng" },
                "disposition": { "default": 1 }
            }),
            &MediaMetadataRequest::default(),
        );

        for container_id in ["mp4", "mov"] {
            let mut args = Vec::new();

            apply_metadata_args(&mut args, container_id, None, std::slice::from_ref(&stream));

            assert!(has_arg_pair(&args, "-map_metadata", "-1"));
            assert!(!has_arg_pair(&args, "-metadata:s:0", "NUMBER_OF_BYTES="));
            assert!(has_arg_pair(&args, "-disposition:0", "default"));
        }
    }

    #[test]
    fn mp4_name_tag_is_rewritten_with_ffmpeg_title_metadata_key() {
        let stream = output_stream_metadata_from_request(
            0,
            &json!({
                "index": 1,
                "tags": {
                    "name": "Commentary subtitles",
                    "language": "eng"
                },
                "disposition": { "default": 0 }
            }),
            &MediaMetadataRequest::default(),
        );
        let mut args = Vec::new();

        apply_metadata_args(&mut args, "mp4", None, &[stream]);

        assert!(has_arg_pair(
            &args,
            "-metadata:s:0",
            "title=Commentary subtitles"
        ));
        assert!(!has_arg_pair(
            &args,
            "-metadata:s:0",
            "name=Commentary subtitles"
        ));
    }
}
