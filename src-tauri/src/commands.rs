use crate::precision::CpuTracker;
use crate::win_metrics::{self, SystemCpuTracker};
use nvml_wrapper::enum_wrappers::device::TemperatureSensor;
use nvml_wrapper::Nvml;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use sysinfo::{
    Components, Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind,
};
use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, PhysicalSize, State};

pub struct AppState {
    pub sys: Mutex<System>,
    pub components: Mutex<Components>,
    pub nvml: Mutex<Option<Nvml>>,
    pub cpu_tracker: Mutex<CpuTracker>,
    pub system_cpu: Mutex<SystemCpuTracker>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pub pid: u32,
    pub name: String,
    pub cpu: f32,
    /// Private Working Set — Task Manager Processes "Memory" column.
    pub memory_bytes: u64,
    pub memory_mb: f64,
    /// PrivateUsage (commit / private bytes).
    pub private_bytes: u64,
    /// Full working set (private + shared).
    pub working_set_bytes: u64,
    pub path: Option<String>,
    pub parent_pid: Option<u32>,
    pub command_line: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSnapshot {
    pub total_cpu: f32,
    pub used_memory: u64,
    pub total_memory: u64,
    pub cpu_count: usize,
    /// Live process count (even when `processes` is omitted in light mode).
    pub process_count: usize,
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
    /// GPU utilization % (0–100) from NVML when available.
    pub gpu_util: Option<f32>,
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
    "explorer.exe",
    "dwm.exe",
];

/// Cap Win32 OpenProcess calls per tick — hung targets can block for seconds.
const PWS_MAX_QUERIES_PER_TICK: usize = 12;
const PWS_CACHE_TTL: Duration = Duration::from_secs(4);
const CMD_LINES_MAX_PIDS: usize = 40;

struct PwsCache {
    map: HashMap<u32, (Instant, u64)>,
}

impl PwsCache {
    fn new() -> Self {
        Self {
            map: HashMap::new(),
        }
    }
}

fn pws_cache() -> &'static Mutex<PwsCache> {
    use std::sync::OnceLock;
    static CACHE: OnceLock<Mutex<PwsCache>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(PwsCache::new()))
}

fn lock_err(what: &str) -> String {
    format!("Verrou {what} empoisonné — redémarre CPU-ZE")
}

/// Cap cmdline payload — some hosts stuff huge argv into the PEB.
const CMD_LINE_MAX_CHARS: usize = 8 * 1024;

fn format_command_line(process: &sysinfo::Process) -> Option<String> {
    let parts = process.cmd();
    if parts.is_empty() {
        return None;
    }
    let mut out = String::new();
    for (i, part) in parts.iter().enumerate() {
        if i > 0 {
            out.push(' ');
        }
        out.push_str(&part.to_string_lossy());
        if out.len() >= CMD_LINE_MAX_CHARS {
            out.truncate(CMD_LINE_MAX_CHARS);
            out.push('…');
            break;
        }
    }
    if out.is_empty() {
        None
    } else {
        Some(out)
    }
}

fn refresh_system(sys: &mut System, with_cmd: bool) {
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    let mut kind = ProcessRefreshKind::nothing()
        .with_cpu()
        .with_memory()
        .with_exe(UpdateKind::OnlyIfNotSet);
    if with_cmd {
        kind = kind.with_cmd(UpdateKind::OnlyIfNotSet);
    }
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, kind);
}

fn refresh_system_light(sys: &mut System) {
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    // Process list only for the count — skip per-process CPU/memory sampling.
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing(),
    );
}

