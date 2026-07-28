//! PawnIO client — DeviceIoControl protocol matching LibreHardwareMonitor.
//! Requires the signed PawnIO kernel driver (https://pawnio.eu/).

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use windows::core::PCWSTR;
use windows::Win32::Foundation::{CloseHandle, GENERIC_READ, GENERIC_WRITE, HANDLE, WAIT_OBJECT_0};
use windows::Win32::Storage::FileSystem::{
    CreateFileW, FILE_ATTRIBUTE_NORMAL, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
};
use windows::Win32::System::Threading::{
    CreateMutexW, ReleaseMutex, WaitForSingleObject,
};
use windows::Win32::System::IO::DeviceIoControl;
use windows::Win32::UI::Shell::ShellExecuteW;
use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

use crate::commands::SensorReading;

const DEVICE_TYPE: u32 = 41394u32 << 16;
const IOCTL_PIO_LOAD_BINARY: u32 = DEVICE_TYPE | (0x821 << 2);
const IOCTL_PIO_EXECUTE_FN: u32 = DEVICE_TYPE | (0x841 << 2);
const FN_NAME_LENGTH: usize = 32;

const THM_TCON_CUR_TMP: u64 = 0x0005_9800;
const F17H_TEMP_RANGE_SEL_MASK: u32 = 0x8_0000;
const F17H_TEMP_TJ_SEL_MASK: u32 = 0x3_0000;

const IA32_TEMPERATURE_TARGET: u64 = 0x1A2;
const IA32_PACKAGE_THERM_STATUS: u64 = 0x1B1;

struct PawnHandle(HANDLE);

unsafe impl Send for PawnHandle {}

impl Drop for PawnHandle {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}

struct LoadedModule {
    handle: PawnHandle,
    kind: ModuleKind,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ModuleKind {
    AmdFamily17,
    IntelMsr,
}

static MODULE: Mutex<Option<LoadedModule>> = Mutex::new(None);

fn wide(s: &str) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    std::ffi::OsStr::new(s)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

pub fn is_driver_present() -> bool {
    open_device().is_some()
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

fn open_device() -> Option<PawnHandle> {
    let path = wide(r"\\?\GLOBALROOT\Device\PawnIO");
    let handle = unsafe {
        CreateFileW(
            PCWSTR(path.as_ptr()),
            GENERIC_READ.0 | GENERIC_WRITE.0,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            None,
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            None,
        )
    }
    .ok()?;
    if handle.is_invalid() {
        return None;
    }
    Some(PawnHandle(handle))
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

fn load_binary(handle: &PawnHandle, bin: &[u8]) -> bool {
    let mut returned = 0u32;
    unsafe {
        DeviceIoControl(
            handle.0,
            IOCTL_PIO_LOAD_BINARY,
            Some(bin.as_ptr() as *const _),
            bin.len() as u32,
            None,
            0,
            Some(&mut returned),
            None,
        )
    }
    .is_ok()
}

fn execute(handle: &PawnHandle, name: &str, input: &[u64], out_len: usize) -> Option<Vec<u64>> {
    let mut total_in = vec![0u8; FN_NAME_LENGTH + input.len() * 8];
    let name_bytes = name.as_bytes();
    let copy_len = name_bytes.len().min(FN_NAME_LENGTH - 1);
    total_in[..copy_len].copy_from_slice(&name_bytes[..copy_len]);
    for (i, val) in input.iter().enumerate() {
        let off = FN_NAME_LENGTH + i * 8;
        total_in[off..off + 8].copy_from_slice(&val.to_le_bytes());
    }

    let mut output = vec![0u8; out_len.max(1) * 8];
    let mut returned = 0u32;
    let ok = unsafe {
        DeviceIoControl(
            handle.0,
            IOCTL_PIO_EXECUTE_FN,
            Some(total_in.as_ptr() as *const _),
            total_in.len() as u32,
            Some(output.as_mut_ptr() as *mut _),
            output.len() as u32,
            Some(&mut returned),
            None,
        )
    }
    .is_ok();
    if !ok {
        return None;
    }
    let n = (returned as usize / 8).min(out_len);
    let mut out = Vec::with_capacity(n);
    for i in 0..n {
        let mut buf = [0u8; 8];
        buf.copy_from_slice(&output[i * 8..i * 8 + 8]);
        out.push(u64::from_le_bytes(buf));
    }
    Some(out)
}

fn with_pci_mutex<T>(f: impl FnOnce() -> Option<T>) -> Option<T> {
    let name = wide(r"\BaseNamedObjects\Access_PCI");
    let mutex = unsafe { CreateMutexW(None, false, PCWSTR(name.as_ptr())) }.ok()?;
    let wait = unsafe { WaitForSingleObject(mutex, 50) };
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

fn execute_on_loaded(name: &str, input: &[u64], out_len: usize) -> Option<Vec<u64>> {
    let slot = MODULE.lock().ok()?;
    let module = slot.as_ref()?;
    execute(&module.handle, name, input, out_len)
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

fn try_init() -> bool {
    if let Ok(slot) = MODULE.lock() {
        if slot.is_some() {
            return true;
        }
    }
    let vendor = cpu_vendor();
    let (bin_name, kind) = match vendor {
        CpuVendor::Amd => ("AMDFamily17.bin", ModuleKind::AmdFamily17),
        CpuVendor::Intel => ("IntelMSR.bin", ModuleKind::IntelMsr),
        CpuVendor::Other => return false,
    };
    let path = resource_dir().join(bin_name);
    let Ok(bin) = fs::read(&path) else {
        return false;
    };
    let Some(handle) = open_device() else {
        return false;
    };
    if !load_binary(&handle, &bin) {
        return false;
    }
    if let Ok(mut slot) = MODULE.lock() {
        *slot = Some(LoadedModule { handle, kind });
        true
    } else {
        false
    }
}

pub fn read_cpu_temperature() -> Option<SensorReading> {
    if !try_init() {
        return None;
    }
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
    DriverPresentButLoadFailed,
}

pub fn driver_status() -> PawnIoStatus {
    if is_driver_present() {
        if try_init() {
            PawnIoStatus::Ready
        } else {
            PawnIoStatus::DriverPresentButLoadFailed
        }
    } else if is_listed_in_registry() {
        // Installer finished but device not open yet (service starting).
        PawnIoStatus::DriverPresentButLoadFailed
    } else {
        PawnIoStatus::NotInstalled
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
    let args = wide("/S");
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
