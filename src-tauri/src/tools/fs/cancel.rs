/// Cancel an active rename copy operation for a specific source file.
#[tauri::command]
pub(crate) async fn cancel_copy_file(source_path: String) -> Result<(), String> {
    super::state::request_copy_cancel(&source_path)
}

#[cfg(test)]
mod tests {
    use serial_test::serial;

    use super::cancel_copy_file;

    #[tokio::test]
    #[serial]
    async fn cancel_copy_file_marks_active_copy_as_cancelled() {
        let source_path = "/tmp/test-copy-source-active.mkv".to_string();

        super::super::state::register_copy(&source_path).expect("register copy should succeed");
        cancel_copy_file(source_path.clone())
            .await
            .expect("cancel copy should succeed");

        let cancelled = super::super::state::CANCELLED_COPY_SOURCES
            .lock()
            .expect("failed to lock cancelled copy sources");
        assert!(cancelled.contains(&source_path));
        drop(cancelled);

        super::super::state::clear_copy(&source_path);
    }

    #[tokio::test]
    #[serial]
    async fn cancel_copy_cleanup_removes_tracking_state() {
        let source_path = "/tmp/test-copy-source-cleanup.mkv".to_string();

        super::super::state::register_copy(&source_path).expect("register copy should succeed");
        cancel_copy_file(source_path.clone())
            .await
            .expect("cancel copy should succeed");
        super::super::state::clear_copy(&source_path);

        let active = super::super::state::ACTIVE_COPY_SOURCES
            .lock()
            .expect("failed to lock active copy sources");
        assert!(!active.contains(&source_path));
        drop(active);

        let cancelled = super::super::state::CANCELLED_COPY_SOURCES
            .lock()
            .expect("failed to lock cancelled copy sources");
        assert!(!cancelled.contains(&source_path));
    }
}
