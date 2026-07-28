//! PawnIO client via official PawnIOLib.dll (open requires Administrator on current drivers).

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use windows::core::{s, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, HANDLE, WAIT_OBJECT_0};
use windows::Win32::Security::{
    GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY,
};
use windows::Win32::System::LibraryLoader::{
    GetProcAddress, LoadLibraryExW, LOAD_WITH_ALTERED_SEARCH_PATH,
};
use windows::Win32::System::Threading::{
    CreateMutexW, GetCurrentProcess, OpenProcessToken, ReleaseMutex, WaitForSingleObject,
};
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

use crate::commands::SensorReading;

const THM_TCON_CUR_TMP: u64 = 0x0005_9800;
const F17H_TEMP_RANGE_SEL_MASK: u32 = 0x8_0000;
const F17H_TEMP_TJ_SEL_MASK: u32 = 0x3_0000;

const IA32_TEMPERATURE_TARGET: u64 = 0x1A2;
const IA32_PACKAGE_THERM_STATUS: u64 = 0x1B1;

const HRESULT_ACCESS_DENIED: i32 = 0x8007_0005u32 as i32;

type FnOpen = unsafe extern "system" fn(*mut HANDLE) -> i32;
type FnLoad = unsafe extern "system" fn(HANDLE, *const u8, usize) -> i32;
type FnExecute = unsafe extern "system" fn(
    HANDLE,
    *const u8,
    *const u64,
    usize,
    *mut u64,
    usize,
    *mut usize,
) -> i32;
type FnClose = unsafe extern "system" fn(HANDLE) -> i32;

struct PawnApi {
    _lib: windows::Win32::Foundation::HMODULE,
    open: FnOpen,
    load: FnLoad,
    execute: FnExecute,
    close: FnClose,
}

unsafe impl Send for PawnApi {}
unsafe impl Sync for PawnApi {}

struct LoadedModule {
    handle: HANDLE,
    kind: ModuleKind,
    api: &'static PawnApi,
}

unsafe impl Send for LoadedModule {}

impl Drop for LoadedModule {
    fn drop(&mut self) {
        unsafe {
            let _ = (self.api.close)(self.handle);
        }
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ModuleKind {
    AmdFamily17,
    IntelMsr,
}

static API: Mutex<Option<&'static PawnApi>> = Mutex::new(None);
static MODULE: Mutex<Option<LoadedModule>> = Mutex::new(None);

fn wide(s: &str) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    std::ffi::OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

pub fn is_elevated() -> bool {
    unsafe {
        let mut token = HANDLE::default();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token).is_err() {
            return false;
        }
        let mut elevation = TOKEN_ELEVATION::default();
        let mut ret_len = 0u32;
        let ok = GetTokenInformation(
            token,
            TokenElevation,
            Some(&mut elevation as *mut _ as *mut _),
            std::mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut ret_len,
        );
        let _ = CloseHandle(token);
        ok.is_ok() && elevation.TokenIsElevated != 0
    }
}

/// Matches LHM: Uninstall key written by PawnIO_setup.exe.
fn is_listed_in_registry() -> bool {
    use windows::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, HKEY_LOCAL_MACHINE, KEY_READ,
    };
    let path = wide(r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO");
    let mut key = Default::default();
    let ok = unsafe {
        RegOpenKeyExW(
            HKEY_LOCAL_MACHINE,
            PCWSTR(path.as_ptr()),
            Some(0),
            KEY_READ,
            &mut key,
        )
    }
    .is_ok();
    if ok {
        unsafe {
            let _ = RegCloseKey(key);
        }
    }
    ok
}

fn resource_dir() -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for candidate in [
                dir.join("resources").join("pawnio"),
                dir.join("pawnio"),
                dir.join("..").join("resources").join("pawnio"),
            ] {
                if candidate.join("AMDFamily17.bin").exists()
                    || candidate.join("IntelMSR.bin").exists()
                {
                    return candidate;
                }
            }
        }
    }
    PathBuf::from("src-tauri/resources/pawnio")
}

