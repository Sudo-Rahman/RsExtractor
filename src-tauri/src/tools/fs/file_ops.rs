use crate::shared::validation::validate_output_path;
use crate::shared::sleep_inhibit::SleepInhibitGuard;
use std::path::Path;

/// Rename a file on disk
#[tauri::command]
pub(crate) async fn rename_file(old_path: String, new_path: String) -> Result<(), String> {
    // Validate paths
    let old = Path::new(&old_path);
    if !old.exists() {
        return Err(format!("Source file not found: {}", old_path));
    }
    if !old.is_file() {
        return Err(format!("Source is not a file: {}", old_path));
    }

    validate_output_path(&new_path)?;

    // Check if destination already exists
    let new = Path::new(&new_path);
    if new.exists() {
        return Err(format!("Destination already exists: {}", new_path));
    }

    std::fs::rename(&old_path, &new_path).map_err(|e| format!("Failed to rename file: {}", e))
}

/// Copy a file to a new location
#[tauri::command]
pub(crate) async fn copy_file(
    source_path: String,
    dest_path: String,
    overwrite: Option<bool>,
) -> Result<(), String> {
    // Validate paths
    let source = Path::new(&source_path);
    if !source.exists() {
        return Err(format!("Source file not found: {}", source_path));
    }
    if !source.is_file() {
        return Err(format!("Source is not a file: {}", source_path));
    }

    validate_output_path(&dest_path)?;
    let overwrite = overwrite.unwrap_or(false);

    let dest = Path::new(&dest_path);
    if dest.exists() {
        if !dest.is_file() {
            return Err(format!("Destination is not a file: {}", dest_path));
        }
        if !overwrite {
            return Err(format!("Destination already exists: {}", dest_path));
        }
    }

    let _sleep_guard = SleepInhibitGuard::try_acquire("Copying file").ok();

    std::fs::copy(&source_path, &dest_path).map_err(|e| format!("Failed to copy file: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{copy_file, rename_file};

    #[tokio::test]
    async fn rename_file_moves_source_to_destination() {
        let dir = tempfile::tempdir().expect("failed to create tempdir");
        let source = dir.path().join("old.txt");
        let dest = dir.path().join("new.txt");
        std::fs::write(&source, b"hello").expect("failed to create source file");

        rename_file(
            source.to_string_lossy().to_string(),
            dest.to_string_lossy().to_string(),
        )
        .await
        .expect("rename should succeed");

        assert!(!source.exists());
        assert!(dest.exists());
    }

    #[tokio::test]
    async fn rename_file_rejects_existing_destination() {
        let dir = tempfile::tempdir().expect("failed to create tempdir");
        let source = dir.path().join("old.txt");
        let dest = dir.path().join("new.txt");
        std::fs::write(&source, b"hello").expect("failed to create source file");
        std::fs::write(&dest, b"occupied").expect("failed to create destination file");

        let error = rename_file(
            source.to_string_lossy().to_string(),
            dest.to_string_lossy().to_string(),
        )
        .await
        .expect_err("rename should fail when destination exists");
        assert!(error.contains("Destination already exists"));
    }

    #[tokio::test]
    async fn copy_file_writes_destination() {
        let dir = tempfile::tempdir().expect("failed to create tempdir");
        let source = dir.path().join("src.txt");
        let dest = dir.path().join("dst.txt");
        std::fs::write(&source, b"copy-me").expect("failed to create source file");

        copy_file(
            source.to_string_lossy().to_string(),
            dest.to_string_lossy().to_string(),
            None,
        )
        .await
        .expect("copy should succeed");

        let content = std::fs::read_to_string(&dest).expect("failed to read destination");
        assert_eq!(content, "copy-me");
    }

    #[tokio::test]
    async fn copy_file_rejects_existing_destination_without_overwrite() {
        let dir = tempfile::tempdir().expect("failed to create tempdir");
        let source = dir.path().join("src.txt");
        let dest = dir.path().join("dst.txt");
        std::fs::write(&source, b"copy-me").expect("failed to create source file");
        std::fs::write(&dest, b"existing").expect("failed to create destination file");

        let error = copy_file(
            source.to_string_lossy().to_string(),
            dest.to_string_lossy().to_string(),
            None,
        )
        .await
        .expect_err("copy should fail when destination exists and overwrite is false");

        assert!(error.contains("Destination already exists"));
        let content = std::fs::read_to_string(&dest).expect("failed to read destination");
        assert_eq!(content, "existing");
    }

    #[tokio::test]
    async fn copy_file_overwrites_existing_destination_when_allowed() {
        let dir = tempfile::tempdir().expect("failed to create tempdir");
        let source = dir.path().join("src.txt");
        let dest = dir.path().join("dst.txt");
        std::fs::write(&source, b"copy-me").expect("failed to create source file");
        std::fs::write(&dest, b"existing").expect("failed to create destination file");

        copy_file(
            source.to_string_lossy().to_string(),
            dest.to_string_lossy().to_string(),
            Some(true),
        )
        .await
        .expect("copy should overwrite destination");

        let content = std::fs::read_to_string(&dest).expect("failed to read destination");
        assert_eq!(content, "copy-me");
    }
}
