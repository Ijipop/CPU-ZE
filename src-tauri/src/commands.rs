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
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu: f32,
    pub memory_bytes: u64,
    pub memory_mb: f64,
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
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SensorReading {
    pub celsius: f32,
    pub label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemperatureSnapshot {
    pub cpu: Option<SensorReading>,
    pub gpu: Option<SensorReading>,
}

#[tauri::command]
pub fn list_processes(state: State<'_, AppState>) -> SystemSnapshot {
    let mut sys = state.sys.lock().expect("sys lock");

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

    let cpu_count = sys.cpus().len().max(1);
    let total_cpu = sys.global_cpu_usage();
    let used_memory = sys.used_memory();
    let total_memory = sys.total_memory();

    let mut processes: Vec<ProcessInfo> = sys
        .processes()
        .iter()
        .map(|(pid, process)| {
            let memory_bytes = process.memory();
            ProcessInfo {
                pid: pid.as_u32(),
                name: process.name().to_string_lossy().into_owned(),
                cpu: process.cpu_usage() / cpu_count as f32,
                memory_bytes,
                memory_mb: memory_bytes as f64 / (1024.0 * 1024.0),
                path: process
                    .exe()
                    .map(|p| p.to_string_lossy().into_owned()),
            }
        })
        .filter(|p| !p.name.is_empty())
        .collect();

    processes.sort_by(|a, b| {
        b.cpu
            .partial_cmp(&a.cpu)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    SystemSnapshot {
        total_cpu,
        used_memory,
        total_memory,
        cpu_count,
        processes,
    }
}

#[tauri::command]
pub fn kill_process(pid: u32, state: State<'_, AppState>) -> Result<(), String> {
    let sys = state.sys.lock().expect("sys lock");
    let target = Pid::from_u32(pid);

    match sys.process(target) {
        Some(process) => {
            if process.kill() {
                Ok(())
            } else {
                Err(format!(
                    "Impossible de terminer le processus {} ({})",
                    process.name().to_string_lossy(),
                    pid
                ))
            }
        }
        None => Err(format!("Processus introuvable: {}", pid)),
    }
}

fn read_cpu_temperature(components: &mut Components) -> Option<SensorReading> {
    components.refresh(true);

    components.iter().find_map(|component| {
        component.temperature().map(|celsius| SensorReading {
            celsius,
            label: component.label().to_string(),
        })
    })
}

fn ensure_nvml(nvml_slot: &mut Option<Nvml>) -> Option<&Nvml> {
    if nvml_slot.is_none() {
        *nvml_slot = Nvml::init().ok();
    }
    nvml_slot.as_ref()
}

fn read_gpu_temperature(nvml_slot: &mut Option<Nvml>) -> Option<SensorReading> {
    let nvml = ensure_nvml(nvml_slot)?;
    let device = nvml.device_by_index(0).ok()?;
    let celsius = device.temperature(TemperatureSensor::Gpu).ok()? as f32;
    let label = device
        .name()
        .unwrap_or_else(|_| "GPU NVIDIA".to_string());

    Some(SensorReading { celsius, label })
}

#[tauri::command]
pub fn get_temperatures(state: State<'_, AppState>) -> TemperatureSnapshot {
    let mut components = state.components.lock().expect("components lock");
    let mut nvml = state.nvml.lock().expect("nvml lock");

    TemperatureSnapshot {
        cpu: read_cpu_temperature(&mut components),
        gpu: read_gpu_temperature(&mut nvml),
    }
}