fn lib_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    out.push(PathBuf::from(r"C:\Program Files\PawnIO\PawnIOLib.dll"));
    out.push(resource_dir().join("PawnIOLib.dll"));
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            out.push(dir.join("PawnIOLib.dll"));
            out.push(dir.join("resources").join("pawnio").join("PawnIOLib.dll"));
        }
    }
    out
}

fn load_api() -> Option<&'static PawnApi> {
    if let Ok(slot) = API.lock() {
        if let Some(api) = *slot {
            return Some(api);
        }
    }

    for path in lib_candidates() {
        if !path.exists() {
            continue;
        }
        let w = wide(&path.to_string_lossy());
        let lib = unsafe {
            LoadLibraryExW(
                PCWSTR(w.as_ptr()),
                None,
                LOAD_WITH_ALTERED_SEARCH_PATH,
            )
        }
        .ok()?;

        let open = unsafe { GetProcAddress(lib, s!("pawnio_open"))? };
        let load = unsafe { GetProcAddress(lib, s!("pawnio_load"))? };
        let execute = unsafe { GetProcAddress(lib, s!("pawnio_execute"))? };
        let close = unsafe { GetProcAddress(lib, s!("pawnio_close"))? };

        let api = Box::leak(Box::new(PawnApi {
            _lib: lib,
            open: unsafe { std::mem::transmute::<_, FnOpen>(open) },
            load: unsafe { std::mem::transmute::<_, FnLoad>(load) },
            execute: unsafe { std::mem::transmute::<_, FnExecute>(execute) },
            close: unsafe { std::mem::transmute::<_, FnClose>(close) },
        }));

        if let Ok(mut slot) = API.lock() {
            *slot = Some(api);
        }
        return Some(api);
    }
    None
}

fn with_pci_mutex<T>(f: impl FnOnce() -> Option<T>) -> Option<T> {
    // Win32 name maps to \BaseNamedObjects\Access_PCI (same as LHM / PawnIO docs).
    let name = wide(r"Global\Access_PCI");
    let mutex = unsafe { CreateMutexW(None, false, PCWSTR(name.as_ptr())) }.ok()?;
    let wait = unsafe { WaitForSingleObject(mutex, 2000) };
    if wait != WAIT_OBJECT_0 {
        unsafe {
            let _ = CloseHandle(mutex);
        }
        return None;
    }
    let result = f();
    unsafe {
        let _ = ReleaseMutex(mutex);
        let _ = CloseHandle(mutex);
    }
    result
}

#[derive(Clone, Copy)]
enum CpuVendor {
    Amd,
    Intel,
    Other,
}

fn cpu_vendor() -> CpuVendor {
    #[cfg(target_arch = "x86_64")]
    {
        let cpuid = unsafe { std::arch::x86_64::__cpuid(0) };
        let mut brand = [0u8; 12];
        brand[0..4].copy_from_slice(&cpuid.ebx.to_le_bytes());
        brand[4..8].copy_from_slice(&cpuid.edx.to_le_bytes());
        brand[8..12].copy_from_slice(&cpuid.ecx.to_le_bytes());
        if &brand == b"AuthenticAMD" {
            return CpuVendor::Amd;
        }
        if &brand == b"GenuineIntel" {
            return CpuVendor::Intel;
        }
    }
    CpuVendor::Other
}

fn decode_amd_tctl(raw: u32) -> f32 {
    let temp_offset_flag = (raw & F17H_TEMP_RANGE_SEL_MASK) != 0
        || (raw & F17H_TEMP_TJ_SEL_MASK) == F17H_TEMP_TJ_SEL_MASK;
    let temperature = (raw >> 21) * 125;
    let mut t = temperature as f32 * 0.001;
    if temp_offset_flag {
        t -= 49.0;
    }
    t
}

