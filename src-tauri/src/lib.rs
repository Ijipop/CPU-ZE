mod commands;
mod elevated_autostart;
mod pawnio;
mod precision;
mod proc_ctrl;
mod temps;
mod win_icons;
mod win_metrics;

use commands::{
    apply_window_layout, elevated_autostart_disable, elevated_autostart_enable,
    elevated_autostart_is_enabled, get_process_affinity, get_process_command_lines,
    get_process_icons, get_temperatures, install_pawnio, kill_process, list_processes,
    on_app_resume, pawnio_status, relaunch_elevated, resume_process, reveal_in_explorer,
    set_hidden_from_taskbar, set_process_affinity, set_process_priority,
    set_window_compact_mode, suspend_process, AppState,
};
use precision::CpuTracker;
use std::sync::Mutex;
use sysinfo::{Components, System};
use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;
use win_metrics::SystemCpuTracker;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Close the previous non-admin instance after a successful UAC relaunch.
    crate::pawnio::maybe_handoff_previous_instance();

    // single-instance must be first: focus/show the running window instead of ghosts.
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
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
            get_process_command_lines,
            kill_process,
            get_temperatures,
            on_app_resume,
            pawnio_status,
            install_pawnio,
            relaunch_elevated,
            elevated_autostart_is_enabled,
            elevated_autostart_enable,
            elevated_autostart_disable,
            set_hidden_from_taskbar,
            apply_window_layout,
            set_window_compact_mode,
            reveal_in_explorer,
            get_process_icons,
            set_process_priority,
            suspend_process,
            resume_process,
            get_process_affinity,
            set_process_affinity
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
