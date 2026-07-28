mod commands;
mod pawnio;
mod precision;
mod temps;
mod win_metrics;

use commands::{
    get_temperatures, install_pawnio, kill_process, list_processes, pawnio_status, AppState,
};
use precision::CpuTracker;
use std::sync::Mutex;
use sysinfo::{Components, System};
use tauri_plugin_autostart::MacosLauncher;
use win_metrics::SystemCpuTracker;

/// GitHub fine-grained PAT (Contents: Read) embedded at build via CPUZE_GH_UPDATER_TOKEN.
const GH_UPDATER_TOKEN: &str = env!("CPUZE_GH_UPDATER_TOKEN");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut updater = tauri_plugin_updater::Builder::new();
    if !GH_UPDATER_TOKEN.is_empty() {
        updater = updater
            .header("Authorization", format!("Bearer {GH_UPDATER_TOKEN}"))
            .expect("updater Authorization header")
            .header("User-Agent", "CPU-ZE")
            .expect("updater User-Agent header");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(updater.build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            sys: Mutex::new(System::new()),
            components: Mutex::new(Components::new()),
            nvml: Mutex::new(None),
            cpu_tracker: Mutex::new(CpuTracker::new()),
            system_cpu: Mutex::new(SystemCpuTracker::new()),
        })
        .invoke_handler(tauri::generate_handler![
            list_processes,
            kill_process,
            get_temperatures,
            pawnio_status,
            install_pawnio
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
