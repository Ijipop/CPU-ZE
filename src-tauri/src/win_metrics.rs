//! Windows-native metrics aligned with Task Manager counters.

use std::mem::MaybeUninit;
use windows::Win32::Foundation::{CloseHandle, FILETIME, HANDLE};
use windows::Win32::System::Performance::{QueryPerformanceCounter, QueryPerformanceFrequency};
use windows::Win32::System::ProcessStatus::{
    K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX2,
};
use windows::Win32::System::SystemInformation::{
    GlobalMemoryStatusEx, MEMORYSTATUSEX,
};
use windows::Win32::System::Threading::{
    GetProcessIoCounters, GetSystemTimes, OpenProcess, IO_COUNTERS,
    PROCESS_QUERY_LIMITED_INFORMATION,
};

#[derive(Debug, Clone, Copy)]
pub struct PhysicalMemory {
    pub used_bytes: u64,
    pub total_bytes: u64,
}

pub fn physical_memory() -> Option<PhysicalMemory> {
    let mut status = MEMORYSTATUSEX::default();
    status.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
    unsafe { GlobalMemoryStatusEx(&mut status) }.ok()?;
    let total = status.ullTotalPhys;
    let avail = status.ullAvailPhys;
    Some(PhysicalMemory {
        used_bytes: total.saturating_sub(avail),
        total_bytes: total,
    })
}

fn filetime_to_u64(ft: FILETIME) -> u64 {
    ((ft.dwHighDateTime as u64) << 32) | ft.dwLowDateTime as u64
}

#[derive(Debug, Default)]
pub struct SystemCpuTracker {
    idle: u64,
    kernel: u64,
    user: u64,
    primed: bool,
    last_pct: f32,
}

impl SystemCpuTracker {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn update(&mut self) -> f32 {
        let mut idle = FILETIME::default();
        let mut kernel = FILETIME::default();
        let mut user = FILETIME::default();
        if unsafe { GetSystemTimes(Some(&mut idle), Some(&mut kernel), Some(&mut user)) }.is_err()
        {
            return self.last_pct;
        }

        let idle_t = filetime_to_u64(idle);
        let kernel_t = filetime_to_u64(kernel);
        let user_t = filetime_to_u64(user);

        let pct = if self.primed {
            let d_idle = idle_t.saturating_sub(self.idle);
            let d_kernel = kernel_t.saturating_sub(self.kernel);
            let d_user = user_t.saturating_sub(self.user);
            // Kernel includes idle on Windows.
            let d_total = d_kernel.saturating_add(d_user);
            let d_busy = d_total.saturating_sub(d_idle);
            if d_total > 0 {
                ((d_busy as f64) * 100.0 / (d_total as f64)).clamp(0.0, 100.0) as f32
            } else {
                self.last_pct
            }
        } else {
            0.0
        };

        self.idle = idle_t;
        self.kernel = kernel_t;
        self.user = user_t;
        self.primed = true;
        self.last_pct = pct;
        pct
    }
}

/// Private Working Set (Task Manager "Memory" column) via PROCESS_MEMORY_COUNTERS_EX2.
pub fn private_working_set(pid: u32) -> Option<u64> {
    if pid == 0 {
        return None;
    }
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;
    let result = private_working_set_handle(handle);
    unsafe {
        let _ = CloseHandle(handle);
    }
    result
}

fn private_working_set_handle(handle: HANDLE) -> Option<u64> {
    let mut counters = MaybeUninit::<PROCESS_MEMORY_COUNTERS_EX2>::zeroed();
    let ok = unsafe {
        K32GetProcessMemoryInfo(
            handle,
            counters.as_mut_ptr() as *mut PROCESS_MEMORY_COUNTERS,
            std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX2>() as u32,
        )
    }
    .as_bool();
    if !ok {
        return None;
    }
    let counters = unsafe { counters.assume_init() };
    Some(counters.PrivateWorkingSetSize as u64)
}

/// Cumulative disk-transfer bytes (read + write) for `pid` via `GetProcessIoCounters`.
/// Returns `None` when the target refuses access or has exited.
pub fn process_disk_bytes(pid: u32) -> Option<u64> {
    if pid == 0 {
        return None;
    }
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;
    let mut counters = IO_COUNTERS::default();
    let res = unsafe { GetProcessIoCounters(handle, &mut counters) };
    unsafe {
        let _ = CloseHandle(handle);
    }
    res.ok()?;
    Some(counters.ReadTransferCount.saturating_add(counters.WriteTransferCount))
}

pub fn qpc_now() -> u64 {
    let mut counter = 0i64;
    unsafe {
        let _ = QueryPerformanceCounter(&mut counter);
    }
    counter as u64
}

pub fn qpc_frequency() -> u64 {
    let mut freq = 0i64;
    unsafe {
        let _ = QueryPerformanceFrequency(&mut freq);
    }
    (freq as u64).max(1)
}
