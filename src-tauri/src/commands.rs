use crate::precision::CpuTracker;
use nvml_wrapper::enum_wrappers::device::TemperatureSensor;
use nvml_wrapper::Nvml;
use serde::Serialize;
use std::sync::Mutex;
use sysinfo::{
    Components, Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind,
};
use tauri::State;

pub struct AppState {
    pub sys: Mutex<System>,
    pub components: Mutex<Components>,
    pub nvml: Mutex<Option<Nvml>>,
    pub cpu_tracker: Mutex<CpuTracker>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu: f32,
    /// Private bytes on Windows (not Task Manager "Memory" column).
    pub memory_bytes: u64,
    pub memory_mb: f64,
    /// Full working set (includes shared DLLs) — for comparison only.
    pub working_set_bytes: u64,
    pub path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    pub total_cpu: f32,
    pub used_memory: u64,
    pub total_memory: u64,
    pub cpu_count: usize,
    pub processes: Vec<ProcessInfo>,
    /// How metrics are computed (shown in UI).
    pub metrics_note: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SensorReading {
    pub celsius: f32,
    pub label: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemperatureSnapshot {
    pub cpu: Option<SensorReading>,
    pub gpu: Option<SensorReading>,
}

const CRITICAL_PROCESS_NAMES: &[&str] = &[
    "system",
    "csrss.exe",
    "wininit.exe",
    "smss.exe",
    "services.exe",
    "lsass.exe",
    "winlogon.exe",
    "svchost.exe",
];

fn lock_err(what: &str) -> String {
    format!("Verrou {what} empoisonné — redémarre CPU-ZE")
}

fn refresh_system(sys: &mut System) {
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing()
            .with_cpu()
            .with_memory()
            .with_exe(UpdateKind::OnlyIfNotSet),
    );
}

fn build_snapshot(sys: &System, tracker: &mut CpuTracker) -> SystemSnapshot {
    let cpu_count = sys.cpus().len().max(1) as u64;
    let total_cpu = sys.global_cpu_usage();
    let used_memory = sys.used_memory();
    let total_memory = sys.total_memory();

    let mut live_pids = Vec::with_capacity(sys.processes().len());
    let mut processes: Vec<ProcessInfo> = sys
        .processes()
        .iter()
        .map(|(pid, process)| {
            let pid_u = pid.as_u32();
            live_pids.push(pid_u);

            // Task Manager Processes formula (post–Windows 11 24H2 standard):
            // 100 * ΔCPU_time / (Δwall * logical_processors)
            let cpu = tracker.update(pid_u, process.accumulated_cpu_time(), cpu_count);

            // On Windows, sysinfo virtual_memory() == PrivateUsage (private bytes).
            let memory_bytes = process.virtual_memory();
            let working_set_bytes = process.memory();

            ProcessInfo {
                pid: pid_u,
                name: process.name().to_string_lossy().into_owned(),
                cpu,
                memory_bytes,
                memory_mb: memory_bytes as f64 / (1024.0 * 1024.0),
                working_set_bytes,
                path: process
                    .exe()
                    .map(|p| p.to_string_lossy().into_owned()),
            }
        })
        .filter(|p| !p.name.is_empty())
        .collect();

    tracker.retain(&live_pids);

    processes.sort_by(|a, b| {
        b.cpu
            .partial_cmp(&a.cpu)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    SystemSnapshot {
        total_cpu,
        used_memory,
        total_memory,
        cpu_count: cpu_count as usize,
        processes,
        metrics_note: "CPU = Δtemps / (Δhorloge × cœurs) · RAM = octets privés (≠ colonne Mémoire du Gestionnaire)"
            .into(),
    }
}

#[tauri::command]
pub fn list_processes(state: State<'_, AppState>) -> Result<SystemSnapshot, String> {
    static WARMED: std::sync::atomic::AtomicBool =
        std::sync::atomic::AtomicBool::new(false);
    let first = !WARMED.swap(true, std::sync::atomic::Ordering::SeqCst);

    if first {
        // Seed under lock, then release before sleeping so kill/refresh can proceed.
        {
            let mut sys = state.sys.lock().map_err(|_| lock_err("sys"))?;
            let mut tracker = state
                .cpu_tracker
                .lock()
                .map_err(|_| lock_err("cpu_tracker"))?;
            refresh_system(&mut sys);
            for (pid, process) in sys.processes() {
                tracker.seed(pid.as_u32(), process.accumulated_cpu_time());
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
    }

    let mut sys = state.sys.lock().map_err(|_| lock_err("sys"))?;
    let mut tracker = state
        .cpu_tracker
        .lock()
        .map_err(|_| lock_err("cpu_tracker"))?;

    refresh_system(&mut sys);
    Ok(build_snapshot(&sys, &mut tracker))
}

fn is_critical_process_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    CRITICAL_PROCESS_NAMES
        .iter()
        .any(|blocked| lower == *blocked)
}

#[tauri::command]
pub fn kill_process(pid: u32, state: State<'_, AppState>) -> Result<(), String> {
    if pid == std::process::id() {
        return Err("Impossible de terminer CPU-ZE lui-même".into());
    }
    if pid == 0 || pid == 4 {
        return Err("Processus système protégé".into());
    }

    let sys = state.sys.lock().map_err(|_| lock_err("sys"))?;
    let target = Pid::from_u32(pid);

    match sys.process(target) {
        Some(process) => {
            let name = process.name().to_string_lossy().into_owned();
            if is_critical_process_name(&name) {
                return Err(format!(
                    "Processus critique protégé : {} ({})",
                    name, pid
                ));
            }
            if process.kill() {
                Ok(())
            } else {
                Err(format!(
                    "Impossible de terminer le processus {} ({}) — accès refusé ou déjà terminé",
                    name, pid
                ))
            }
        }
        None => Err(format!("Processus introuvable: {}", pid)),
    }
}

fn read_cpu_temperature(components: &mut Components) -> Option<SensorReading> {
    crate::temps::read_cpu_from_lhm()
        .or_else(crate::temps::read_cpu_from_hwinfo)
        .or_else(|| crate::temps::read_cpu_from_acpi(components))
}

fn ensure_nvml(nvml_slot: &mut Option<Nvml>) -> Option<&Nvml> {
    if nvml_slot.is_none() {
        *nvml_slot = Nvml::init().ok();
    }
    nvml_slot.as_ref()
}

fn read_gpu_temperature(nvml_slot: &mut Option<Nvml>) -> Option<SensorReading> {
    if let Some(nvml) = ensure_nvml(nvml_slot) {
        if let Ok(device) = nvml.device_by_index(0) {
            if let Ok(celsius) = device.temperature(TemperatureSensor::Gpu) {
                let label = device
                    .name()
                    .unwrap_or_else(|_| "GPU NVIDIA".to_string());
                return Some(SensorReading {
                    celsius: celsius as f32,
                    label,
                    source: "NVML".into(),
                });
            }
        }
    }

    crate::temps::read_gpu_from_lhm().or_else(crate::temps::read_gpu_from_hwinfo)
}

#[tauri::command]
pub fn get_temperatures(state: State<'_, AppState>) -> Result<TemperatureSnapshot, String> {
    let mut components = state
        .components
        .lock()
        .map_err(|_| lock_err("components"))?;
    let mut nvml = state.nvml.lock().map_err(|_| lock_err("nvml"))?;

    Ok(TemperatureSnapshot {
        cpu: read_cpu_temperature(&mut components),
        gpu: read_gpu_temperature(&mut nvml),
    })
}
