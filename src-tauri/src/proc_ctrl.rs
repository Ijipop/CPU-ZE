//! Win32 process control: priority class, suspend/resume, affinity.

use std::sync::atomic::{AtomicUsize, Ordering};

use windows::core::{s, PCSTR, PCWSTR};
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
use windows::Win32::System::Threading::{
    GetProcessAffinityMask, OpenProcess, SetPriorityClass, SetProcessAffinityMask,
    ABOVE_NORMAL_PRIORITY_CLASS, BELOW_NORMAL_PRIORITY_CLASS, HIGH_PRIORITY_CLASS,
    IDLE_PRIORITY_CLASS, NORMAL_PRIORITY_CLASS, PROCESS_CREATION_FLAGS,
    PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_INFORMATION, PROCESS_SUSPEND_RESUME,
    REALTIME_PRIORITY_CLASS,
};

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn map_priority(class: &str) -> Result<PROCESS_CREATION_FLAGS, String> {
    Ok(match class {
        "idle" => IDLE_PRIORITY_CLASS,
        "belowNormal" | "below_normal" => BELOW_NORMAL_PRIORITY_CLASS,
        "normal" => NORMAL_PRIORITY_CLASS,
        "aboveNormal" | "above_normal" => ABOVE_NORMAL_PRIORITY_CLASS,
        "high" => HIGH_PRIORITY_CLASS,
        "realtime" => REALTIME_PRIORITY_CLASS,
        other => return Err(format!("Classe de priorité inconnue : {other}")),
    })
}

pub fn set_priority(pid: u32, class: &str) -> Result<(), String> {
    let flags = map_priority(class)?;
    unsafe {
        let handle = OpenProcess(PROCESS_SET_INFORMATION, false, pid)
            .map_err(|e| format!("OpenProcess: {e}"))?;
        let res = SetPriorityClass(handle, flags);
        let _ = CloseHandle(handle);
        res.map_err(|e| format!("SetPriorityClass: {e}"))
    }
}

pub fn get_affinity(pid: u32) -> Result<(u64, u64), String> {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
            .map_err(|e| format!("OpenProcess: {e}"))?;
        let mut process_mask: usize = 0;
        let mut system_mask: usize = 0;
        let res = GetProcessAffinityMask(handle, &mut process_mask, &mut system_mask);
        let _ = CloseHandle(handle);
        res.map_err(|e| format!("GetProcessAffinityMask: {e}"))?;
        Ok((process_mask as u64, system_mask as u64))
    }
}

pub fn set_affinity(pid: u32, mask: u64) -> Result<(), String> {
    if mask == 0 {
        return Err("Masque d'affinité vide".into());
    }
    unsafe {
        let handle = OpenProcess(PROCESS_SET_INFORMATION, false, pid)
            .map_err(|e| format!("OpenProcess: {e}"))?;
        let res = SetProcessAffinityMask(handle, mask as usize);
        let _ = CloseHandle(handle);
        res.map_err(|e| format!("SetProcessAffinityMask: {e}"))
    }
}

type NtProcessFn = unsafe extern "system" fn(HANDLE) -> i32;

/// Sentinel meaning "already resolved; nothing there".
const NT_RESOLVED_NULL: usize = 1;

fn load_ntdll_fn(cache: &AtomicUsize, name: PCSTR) -> Option<NtProcessFn> {
    let cached = cache.load(Ordering::Acquire);
    if cached == NT_RESOLVED_NULL {
        return None;
    }
    if cached != 0 {
        return Some(unsafe { std::mem::transmute::<usize, NtProcessFn>(cached) });
    }

    let wide_name = wide("ntdll.dll");
    let module = unsafe { LoadLibraryW(PCWSTR(wide_name.as_ptr())) }.ok()?;
    let addr = match unsafe { GetProcAddress(module, name) } {
        Some(a) => a as usize,
        None => {
            cache.store(NT_RESOLVED_NULL, Ordering::Release);
            return None;
        }
    };
    cache.store(addr, Ordering::Release);
    Some(unsafe { std::mem::transmute::<usize, NtProcessFn>(addr) })
}

fn nt_suspend() -> Option<NtProcessFn> {
    static ADDR: AtomicUsize = AtomicUsize::new(0);
    load_ntdll_fn(&ADDR, s!("NtSuspendProcess"))
}

fn nt_resume() -> Option<NtProcessFn> {
    static ADDR: AtomicUsize = AtomicUsize::new(0);
    load_ntdll_fn(&ADDR, s!("NtResumeProcess"))
}

pub fn suspend(pid: u32) -> Result<(), String> {
    let f = nt_suspend().ok_or_else(|| "NtSuspendProcess indisponible".to_string())?;
    unsafe {
        let handle = OpenProcess(PROCESS_SUSPEND_RESUME, false, pid)
            .map_err(|e| format!("OpenProcess: {e}"))?;
        let hr = f(handle);
        let _ = CloseHandle(handle);
        if hr < 0 {
            return Err(format!("NtSuspendProcess a échoué (NTSTATUS 0x{:08X})", hr as u32));
        }
    }
    Ok(())
}

pub fn resume(pid: u32) -> Result<(), String> {
    let f = nt_resume().ok_or_else(|| "NtResumeProcess indisponible".to_string())?;
    unsafe {
        let handle = OpenProcess(PROCESS_SUSPEND_RESUME, false, pid)
            .map_err(|e| format!("OpenProcess: {e}"))?;
        let hr = f(handle);
        let _ = CloseHandle(handle);
        if hr < 0 {
            return Err(format!("NtResumeProcess a échoué (NTSTATUS 0x{:08X})", hr as u32));
        }
    }
    Ok(())
}
