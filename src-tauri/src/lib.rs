use serde::{Deserialize, Serialize};
use std::process::Command;
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

#[derive(Debug, Serialize, Deserialize)]
pub struct ExtractionError {
    message: String,
}

impl From<std::io::Error> for ExtractionError {
    fn from(err: std::io::Error) -> Self {
        ExtractionError {
            message: err.to_string(),
        }
    }
}

impl From<String> for ExtractionError {
    fn from(msg: String) -> Self {
        ExtractionError { message: msg }
    }
}

impl std::fmt::Display for ExtractionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

/// Probe a video file using ffprobe and return JSON output
#[tauri::command]
async fn probe_file(path: String) -> Result<String, String> {
    let output = Command::new("ffprobe")
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            &path,
        ])
        .output()
        .map_err(|e| {
            format!(
                "Failed to execute ffprobe: {}. Make sure FFmpeg is installed.",
                e
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe failed: {}", stderr));
    }

    String::from_utf8(output.stdout).map_err(|e| format!("Invalid UTF-8 output: {}", e))
}

/// Extract a track from a video file using ffmpeg
#[tauri::command]
async fn extract_track(
    input_path: String,
    output_path: String,
    track_index: i32,
    track_type: String,
    codec: String,
) -> Result<(), String> {
    // Build the map argument based on track type
    let map_arg = format!("0:{}", track_index);

    // Determine codec options based on track type
    let mut args = vec![
        "-y".to_string(), // Overwrite output
        "-i".to_string(),
        input_path.clone(),
        "-map".to_string(),
        map_arg,
    ];

    // Add codec-specific options
    match track_type.as_str() {
        "subtitle" => {
            // For subtitles, we might need to convert
            match codec.as_str() {
                "ass" | "ssa" => {
                    args.extend(["-c:s".to_string(), "copy".to_string()]);
                }
                "subrip" | "srt" => {
                    args.extend(["-c:s".to_string(), "srt".to_string()]);
                }
                "webvtt" => {
                    args.extend(["-c:s".to_string(), "webvtt".to_string()]);
                }
                "hdmv_pgs_subtitle" | "dvd_subtitle" => {
                    args.extend(["-c:s".to_string(), "copy".to_string()]);
                }
                _ => {
                    args.extend(["-c:s".to_string(), "copy".to_string()]);
                }
            }
        }
        "audio" => {
            args.extend(["-c:a".to_string(), "copy".to_string()]);
            args.extend(["-vn".to_string()]); // No video
        }
        "video" => {
            args.extend(["-c:v".to_string(), "copy".to_string()]);
            args.extend(["-an".to_string()]); // No audio
            args.extend(["-sn".to_string()]); // No subtitles
        }
        _ => {
            args.extend(["-c".to_string(), "copy".to_string()]);
        }
    }

    args.push(output_path.clone());

    let output = Command::new("ffmpeg").args(&args).output().map_err(|e| {
        format!(
            "Failed to execute ffmpeg: {}. Make sure FFmpeg is installed.",
            e
        )
    })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg extraction failed: {}", stderr));
    }

    Ok(())
}

/// Open a folder in the system file manager
#[tauri::command]
async fn open_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }

    Ok(())
}

/// Check if ffmpeg and ffprobe are available
#[tauri::command]
async fn check_ffmpeg() -> Result<bool, String> {
    let ffprobe_check = Command::new("ffprobe").arg("-version").output();

    let ffmpeg_check = Command::new("ffmpeg").arg("-version").output();

    match (ffprobe_check, ffmpeg_check) {
        (Ok(probe), Ok(mpeg)) if probe.status.success() && mpeg.status.success() => Ok(true),
        _ => Ok(false),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(setup)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            probe_file,
            extract_track,
            open_folder,
            check_ffmpeg
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn setup<'a>(app: &'a mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let handle_clone1 = app.handle().clone();
    create_main_window(handle_clone1.clone());
    Ok(())
}

pub fn create_main_window(app: tauri::AppHandle) {
    let window = tauri::WebviewWindowBuilder::new(&app, "main", tauri::WebviewUrl::App("".into()))
        .title("")
        .inner_size(1200.0, 600.0)
        .min_inner_size(1000.0, 600.0)
        .center();

    #[cfg(target_os = "macos")]
    let window = window
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .shadow(true)
        .transparent(true)
        .traffic_light_position(tauri::Position::Logical(tauri::LogicalPosition {
            x: 20.0,
            y: 30.0,
        }));
    let window = window.build().unwrap();

    #[cfg(target_os = "macos")]
    apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, Some(25.0))
        .expect("Unsupported platform! 'apply_vibrancy' is only supported on macOS");
}
