mod commands;
mod models;

use commands::ffmpeg::{export_gif, get_frame_at, get_frame_data_url, render_project};
use commands::project::{add_media, load_project, save_project};
use commands::wlmp::load_wlmp;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            load_wlmp,
            load_project,
            save_project,
            add_media,
            get_frame_at,
            get_frame_data_url,
            render_project,
            export_gif
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
