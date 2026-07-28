//! Elevated logon autostart via Windows Scheduled Task (/RL HIGHEST).
//! One UAC when enabling; then CPU-ZE starts elevated at login without a prompt.

use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;
use std::thread;
use std::time::Duration;

use windows::core::PCWSTR;
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_HIDE;

const TASK_NAME: &str = "CPU-ZE";
/// Hide console windows when spawning `schtasks` from the GUI process.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

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

fn shell_runas_hidden(file: &str, args: &str) -> Result<(), String> {
    let file_w = wide(file);
    let args_w = wide(args);
    let op = wide("runas");
    // SW_HIDE: avoid a visible schtasks console flashing after UAC.
    let ret = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(op.as_ptr()),
            PCWSTR(file_w.as_ptr()),
            PCWSTR(args_w.as_ptr()),
            PCWSTR::null(),
            SW_HIDE,
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

fn schtasks(args: &[&str]) -> std::io::Result<std::process::Output> {
    Command::new("schtasks")
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
}

pub fn is_enabled() -> bool {
    schtasks(&["/Query", "/TN", TASK_NAME])
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn enable() -> Result<(), String> {
    let exe = exe_path()?;
    let exe_s = exe.to_string_lossy().into_owned();
    if crate::pawnio::is_elevated() {
        // Separate argv entries — no extra quotes needed for spaces.
        let out = schtasks(&[
            "/Create",
            "/TN",
            TASK_NAME,
            "/TR",
            &exe_s,
            "/SC",
            "ONLOGON",
            "/RL",
            "HIGHEST",
            "/F",
        ])
        .map_err(|e| format!("schtasks: {e}"))?;
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr);
            return Err(format!("Création tâche échouée: {err}"));
        }
        return Ok(());
    }

    // ShellExecute one-liner: /TR must be quoted if path has spaces.
    let tr = format!("\"{exe_s}\"");
    let args = format!(
        "/Create /TN \"{TASK_NAME}\" /TR {tr} /SC ONLOGON /RL HIGHEST /F"
    );
    shell_runas_hidden("schtasks.exe", &args)?;

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

    if crate::pawnio::is_elevated() {
        let out = schtasks(&["/Delete", "/TN", TASK_NAME, "/F"])
            .map_err(|e| format!("schtasks: {e}"))?;
        if !out.status.success() && is_enabled() {
            let err = String::from_utf8_lossy(&out.stderr);
            return Err(format!("Suppression tâche échouée: {err}"));
        }
        return Ok(());
    }

    let args = format!("/Delete /TN \"{TASK_NAME}\" /F");
    // Delete often needs elevation for HIGHEST tasks.
    shell_runas_hidden("schtasks.exe", &args)?;

    for _ in 0..25 {
        thread::sleep(Duration::from_millis(200));
        if !is_enabled() {
            return Ok(());
        }
    }
    // Fallback: try without elevation (sometimes works).
    let _ = schtasks(&["/Delete", "/TN", TASK_NAME, "/F"]);
    if is_enabled() {
        return Err(
            "Impossible de supprimer la tâche — valide l’UAC, ou réessaie.".into(),
        );
    }
    Ok(())
}
