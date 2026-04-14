use serde::Serialize;
#[cfg(any(debug_assertions, test))]
use std::path::Path;
use std::path::PathBuf;
#[cfg(any(debug_assertions, test))]
use tauri_plugin_store::StoreExt;

/// Settings store filename
#[cfg(any(debug_assertions, test))]
pub(crate) const SETTINGS_STORE_FILE: &str = "settings.json";

/// Store keys for custom FFmpeg/FFprobe paths
pub(crate) const FFMPEG_PATH_KEY: &str = "ffmpegPath";
pub(crate) const FFPROBE_PATH_KEY: &str = "ffprobePath";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum BinaryPathSource {
    #[cfg(any(debug_assertions, test))]
    Custom,
    Bundled,
    #[cfg(any(debug_assertions, test))]
    System,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct ResolvedBinaryPath {
    pub(crate) path: String,
    pub(crate) source: BinaryPathSource,
}

#[cfg(any(debug_assertions, test))]
fn read_store_path(app: &tauri::AppHandle, key: &str) -> Result<Option<String>, String> {
    let store = app
        .store(SETTINGS_STORE_FILE)
        .map_err(|e| format!("Failed to open settings store: {}", e))?;

    Ok(store
        .get(key)
        .and_then(|value| value.as_str().map(|s| s.to_string())))
}

fn resolve_binary_path(
    app: &tauri::AppHandle,
    key: &str,
    fallback_cmd: &str,
    label: &str,
) -> Result<ResolvedBinaryPath, String> {
    #[cfg(not(debug_assertions))]
    {
        let _ = (app, key);
        return resolve_bundled_binary_path(fallback_cmd, label).map(|path| ResolvedBinaryPath {
            path,
            source: BinaryPathSource::Bundled,
        });
    }

    #[cfg(any(debug_assertions, test))]
    {
        resolve_debug_binary_path(app, key, fallback_cmd, label)
    }
}

#[cfg(any(debug_assertions, test))]
fn resolve_debug_binary_path(
    app: &tauri::AppHandle,
    key: &str,
    fallback_cmd: &str,
    label: &str,
) -> Result<ResolvedBinaryPath, String> {
    let custom = read_store_path(app, key)?.unwrap_or_default();
    let trimmed = custom.trim();
    if !trimmed.is_empty() {
        return resolve_binary_path_from_custom(trimmed, fallback_cmd, label).map(|path| {
            ResolvedBinaryPath {
                path,
                source: BinaryPathSource::Custom,
            }
        });
    }

    if let Some(path) = find_bundled_binary_path(fallback_cmd) {
        return Ok(ResolvedBinaryPath {
            path: path.to_string_lossy().to_string(),
            source: BinaryPathSource::Bundled,
        });
    }

    Ok(ResolvedBinaryPath {
        path: fallback_cmd.to_string(),
        source: BinaryPathSource::System,
    })
}

#[cfg(any(debug_assertions, test))]
fn resolve_binary_path_from_custom(
    custom: &str,
    fallback_cmd: &str,
    label: &str,
) -> Result<String, String> {
    let trimmed = custom.trim();
    if trimmed.is_empty() {
        return Ok(fallback_cmd.to_string());
    }

    let path = Path::new(trimmed);
    if !path.exists() {
        return Err(format!(
            "Custom {} path does not exist: {}",
            label,
            path.display()
        ));
    }
    if !path.is_file() {
        return Err(format!(
            "Custom {} path is not a file: {}",
            label,
            path.display()
        ));
    }

    Ok(path.to_string_lossy().to_string())
}

pub(crate) fn resolve_ffmpeg_path(app: &tauri::AppHandle) -> Result<String, String> {
    Ok(resolve_ffmpeg_path_with_source(app)?.path)
}

pub(crate) fn resolve_ffprobe_path(app: &tauri::AppHandle) -> Result<String, String> {
    Ok(resolve_ffprobe_path_with_source(app)?.path)
}

pub(crate) fn resolve_ffmpeg_path_with_source(
    app: &tauri::AppHandle,
) -> Result<ResolvedBinaryPath, String> {
    resolve_binary_path(app, FFMPEG_PATH_KEY, "ffmpeg", "FFmpeg")
}

pub(crate) fn resolve_ffprobe_path_with_source(
    app: &tauri::AppHandle,
) -> Result<ResolvedBinaryPath, String> {
    resolve_binary_path(app, FFPROBE_PATH_KEY, "ffprobe", "FFprobe")
}

#[cfg(not(debug_assertions))]
fn resolve_bundled_binary_path(command: &str, label: &str) -> Result<String, String> {
    let path = bundled_binary_path(command)?;
    if path.is_file() {
        Ok(path.to_string_lossy().to_string())
    } else {
        Err(format!(
            "Bundled {} binary not found: {}",
            label,
            path.display()
        ))
    }
}

#[cfg(any(debug_assertions, test))]
fn find_bundled_binary_path(command: &str) -> Option<PathBuf> {
    bundled_binary_path(command)
        .ok()
        .filter(|path| path.is_file())
}

fn bundled_binary_path(command: &str) -> Result<PathBuf, String> {
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Failed to resolve current executable path: {}", e))?;
    let exe_dir = exe_path
        .parent()
        .ok_or_else(|| "Current executable path has no parent directory".to_string())?;

    let base_dir = if exe_dir.ends_with("deps") {
        exe_dir.parent().unwrap_or(exe_dir)
    } else {
        exe_dir
    };

    Ok(base_dir.join(binary_file_name(command)))
}

fn binary_file_name(base: &str) -> String {
    if cfg!(windows) {
        format!("{}.exe", base)
    } else {
        base.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::{BinaryPathSource, ResolvedBinaryPath, resolve_binary_path_from_custom};

    #[test]
    fn resolve_binary_path_from_custom_returns_fallback_for_empty_custom_path() {
        let resolved =
            resolve_binary_path_from_custom("   ", "ffmpeg", "FFmpeg").expect("fallback expected");
        assert_eq!(resolved, "ffmpeg");
    }

    #[test]
    fn resolve_binary_path_from_custom_rejects_nonexistent_path() {
        let error = resolve_binary_path_from_custom(
            "/tmp/definitely-not-a-real-binary",
            "ffmpeg",
            "FFmpeg",
        )
        .expect_err("path should not exist");
        assert!(error.contains("does not exist"));
    }

    #[test]
    fn resolve_binary_path_from_custom_rejects_directory_path() {
        let dir = tempfile::tempdir().expect("failed to create temp dir");
        let error = resolve_binary_path_from_custom(
            dir.path().to_string_lossy().as_ref(),
            "ffmpeg",
            "FFmpeg",
        )
        .expect_err("directory path must be rejected");
        assert!(error.contains("is not a file"));
    }

    #[test]
    fn resolve_binary_path_from_custom_accepts_existing_file() {
        let dir = tempfile::tempdir().expect("failed to create temp dir");
        let file = dir.path().join("ffmpeg-custom");
        std::fs::write(&file, b"").expect("failed to create file");

        let resolved =
            resolve_binary_path_from_custom(file.to_string_lossy().as_ref(), "ffmpeg", "FFmpeg")
                .expect("existing file should be accepted");
        assert_eq!(resolved, file.to_string_lossy().to_string());
    }

    #[test]
    fn resolved_binary_path_tracks_source() {
        let resolved = ResolvedBinaryPath {
            path: "ffmpeg".to_string(),
            source: BinaryPathSource::System,
        };
        assert_eq!(resolved.source, BinaryPathSource::System);
    }
}
