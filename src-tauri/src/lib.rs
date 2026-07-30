mod commands;
mod elevated_autostart;
mod pawnio;
mod precision;
mod temps;
mod win_metrics;

use commands::{
    apply_window_layout, elevated_autostart_disable, elevated_autostart_enable,
    elevated_autostart_is_enabled, get_temperatures, install_pawnio, kill_process,
    list_processes, pawnio_status, relaunch_elevated, set_hidden_from_taskbar,
    set_window_compact_mode, AppState,
};
use precision::CpuTracker;
use std::sync::Mutex;
use sysinfo::{Components, System};
use tauri_plugin_autostart::MacosLauncher;
use win_metrics::SystemCpuTracker;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Close the previous non-admin instance after a successful UAC relaunch.
    crate::pawnio::maybe_handoff_previous_instance();

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
            system_cpu: Mutex::new(SystemCpuTracker::new()),
        })
        .invoke_handler(tauri::generate_handler![
            list_processes,
            kill_process,
            get_temperatures,
            pawnio_status,
            install_pawnio,
            relaunch_elevated,
            elevated_autostart_is_enabled,
            elevated_autostart_enable,
            elevated_autostart_disable,
            set_hidden_from_taskbar,
            apply_window_layout,
            set_window_compact_mode
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
