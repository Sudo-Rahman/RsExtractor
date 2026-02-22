use std::collections::HashSet;
use std::sync::{LazyLock, Mutex};

/// Source paths currently being copied by the rename copy operation.
pub(super) static ACTIVE_COPY_SOURCES: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

/// Source paths for which cancellation has been requested.
pub(super) static CANCELLED_COPY_SOURCES: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

const COPY_STATE_LOCK_ERROR: &str = "Failed to acquire copy state lock";

pub(super) fn register_copy(source_path: &str) -> Result<(), String> {
    let source_path = source_path.to_string();
    let mut active_guard = ACTIVE_COPY_SOURCES
        .lock()
        .map_err(|_| COPY_STATE_LOCK_ERROR.to_string())?;
    let mut cancelled_guard = CANCELLED_COPY_SOURCES
        .lock()
        .map_err(|_| COPY_STATE_LOCK_ERROR.to_string())?;
    active_guard.insert(source_path.clone());
    cancelled_guard.remove(&source_path);

    Ok(())
}

pub(super) fn request_copy_cancel(source_path: &str) -> Result<(), String> {
    let active_guard = ACTIVE_COPY_SOURCES
        .lock()
        .map_err(|_| COPY_STATE_LOCK_ERROR.to_string())?;

    if !active_guard.contains(source_path) {
        return Ok(());
    }

    let mut cancelled_guard = CANCELLED_COPY_SOURCES
        .lock()
        .map_err(|_| COPY_STATE_LOCK_ERROR.to_string())?;
    cancelled_guard.insert(source_path.to_string());

    Ok(())
}

pub(super) fn is_copy_cancel_requested(source_path: &str) -> Result<bool, String> {
    let cancelled_guard = CANCELLED_COPY_SOURCES
        .lock()
        .map_err(|_| COPY_STATE_LOCK_ERROR.to_string())?;
    Ok(cancelled_guard.contains(source_path))
}

pub(super) fn clear_copy(source_path: &str) {
    if let Ok(mut active_guard) = ACTIVE_COPY_SOURCES.lock()
        && let Ok(mut cancelled_guard) = CANCELLED_COPY_SOURCES.lock()
    {
        active_guard.remove(source_path);
        cancelled_guard.remove(source_path);
    }
}