fn execute_on_loaded(name: &str, input: &[u64], out_len: usize) -> Option<Vec<u64>> {
    let slot = MODULE.lock().ok()?;
    let module = slot.as_ref()?;
    let mut output = vec![0u64; out_len.max(1)];
    let mut returned = 0usize;
    let name_c = std::ffi::CString::new(name).ok()?;
    let hr = unsafe {
        (module.api.execute)(
            module.handle,
            name_c.as_ptr() as *const u8,
            input.as_ptr(),
            input.len(),
            output.as_mut_ptr(),
            output.len(),
            &mut returned,
        )
    };
    if hr < 0 {
        return None;
    }
    output.truncate(returned.min(out_len));
    Some(output)
}

fn read_smn(offset: u64) -> Option<u32> {
    with_pci_mutex(|| {
        let out = execute_on_loaded("ioctl_read_smn", &[offset], 1)?;
        Some(*out.first()? as u32)
    })
}

fn read_msr(index: u64) -> Option<u64> {
    let out = execute_on_loaded("ioctl_read_msr", &[index], 1)?;
    Some(*out.first()?)
}

fn read_amd_package_temp() -> Option<SensorReading> {
    let raw = read_smn(THM_TCON_CUR_TMP)?;
    let celsius = decode_amd_tctl(raw);
    if !(1.0..=120.0).contains(&celsius) {
        return None;
    }
    Some(SensorReading {
        celsius,
        label: "Tctl / Package".into(),
        source: "PawnIO".into(),
    })
}

