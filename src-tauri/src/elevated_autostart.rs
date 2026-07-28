//! Elevated logon autostart via Windows Scheduled Task (/RL HIGHEST).
//! One UAC when enabling; then CPU-ZE starts elevated at login without a prompt.

use std::path::PathBuf;
use std::process::Command;
use std::thread;
use std::time::Duration;

use windows::core::PCWSTR;
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

const TASK_NAME: &str = "CPU-ZE";

fn wide(s: &str) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    std::ffi::OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

fn exe_path() -> Result<PathBuf, String> {
    std::env::current_exe().map_err(|e| format!("Impossible de localiser cpu-ze.exe ({e})"))
}

fn shell_runas(file: &str, args: &str) -> Result<(), String> {
    let file_w = wide(file);
    let args_w = wide(args);
    let op = wide("runas");
    let ret = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(op.as_ptr()),
            PCWSTR(file_w.as_ptr()),
            PCWSTR(args_w.as_ptr()),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    if (ret.0 as usize) <= 32 {
        return Err(format!(
            "Échec UAC / planification (code {}) — UAC annulé ?",
            ret.0 as usize
        ));
    }
    Ok(())
}

pub fn is_enabled() -> bool {
    Command::new("schtasks")
        .args(["/Query", "/TN", TASK_NAME])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn enable() -> Result<(), String> {
    let exe = exe_path()?;
    // /TR must be quoted if path has spaces.
    let tr = format!("\"{}\"", exe.display());
    let args = format!(
        "/Create /TN \"{TASK_NAME}\" /TR {tr} /SC ONLOGON /RL HIGHEST /F"
    );
    shell_runas("schtasks.exe", &args)?;

    for _ in 0..25 {
        thread::sleep(Duration::from_millis(200));
        if is_enabled() {
            return Ok(());
        }
    }
    Err(
        "Tâche de démarrage non créée — valide l’UAC, ou réessaie."
            .into(),
    )
}

pub fn disable() -> Result<(), String> {
    if !is_enabled() {
        return Ok(());
    }
    let args = format!("/Delete /TN \"{TASK_NAME}\" /F");
    // Delete often needs elevation for HIGHEST tasks.
    shell_runas("schtasks.exe", &args)?;

    for _ in 0..25 {
        thread::sleep(Duration::from_millis(200));
        if !is_enabled() {
            return Ok(());
        }
    }
    // Fallback: try without elevation (sometimes works).
    let _ = Command::new("schtasks")
        .args(["/Delete", "/TN", TASK_NAME, "/F"])
        .output();
    if is_enabled() {
        return Err(
            "Impossible de supprimer la tâche — valide l’UAC, ou réessaie.".into(),
        );
    }
    Ok(())
}
