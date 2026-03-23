use std::fs;
use std::fs::File;
use std::path::PathBuf;

fn main() {
    ensure_bundle_bin_placeholders();
    tauri_build::build();
}

fn ensure_bundle_bin_placeholders() {
    let manifest_dir = match std::env::var("CARGO_MANIFEST_DIR") {
        Ok(dir) => PathBuf::from(dir),
        Err(error) => panic!("Missing CARGO_MANIFEST_DIR: {}", error),
    };

    let target = match std::env::var("TARGET") {
        Ok(target) if !target.trim().is_empty() => target,
        _ => return,
    };

    if !target.contains("apple-darwin") {
        return;
    }

    let staging_dir = manifest_dir.join(".bundle-bin");
    if let Err(error) = fs::create_dir_all(&staging_dir) {
        panic!(
            "Failed to create bundle staging directory {}: {}",
            staging_dir.display(),
            error
        );
    }

    let mut targets = Vec::new();
    for candidate in [
        std::env::var("TAURI_ENV_TARGET_TRIPLE").ok(),
        std::env::var("TAURI_TARGET_TRIPLE").ok(),
        std::env::var("TARGET").ok(),
    ] {
        if let Some(target) = candidate {
            let trimmed = target.trim();
            if !trimmed.is_empty() && !targets.iter().any(|existing| existing == trimmed) {
                targets.push(trimmed.to_string());
            }
        }
    }

    if targets.is_empty() {
        return;
    }

    for binary_name in ["ffmpeg", "ffprobe"] {
        for target in &targets {
            let extension = if target.contains("windows") { ".exe" } else { "" };
            let placeholder_path = staging_dir.join(format!("{binary_name}-{target}{extension}"));

            if placeholder_path.exists() {
                continue;
            }

            if let Err(error) = File::create(&placeholder_path) {
                panic!(
                    "Failed to create bundle placeholder {}: {}",
                    placeholder_path.display(),
                    error
                );
            }
        }
    }
}