fn build_snapshot(
    sys: &System,
    tracker: &mut CpuTracker,
    system_cpu: &mut SystemCpuTracker,
    detail: bool,
    include_cmd: bool,
) -> SystemSnapshot {
    let cpu_count = sys.cpus().len().max(1) as u64;
    let total_cpu = system_cpu.update();

    let (used_memory, total_memory) = win_metrics::physical_memory()
        .map(|m| (m.used_bytes, m.total_bytes))
        .unwrap_or_else(|| (sys.used_memory(), sys.total_memory()));

    let process_count = sys.processes().len();

    if !detail {
        return SystemSnapshot {
            total_cpu,
            used_memory,
            total_memory,
            cpu_count: cpu_count as usize,
            process_count,
            processes: Vec::new(),
            metrics_note: "CPU = GetSystemTimes · RAM = GlobalMemoryStatusEx".into(),
        };
    }

    let mut live_pids = Vec::with_capacity(process_count);
    let processes: Vec<ProcessInfo> = sys
        .processes()
        .iter()
        .map(|(pid, process)| {
            let pid_u = pid.as_u32();
            live_pids.push(pid_u);

            let cpu = tracker.update(pid_u, process.accumulated_cpu_time(), cpu_count);

            let private_bytes = process.virtual_memory();
            let working_set_bytes = process.memory();
            // Prefer Private Working Set later; start from working set (not commit).
            let memory_bytes = working_set_bytes;

            let parent_pid = process.parent().map(|p| p.as_u32()).filter(|&pp| pp != pid_u);

            ProcessInfo {
                pid: pid_u,
                name: process.name().to_string_lossy().into_owned(),
                cpu,
                memory_bytes,
                memory_mb: memory_bytes as f64 / (1024.0 * 1024.0),
                private_bytes,
                working_set_bytes,
                path: process
                    .exe()
                    .map(|p| p.to_string_lossy().into_owned()),
                parent_pid,
                command_line: if include_cmd {
                    format_command_line(process)
                } else {
                    None
                },
            }
        })
        .filter(|p| !p.name.is_empty())
        .collect();

    tracker.retain(&live_pids);
    // FE sorts — skip full-list sort here.

    SystemSnapshot {
        total_cpu,
        used_memory,
        total_memory,
        cpu_count: cpu_count as usize,
        process_count: processes.len(),
        processes,
        metrics_note: "CPU = GetProcessTimes/QPC · RAM = Private Working Set (colonne Mémoire TM)"
            .into(),
    }
}

