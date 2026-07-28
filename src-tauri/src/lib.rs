mod commands;
mod precision;
mod temps;

use commands::{get_temperatures, kill_process, list_processes, AppState};
use precision::CpuTracker;
use std::sync::Mutex;
use sysinfo::{Components, System};
use tauri_plugin_autostart::MacosLauncher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            sys: Mutex::new(System::new()),
            components: Mutex::new(Components::new()),
            nvml: Mutex::new(None),
            cpu_tracker: Mutex::new(CpuTracker::new()),
        })
        .invoke_handler(tauri::generate_handler![
            list_processes,
            kill_process,
            get_temperatures
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