fn read_intel_package_temp() -> Option<SensorReading> {
    let target = read_msr(IA32_TEMPERATURE_TARGET)?;
    let tj_max = ((target >> 16) & 0xFF) as f32;
    let tj_max = if tj_max > 0.0 { tj_max } else { 100.0 };

    let status = read_msr(IA32_PACKAGE_THERM_STATUS)?;
    if (status & 0x8000_0000) == 0 {
        return None;
    }
    let delta = ((status >> 16) & 0x7F) as f32;
    let celsius = tj_max - delta;
    if !(1.0..=120.0).contains(&celsius) {
        return None;
    }
    Some(SensorReading {
        celsius,
        label: "CPU Package".into(),
        source: "PawnIO".into(),
    })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OpenError {
    AccessDenied,
    Other,
}

fn try_init() -> Result<(), OpenError> {
    if let Ok(slot) = MODULE.lock() {
        if slot.is_some() {
            return Ok(());
        }
    }

    let Some(api) = load_api() else {
        return Err(OpenError::Other);
    };

    let vendor = cpu_vendor();
    let (bin_name, kind) = match vendor {
        CpuVendor::Amd => ("AMDFamily17.bin", ModuleKind::AmdFamily17),
        CpuVendor::Intel => ("IntelMSR.bin", ModuleKind::IntelMsr),
        CpuVendor::Other => return Err(OpenError::Other),
    };
    let path = resource_dir().join(bin_name);
    let Ok(bin) = fs::read(&path) else {
        return Err(OpenError::Other);
    };

    let mut handle = HANDLE::default();
    let hr = unsafe { (api.open)(&mut handle) };
    if hr < 0 {
        if hr == HRESULT_ACCESS_DENIED {
            return Err(OpenError::AccessDenied);
        }
        return Err(OpenError::Other);
    }

    let hr = unsafe { (api.load)(handle, bin.as_ptr(), bin.len()) };
    if hr < 0 {
        unsafe {
            let _ = (api.close)(handle);
        }
        return Err(OpenError::Other);
    }

    if let Ok(mut slot) = MODULE.lock() {
        *slot = Some(LoadedModule { handle, kind, api });
        Ok(())
    } else {
        unsafe {
            let _ = (api.close)(handle);
        }
        Err(OpenError::Other)
    }
}

pub fn read_cpu_temperature() -> Option<SensorReading> {
    try_init().ok()?;
    let kind = MODULE.lock().ok()?.as_ref()?.kind;
    match kind {
        ModuleKind::AmdFamily17 => read_amd_package_temp(),
        ModuleKind::IntelMsr => read_intel_package_temp(),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PawnIoStatus {
    Ready,
    NotInstalled,
    /// Driver/DLL present but opening the device requires elevation.
    NeedsElevation,
    DriverPresentButLoadFailed,
}

pub fn driver_status() -> PawnIoStatus {
    match try_init() {
        Ok(()) => PawnIoStatus::Ready,
        Err(OpenError::AccessDenied) => {
            if is_listed_in_registry() || lib_candidates().iter().any(|p| p.exists()) {
                PawnIoStatus::NeedsElevation
            } else {
                PawnIoStatus::NotInstalled
            }
        }
        Err(OpenError::Other) => {
            if is_listed_in_registry() {
                if is_elevated() {
                    PawnIoStatus::DriverPresentButLoadFailed
                } else {
                    // Non-elevated + registry: most often ACL, not a broken install.
                    PawnIoStatus::NeedsElevation
                }
            } else if Path::new(r"C:\Program Files\PawnIO\PawnIOLib.dll").exists() {
                PawnIoStatus::NeedsElevation
            } else {
                PawnIoStatus::NotInstalled
            }
        }
    }
}

/// Launch PawnIO silent installer elevated (UAC once).
pub fn install_driver_elevated() -> Result<(), String> {
    let setup = resource_dir().join("PawnIO_setup.exe");
    if !setup.exists() {
        return Err(format!(
            "Installateur PawnIO introuvable ({})",
            setup.display()
        ));
    }
    let path = wide(&setup.to_string_lossy());
    let args = wide("-install -silent");
    let op = wide("runas");
    let ret = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(op.as_ptr()),
            PCWSTR(path.as_ptr()),
            PCWSTR(args.as_ptr()),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    if (ret.0 as usize) <= 32 {
        return Err(format!(
            "Échec lancement installateur PawnIO (code {})",
            ret.0 as usize
        ));
    }
    if let Ok(mut slot) = MODULE.lock() {
        *slot = None;
    }
    Ok(())
}

/// Relaunch CPU-ZE elevated so PawnIO device can be opened.
/// Passes `--elevated-handoff=<pid>` so the new instance closes this one (no double window).
pub fn relaunch_elevated() -> Result<(), String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("Impossible de localiser cpu-ze.exe ({e})"))?;
    let path = wide(&exe.to_string_lossy());
    let args = wide(&format!("--elevated-handoff={}", std::process::id()));
    let op = wide("runas");
    let ret = unsafe {
        ShellExecuteW(
            None,
            PCWSTR(op.as_ptr()),
            PCWSTR(path.as_ptr()),
            PCWSTR(args.as_ptr()),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };
    if (ret.0 as usize) <= 32 {
        return Err(format!(
            "Échec relance Admin (code {}) — UAC annulé ?",
            ret.0 as usize
        ));
    }
    Ok(())
}

/// If started with `--elevated-handoff=<pid>`, terminate that process (previous non-admin instance).
pub fn maybe_handoff_previous_instance() {
    let pid = std::env::args().find_map(|a| {
        a.strip_prefix("--elevated-handoff=")
            .and_then(|s| s.parse::<u32>().ok())
    });
    let Some(pid) = pid else {
        return;
    };
    if pid == 0 || pid == std::process::id() {
        return;
    }
    terminate_pid(pid);
}

fn terminate_pid(pid: u32) {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, TerminateProcess, PROCESS_TERMINATE,
    };
    unsafe {
        let Ok(handle) = OpenProcess(PROCESS_TERMINATE, false, pid) else {
            return;
        };
        let _ = TerminateProcess(handle, 0);
        let _ = CloseHandle(handle);
    }
}
