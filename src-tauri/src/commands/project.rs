use crate::commands::ffmpeg::probe_media;
use crate::models::{MediaItem, Project};
use std::fs;
use std::path::Path;
use tauri::AppHandle;
use uuid::Uuid;

#[tauri::command]
pub fn save_project(path: String, project: Project) -> Result<(), String> {
    let json = serde_json::to_string_pretty(&project)
        .map_err(|e| format!("serialize project: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("write project: {e}"))
}

#[tauri::command]
pub fn load_project(path: String) -> Result<Project, String> {
    let data = fs::read_to_string(&path).map_err(|e| format!("read project: {e}"))?;
    serde_json::from_str(&data).map_err(|e| format!("parse project: {e}"))
}

#[tauri::command]
pub async fn add_media(app: AppHandle, path: String) -> Result<MediaItem, String> {
    if !Path::new(&path).exists() {
        return Err(format!("File not found: {path}"));
    }
    let probe = probe_media(&app, &path).await?;
    let name = Path::new(&path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("media")
        .to_string();

    Ok(MediaItem {
        id: Uuid::new_v4().to_string(),
        path,
        name,
        media_type: probe.media_type,
        duration: probe.duration,
        width: probe.width,
        height: probe.height,
        fps: probe.fps,
    })
}
