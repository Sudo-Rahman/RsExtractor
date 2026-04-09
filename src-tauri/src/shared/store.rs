use std::path::{Path, PathBuf};
use tauri_plugin_store::StoreExt;

/// Settings store filename
pub(crate) const SETTINGS_STORE_FILE: &str = "settings.json";

/// Store keys for custom FFmpeg/FFprobe paths
pub(crate) const FFMPEG_PATH_KEY: &str = "ffmpegPath";
pub(crate) const FFPROBE_PATH_KEY: &str = "ffprobePath";

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
    bundled_binary_name: &str,
    fallback_cmd: &str,
    label: &str,
) -> Result<String, String> {
    let custom = read_store_path(app, key)?.unwrap_or_default();
    let bundled_path = bundled_binary_path(bundled_binary_name);
    resolve_binary_path_from_custom_or_bundle(
        &custom,
        bundled_path.as_deref(),
        fallback_cmd,
        label,
    )
}

fn bundled_binary_path(binary_name: &str) -> Option<PathBuf> {
    if !cfg!(target_os = "macos") {
        return None;
    }

    // Tauri copies externalBin binaries next to the app executable on macOS.
    let executable_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    let candidate = executable_dir.join(binary_name);

    candidate.is_file().then_some(candidate)
}

fn resolve_binary_path_from_custom_or_bundle(
    custom: &str,
    bundled_path: Option<&Path>,
    fallback_cmd: &str,
    label: &str,
) -> Result<String, String> {
    let trimmed = custom.trim();
    if !trimmed.is_empty() {
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

        return Ok(path.to_string_lossy().to_string());
    }

    if let Some(path) = bundled_path.filter(|path| path.is_file()) {
        return Ok(path.to_string_lossy().to_string());
    }

    Ok(fallback_cmd.to_string())
}

pub(crate) fn resolve_ffmpeg_path(app: &tauri::AppHandle) -> Result<String, String> {
    resolve_binary_path(app, FFMPEG_PATH_KEY, "ffmpeg", "ffmpeg", "FFmpeg")
}

pub(crate) fn resolve_ffprobe_path(app: &tauri::AppHandle) -> Result<String, String> {
    resolve_binary_path(app, FFPROBE_PATH_KEY, "ffprobe", "ffprobe", "FFprobe")
}

#[cfg(test)]
mod tests {
    use super::resolve_binary_path_from_custom_or_bundle;

    #[test]
    fn resolve_binary_path_from_custom_or_bundle_returns_bundle_path_for_empty_custom_path() {
        let dir = tempfile::tempdir().expect("failed to create temp dir");
        let bundle_path = dir.path().join("ffmpeg");
        std::fs::write(&bundle_path, b"").expect("failed to create bundle file");

        let resolved = resolve_binary_path_from_custom_or_bundle(
            "   ",
            Some(bundle_path.as_path()),
            "ffmpeg",
            "FFmpeg",
        )
        .expect("bundle path should be preferred");

        assert_eq!(resolved, bundle_path.to_string_lossy().to_string());
    }

    #[test]
    fn resolve_binary_path_from_custom_or_bundle_preserves_custom_path_priority() {
        let dir = tempfile::tempdir().expect("failed to create temp dir");
        let bundle_path = dir.path().join("ffmpeg");
        std::fs::write(&bundle_path, b"").expect("failed to create bundle file");

        let custom_path = dir.path().join("custom-ffmpeg");
        std::fs::write(&custom_path, b"").expect("failed to create custom file");

        let resolved = resolve_binary_path_from_custom_or_bundle(
            custom_path.to_string_lossy().as_ref(),
            Some(bundle_path.as_path()),
            "ffmpeg",
            "FFmpeg",
        )
        .expect("custom path should be preferred");

        assert_eq!(resolved, custom_path.to_string_lossy().to_string());
    }

    #[test]
    fn resolve_binary_path_from_custom_or_bundle_rejects_nonexistent_path() {
        let dir = tempfile::tempdir().expect("failed to create temp dir");
        let bundle_path = dir.path().join("ffmpeg");
        std::fs::write(&bundle_path, b"").expect("failed to create bundle file");

        let error = resolve_binary_path_from_custom_or_bundle(
            "/tmp/definitely-not-a-real-binary",
            Some(bundle_path.as_path()),
            "ffmpeg",
            "FFmpeg",
        )
        .expect_err("path should not exist");

        assert!(error.contains("does not exist"));
    }

    #[test]
    fn resolve_binary_path_from_custom_or_bundle_rejects_directory_path() {
        let dir = tempfile::tempdir().expect("failed to create temp dir");
        let error = resolve_binary_path_from_custom_or_bundle(
            dir.path().to_string_lossy().as_ref(),
            None,
            "ffmpeg",
            "FFmpeg",
        )
        .expect_err("directory path must be rejected");

        assert!(error.contains("is not a file"));
    }

    #[test]
    fn resolve_binary_path_from_custom_or_bundle_returns_fallback_when_bundle_is_missing() {
        let resolved = resolve_binary_path_from_custom_or_bundle(
            "   ",
            None,
            "ffmpeg",
            "FFmpeg",
        )
        .expect("fallback expected");

        assert_eq!(resolved, "ffmpeg");
    }

    #[test]
    fn resolve_binary_path_from_custom_or_bundle_accepts_existing_file() {
        let dir = tempfile::tempdir().expect("failed to create temp dir");
        let file = dir.path().join("ffmpeg-custom");
        std::fs::write(&file, b"").expect("failed to create file");

        let resolved = resolve_binary_path_from_custom_or_bundle(
            file.to_string_lossy().as_ref(),
            None,
            "ffmpeg",
            "FFmpeg",
        )
        .expect("existing file should be accepted");

        assert_eq!(resolved, file.to_string_lossy().to_string());
    }
}
