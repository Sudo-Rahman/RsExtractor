#![allow(dead_code)]

use std::path::Path;

const BUNDLED_FFMPEG: Option<&str> = option_env!("MEDIAFLOW_BUNDLED_FFMPEG");
const BUNDLED_FFPROBE: Option<&str> = option_env!("MEDIAFLOW_BUNDLED_FFPROBE");

pub(crate) fn ffmpeg_path() -> &'static str {
    try_ffmpeg_path().unwrap_or_else(|error| panic!("{error}"))
}

pub(crate) fn ffprobe_path() -> &'static str {
    try_ffprobe_path().unwrap_or_else(|error| panic!("{error}"))
}

pub(crate) fn try_ffmpeg_path() -> Result<&'static str, String> {
    test_binary_path("ffmpeg", "MEDIAFLOW_BUNDLED_FFMPEG", BUNDLED_FFMPEG)
}

pub(crate) fn try_ffprobe_path() -> Result<&'static str, String> {
    test_binary_path("ffprobe", "MEDIAFLOW_BUNDLED_FFPROBE", BUNDLED_FFPROBE)
}

fn test_binary_path(
    command: &'static str,
    env_name: &str,
    bundled_path: Option<&'static str>,
) -> Result<&'static str, String> {
    test_binary_path_with_ci(command, env_name, bundled_path, is_ci())
}

fn test_binary_path_with_ci(
    command: &'static str,
    env_name: &str,
    bundled_path: Option<&'static str>,
    ci_enabled: bool,
) -> Result<&'static str, String> {
    if let Some(path) = bundled_path {
        if Path::new(path).is_file() {
            return Ok(path);
        }

        if ci_enabled {
            return Err(format!(
                "Bundled {} binary from {} does not exist: {}. \
                 The build script should download this binary before tests run.",
                command, env_name, path
            ));
        }
    }

    if ci_enabled {
        return Err(format!(
            "{} is not set to a valid bundled {} binary. \
             CI must use the FFmpeg binaries prepared by src-tauri/build.rs.",
            env_name, command
        ));
    }

    Ok(command)
}

fn is_ci() -> bool {
    std::env::var("CI").is_ok_and(|value| value.eq_ignore_ascii_case("true"))
}

#[cfg(test)]
mod tests {
    use super::{test_binary_path, test_binary_path_with_ci};

    #[test]
    fn test_binary_path_falls_back_to_command_outside_ci() {
        let resolved = test_binary_path_with_ci("ffmpeg", "MEDIAFLOW_BUNDLED_FFMPEG", None, false)
            .expect("local fallback should be allowed");
        assert_eq!(resolved, "ffmpeg");
    }

    #[test]
    fn test_binary_path_rejects_missing_bundled_path_in_ci() {
        let error = test_binary_path_with_ci("ffmpeg", "MEDIAFLOW_BUNDLED_FFMPEG", None, true)
            .expect_err("CI should require bundled binaries");
        assert!(error.contains("MEDIAFLOW_BUNDLED_FFMPEG"));
    }

    #[test]
    fn test_binary_path_uses_existing_bundled_path() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/src/test_support/ffmpeg.rs");
        let resolved = test_binary_path("ffmpeg", "MEDIAFLOW_BUNDLED_FFMPEG", Some(path))
            .expect("existing bundled path should be used");
        assert_eq!(resolved, path);
    }
}
