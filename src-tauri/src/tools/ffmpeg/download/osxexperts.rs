use crate::tools::ffmpeg::download::archive::{
    ArchiveType, binary_file_name, extract_archive, find_binary_path,
};
use crate::tools::ffmpeg::download::progress::{DownloadTracker, emit_download_progress};
use crate::tools::ffmpeg::download::{
    create_temp_dir, download_to_file, http_client, install_binaries,
};

const MAC_ARM_FFMPEG_URL: &str = "https://www.osxexperts.net/ffmpeg81arm.zip";
const MAC_ARM_FFPROBE_URL: &str = "https://www.osxexperts.net/ffprobe81arm.zip";
const MAC_INTEL_FFMPEG_URL: &str = "https://www.osxexperts.net/ffmpeg80intel.zip";
const MAC_INTEL_FFPROBE_URL: &str = "https://www.osxexperts.net/ffprobe80intel.zip";

fn resolve_osxexperts_urls(arch: &str) -> Result<(&'static str, &'static str), String> {
    match arch {
        "aarch64" => Ok((MAC_ARM_FFMPEG_URL, MAC_ARM_FFPROBE_URL)),
        "x86_64" => Ok((MAC_INTEL_FFMPEG_URL, MAC_INTEL_FFPROBE_URL)),
        _ => Err(format!("Unsupported macOS architecture: {}", arch)),
    }
}

pub(super) async fn download_from_osxexperts(
    app: &tauri::AppHandle,
    arch: &str,
) -> Result<super::DownloadResult, String> {
    let (ffmpeg_url, ffprobe_url) = resolve_osxexperts_urls(arch)?;
    let temp_dir = create_temp_dir(app, "ffmpeg_osxexperts")?;
    let client = http_client()?;
    let mut tracker = DownloadTracker::default();

    emit_download_progress(app, 0.0, "Preparing download...");

    let ffmpeg_archive = temp_dir.join("ffmpeg.zip");
    let ffprobe_archive = temp_dir.join("ffprobe.zip");
    download_to_file(
        app,
        &client,
        ffmpeg_url,
        &ffmpeg_archive,
        &mut tracker,
        "Downloading FFmpeg...",
    )
    .await?;
    download_to_file(
        app,
        &client,
        ffprobe_url,
        &ffprobe_archive,
        &mut tracker,
        "Downloading FFprobe...",
    )
    .await?;

    let ffmpeg_extract = temp_dir.join("ffmpeg");
    let ffprobe_extract = temp_dir.join("ffprobe");
    emit_download_progress(app, 92.0, "Extracting archives...");
    extract_archive(ffmpeg_archive, ffmpeg_extract.clone(), ArchiveType::Zip).await?;
    extract_archive(ffprobe_archive, ffprobe_extract.clone(), ArchiveType::Zip).await?;

    let ffmpeg_name = binary_file_name("ffmpeg");
    let ffprobe_name = binary_file_name("ffprobe");
    let (ffmpeg_src, ffprobe_src) = tokio::task::spawn_blocking(move || {
        let ffmpeg_src = find_binary_path(&ffmpeg_extract, &ffmpeg_name)?;
        let ffprobe_src = find_binary_path(&ffprobe_extract, &ffprobe_name)?;
        Ok::<_, String>((ffmpeg_src, ffprobe_src))
    })
    .await
    .map_err(|e| format!("Failed to locate FFmpeg binaries: {}", e))??;

    emit_download_progress(app, 96.0, "Installing binaries...");
    let (ffmpeg_dest, ffprobe_dest) = install_binaries(app, &ffmpeg_src, &ffprobe_src).await?;
    emit_download_progress(app, 100.0, "FFmpeg installed");

    Ok(super::DownloadResult {
        ffmpeg_path: ffmpeg_dest.to_string_lossy().to_string(),
        ffprobe_path: ffprobe_dest.to_string_lossy().to_string(),
        warning: None,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        MAC_ARM_FFMPEG_URL, MAC_ARM_FFPROBE_URL, MAC_INTEL_FFMPEG_URL, MAC_INTEL_FFPROBE_URL,
        resolve_osxexperts_urls,
    };

    #[test]
    fn resolve_osxexperts_urls_maps_supported_architectures() {
        assert_eq!(
            resolve_osxexperts_urls("aarch64").expect("arm urls expected"),
            (MAC_ARM_FFMPEG_URL, MAC_ARM_FFPROBE_URL)
        );
        assert_eq!(
            resolve_osxexperts_urls("x86_64").expect("intel urls expected"),
            (MAC_INTEL_FFMPEG_URL, MAC_INTEL_FFPROBE_URL)
        );
    }

    #[test]
    fn resolve_osxexperts_urls_rejects_unsupported_architecture() {
        let error = resolve_osxexperts_urls("powerpc").expect_err("unsupported arch should fail");
        assert!(error.contains("Unsupported macOS architecture"));
    }
}
