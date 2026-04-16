use std::path::Path;

/// Save shared MediaFlow data to .mediaflow.json file
#[tauri::command]
pub(crate) async fn save_mediaflow_data(media_path: String, data: String) -> Result<(), String> {
    let json_path = get_mediaflow_data_path(&media_path);

    std::fs::write(&json_path, &data)
        .map_err(|e| format!("Failed to save MediaFlow data: {}", e))?;

    Ok(())
}

/// Load shared MediaFlow data from .mediaflow.json file
#[tauri::command]
pub(crate) async fn load_mediaflow_data(media_path: String) -> Result<Option<String>, String> {
    let json_path = get_mediaflow_data_path(&media_path);

    if !Path::new(&json_path).exists() {
        return Ok(None);
    }

    let data = std::fs::read_to_string(&json_path)
        .map_err(|e| format!("Failed to read MediaFlow data: {}", e))?;

    Ok(Some(data))
}

/// Delete shared MediaFlow data file
#[tauri::command]
pub(crate) async fn delete_mediaflow_data(media_path: String) -> Result<(), String> {
    let json_path = get_mediaflow_data_path(&media_path);

    if Path::new(&json_path).exists() {
        std::fs::remove_file(&json_path)
            .map_err(|e| format!("Failed to delete MediaFlow data: {}", e))?;
    }

    Ok(())
}

/// Save transcription data to .mediaflow.json file
#[tauri::command]
pub(crate) async fn save_transcription_data(
    audio_path: String,
    data: String,
) -> Result<(), String> {
    save_mediaflow_data(audio_path, data).await
}

/// Load transcription data from .mediaflow.json file
#[tauri::command]
pub(crate) async fn load_transcription_data(audio_path: String) -> Result<Option<String>, String> {
    load_mediaflow_data(audio_path).await
}

/// Delete transcription data file
#[tauri::command]
pub(crate) async fn delete_transcription_data(audio_path: String) -> Result<(), String> {
    delete_mediaflow_data(audio_path).await
}

/// Get the path for the MediaFlow data JSON file
fn get_mediaflow_data_path(media_path: &str) -> String {
    let path = Path::new(media_path);
    let parent = path.parent().unwrap_or(Path::new("."));
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("media");

    parent
        .join(format!("{}.mediaflow.json", stem))
        .to_string_lossy()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::{
        delete_mediaflow_data, delete_transcription_data, get_mediaflow_data_path,
        load_mediaflow_data, load_transcription_data, save_mediaflow_data, save_transcription_data,
    };

    #[tokio::test]
    async fn mediaflow_data_roundtrip_save_load_delete() {
        let dir = tempfile::tempdir().expect("failed to create tempdir");
        let media_path = dir.path().join("movie.mp4");
        std::fs::write(&media_path, b"video").expect("failed to create media file");
        let json_path = dir.path().join("movie.mediaflow.json");

        save_mediaflow_data(
            media_path.to_string_lossy().to_string(),
            "{\"hello\":\"world\"}".to_string(),
        )
        .await
        .expect("save should succeed");
        assert!(json_path.exists());

        let loaded = load_mediaflow_data(media_path.to_string_lossy().to_string())
            .await
            .expect("load should succeed");
        assert_eq!(loaded, Some("{\"hello\":\"world\"}".to_string()));

        delete_mediaflow_data(media_path.to_string_lossy().to_string())
            .await
            .expect("delete should succeed");
        assert!(!json_path.exists());
    }

    #[tokio::test]
    async fn transcription_alias_functions_delegate_to_mediaflow() {
        let dir = tempfile::tempdir().expect("failed to create tempdir");
        let audio_path = dir.path().join("voice.wav");
        std::fs::write(&audio_path, b"audio").expect("failed to create audio file");
        let json_path = dir.path().join("voice.mediaflow.json");

        save_transcription_data(
            audio_path.to_string_lossy().to_string(),
            "{\"segments\":1}".to_string(),
        )
        .await
        .expect("save transcription should succeed");
        assert!(json_path.exists());

        let loaded = load_transcription_data(audio_path.to_string_lossy().to_string())
            .await
            .expect("load transcription should succeed");
        assert_eq!(loaded, Some("{\"segments\":1}".to_string()));

        delete_transcription_data(audio_path.to_string_lossy().to_string())
            .await
            .expect("delete transcription should succeed");
        assert!(!json_path.exists());
    }

    #[test]
    fn get_mediaflow_data_path_uses_media_stem() {
        let path = get_mediaflow_data_path("/tmp/example.file.mkv");
        assert!(path.ends_with("example.file.mediaflow.json"));
    }
}