/// Enrich with Private Working Set outside the sysinfo lock, with TTL + query cap.
fn enrich_private_working_set(processes: &mut [ProcessInfo]) {
    let Ok(mut cache) = pws_cache().lock() else {
        return;
    };
    let now = Instant::now();
    cache.map.retain(|_, (t, _)| now.duration_since(*t) < PWS_CACHE_TTL * 4);

    // Prefer refreshing the hungriest / hottest first (visible near top of either sort).
    let mut order: Vec<usize> = (0..processes.len()).collect();
    order.sort_by(|&a, &b| {
        let pa = &processes[a];
        let pb = &processes[b];
        pb.working_set_bytes
            .cmp(&pa.working_set_bytes)
            .then_with(|| {
                pb.cpu
                    .partial_cmp(&pa.cpu)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    });

    let mut queries = 0usize;
    for idx in order {
        let proc = &mut processes[idx];
        if let Some((t, bytes)) = cache.map.get(&proc.pid) {
            if now.duration_since(*t) < PWS_CACHE_TTL {
                proc.memory_bytes = *bytes;
                proc.memory_mb = *bytes as f64 / (1024.0 * 1024.0);
                continue;
            }
        }

        if queries >= PWS_MAX_QUERIES_PER_TICK {
            if let Some((_, bytes)) = cache.map.get(&proc.pid) {
                proc.memory_bytes = *bytes;
                proc.memory_mb = *bytes as f64 / (1024.0 * 1024.0);
            }
            continue;
        }

        queries += 1;
        if let Some(bytes) = win_metrics::private_working_set(proc.pid) {
            cache.map.insert(proc.pid, (now, bytes));
            proc.memory_bytes = bytes;
            proc.memory_mb = bytes as f64 / (1024.0 * 1024.0);
        } else {
            // Keep provisional working set; avoid hammering denied PIDs.
            cache
                .map
                .insert(proc.pid, (now, proc.working_set_bytes));
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessCmdLine {
    pub pid: u32,
    pub command_line: Option<String>,
}

#[tauri::command]
pub fn list_processes(
    state: State<'_, AppState>,
    detail: Option<bool>,
    enrich_pws: Option<bool>,
    include_cmd: Option<bool>,
) -> Result<SystemSnapshot, String> {
    let detail = detail.unwrap_or(true);
    let enrich = enrich_pws.unwrap_or(detail);
    let include_cmd = include_cmd.unwrap_or(false);
    static WARMED: std::sync::atomic::AtomicBool =
        std::sync::atomic::AtomicBool::new(false);
    let first = !WARMED.swap(true, std::sync::atomic::Ordering::SeqCst);

    if first && detail {
        {
            let mut sys = state.sys.lock().map_err(|_| lock_err("sys"))?;
            let mut tracker = state
                .cpu_tracker
                .lock()
                .map_err(|_| lock_err("cpu_tracker"))?;
            let mut system_cpu = state
                .system_cpu
                .lock()
                .map_err(|_| lock_err("system_cpu"))?;
            refresh_system(&mut sys, false);
            let _ = system_cpu.update();
            for (pid, process) in sys.processes() {
                tracker.seed(pid.as_u32(), process.accumulated_cpu_time());
            }
        }
        std::thread::sleep(Duration::from_millis(200));
    }

    let mut snapshot = {
        let mut sys = state.sys.lock().map_err(|_| lock_err("sys"))?;
        let mut tracker = state
            .cpu_tracker
            .lock()
            .map_err(|_| lock_err("cpu_tracker"))?;
        let mut system_cpu = state
            .system_cpu
            .lock()
            .map_err(|_| lock_err("system_cpu"))?;

        if detail {
            refresh_system(&mut sys, include_cmd);
        } else {
            refresh_system_light(&mut sys);
        }
        build_snapshot(
            &sys,
            &mut tracker,
            &mut system_cpu,
            detail,
            include_cmd,
        )
        // locks dropped here before any OpenProcess
    };

    if detail && enrich {
        enrich_private_working_set(&mut snapshot.processes);
    }

    Ok(snapshot)
}

/// Lazy cmdline fetch for visible / selected PIDs only (keeps list_processes slim).
#[tauri::command]
pub fn get_process_command_lines(
    state: State<'_, AppState>,
    pids: Vec<u32>,
) -> Result<Vec<ProcessCmdLine>, String> {
    let capped: Vec<u32> = pids.into_iter().take(CMD_LINES_MAX_PIDS).collect();
    if capped.is_empty() {
        return Ok(Vec::new());
    }

    let mut sys = state.sys.lock().map_err(|_| lock_err("sys"))?;
    let pid_list: Vec<Pid> = capped.iter().map(|&p| Pid::from_u32(p)).collect();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::Some(pid_list.as_slice()),
        true,
        ProcessRefreshKind::nothing().with_cmd(UpdateKind::OnlyIfNotSet),
    );

    let mut out = Vec::with_capacity(capped.len());
    for pid in capped {
        if let Some(process) = sys.process(Pid::from_u32(pid)) {
            out.push(ProcessCmdLine {
                pid,
                command_line: format_command_line(process),
            });
        }
    }
    Ok(out)
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
        // Allow ending this instance from the list (recovery when the UI is wedged).
        // Exit after returning Ok so the frontend can show feedback briefly.
        std::thread::spawn(|| {
            std::thread::sleep(Duration::from_millis(80));
            std::process::exit(0);
        });
        return Ok(());
    }
    if pid == 0 || pid == 4 {
        return Err("Processus système protégé".into());
    }

    let mut sys = state.sys.lock().map_err(|_| lock_err("sys"))?;
    refresh_system(&mut sys, false);
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
    crate::pawnio::read_cpu_temperature()
        .or_else(crate::temps::read_cpu_from_lhm)
        .or_else(crate::temps::read_cpu_from_hwinfo)
        .or_else(|| crate::temps::read_cpu_from_acpi(components))
}

#[tauri::command]
pub fn pawnio_status() -> crate::pawnio::PawnIoStatus {
    crate::pawnio::driver_status()
}

#[tauri::command]
pub fn install_pawnio() -> Result<(), String> {
    crate::pawnio::install_driver_elevated()
}

#[tauri::command]
pub fn relaunch_elevated() -> Result<(), String> {
    crate::pawnio::relaunch_elevated()
}

#[tauri::command]
pub fn elevated_autostart_is_enabled() -> bool {
    crate::elevated_autostart::is_enabled()
}

#[tauri::command]
pub fn elevated_autostart_enable() -> Result<(), String> {
    crate::elevated_autostart::enable()
}

#[tauri::command]
pub fn elevated_autostart_disable() -> Result<(), String> {
    crate::elevated_autostart::disable()
}

fn ensure_nvml(nvml_slot: &mut Option<Nvml>) -> Option<&Nvml> {
    if nvml_slot.is_none() {
        *nvml_slot = Nvml::init().ok();
    }
    nvml_slot.as_ref()
}

fn read_gpu_utilization(nvml_slot: &mut Option<Nvml>) -> Option<f32> {
    let nvml = ensure_nvml(nvml_slot)?;
    let device = nvml.device_by_index(0).ok()?;
    let rates = device.utilization_rates().ok()?;
    Some(rates.gpu as f32)
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
        gpu_util: read_gpu_utilization(&mut nvml),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OuterGeom {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreGeom {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Atomically apply min-size + outer size/pos + always-on-top (one IPC round-trip).
#[tauri::command]
pub fn apply_window_layout(
    app: AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    min_width: f64,
    min_height: f64,
    always_on_top: bool,
    size_logical: Option<bool>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Fenêtre principale introuvable".to_string())?;
    window
        .set_min_size(Some(LogicalSize::new(min_width, min_height)))
        .map_err(|e| e.to_string())?;
    if size_logical.unwrap_or(false) {
        window
            .set_size(LogicalSize::new(width as f64, height as f64))
            .map_err(|e| e.to_string())?;
    } else {
        window
            .set_size(PhysicalSize::new(width.max(1), height.max(1)))
            .map_err(|e| e.to_string())?;
    }
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    window
        .set_always_on_top(always_on_top)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Micro ↔ normal in one IPC: capture current outer geom, then snap chrome.
/// Returns the previous outer geometry so the UI can persist it.
#[tauri::command]
pub fn set_window_compact_mode(
    app: AppHandle,
    compact: bool,
    restore: Option<RestoreGeom>,
) -> Result<OuterGeom, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "Fenêtre principale introuvable".to_string())?;

    let pos = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let scale_factor = window.scale_factor().map_err(|e| e.to_string())?;
    let prev = OuterGeom {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        scale_factor,
    };

    if compact {
        let w = (320.0_f64 * scale_factor).round().max(1.0) as u32;
        let h = (90.0_f64 * scale_factor).round().max(1.0) as u32;
        window
            .set_min_size(Some(LogicalSize::new(280.0, 84.0)))
            .map_err(|e| e.to_string())?;
        window
            .set_size(PhysicalSize::new(w, h))
            .map_err(|e| e.to_string())?;
        // Shrink in place — no monitor enumeration / reposition dance.
        window
            .set_position(PhysicalPosition::new(pos.x, pos.y))
            .map_err(|e| e.to_string())?;
        window
            .set_always_on_top(true)
            .map_err(|e| e.to_string())?;
    } else {
        let g = restore.unwrap_or(RestoreGeom {
            x: pos.x,
            y: pos.y,
            width: (980.0 * scale_factor).round().max(1.0) as u32,
            height: (680.0 * scale_factor).round().max(1.0) as u32,
        });
        // Drop min first so enlarge isn't clamped by the compact floor.
        window
            .set_min_size(Some(LogicalSize::new(280.0, 84.0)))
            .map_err(|e| e.to_string())?;
        window
            .set_size(PhysicalSize::new(g.width.max(1), g.height.max(1)))
            .map_err(|e| e.to_string())?;
        window
            .set_position(PhysicalPosition::new(g.x, g.y))
            .map_err(|e| e.to_string())?;
        window
            .set_min_size(Some(LogicalSize::new(420.0, 320.0)))
            .map_err(|e| e.to_string())?;
        window
            .set_always_on_top(false)
            .map_err(|e| e.to_string())?;
    }

    Ok(prev)
}

/// Hide or restore the main window on the Windows taskbar.
/// Uses WS_EX_TOOLWINDOW because Tauri's setSkipTaskbar is unreliable on Win10/11.
#[tauri::command]
pub fn set_hidden_from_taskbar(app: tauri::AppHandle, hide: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, SWP_FRAMECHANGED,
            SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WS_EX_APPWINDOW,
            WS_EX_TOOLWINDOW,
        };

        let window = app
            .get_webview_window("main")
            .ok_or_else(|| "Fenêtre principale introuvable".to_string())?;

        let hwnd = HWND(
            window
                .hwnd()
                .map_err(|e| format!("hwnd: {e}"))?
                .0,
        );

        unsafe {
            let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            let new_style = if hide {
                (style & !(WS_EX_APPWINDOW.0 as isize)) | (WS_EX_TOOLWINDOW.0 as isize)
            } else {
                (style & !(WS_EX_TOOLWINDOW.0 as isize)) | (WS_EX_APPWINDOW.0 as isize)
            };
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_style);
            let _ = SetWindowPos(
                hwnd,
                None,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            );
        }

        let _ = window.set_skip_taskbar(hide);
    }

    #[cfg(not(windows))]
    {
        let _ = (app, hide);
    }

    Ok(())
}
