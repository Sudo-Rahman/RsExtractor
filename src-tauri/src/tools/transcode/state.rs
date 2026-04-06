use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

/// Store transcode process IDs keyed by input path for individual cancellation.
pub(super) static TRANSCODE_PROCESS_IDS: LazyLock<Mutex<HashMap<String, u32>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Store output paths so partially-written files can be removed on cancel/error.
pub(super) static TRANSCODE_OUTPUT_PATHS: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
