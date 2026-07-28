use crate::win_metrics::{qpc_frequency, qpc_now};
use std::collections::HashMap;

/// Wall-clock CPU % matching Task Manager Processes formula:
/// `100 * Δprocess_cpu_time / (Δelapsed * logical_processors)`
///
/// Δelapsed uses QueryPerformanceCounter (Windows high-resolution clock).
pub struct CpuTracker {
    prev: HashMap<u32, Sample>,
    last_pct: HashMap<u32, f32>,
    freq: u64,
}

struct Sample {
    cpu_ms: u64,
    qpc: u64,
}

impl CpuTracker {
    pub fn new() -> Self {
        Self {
            prev: HashMap::new(),
            last_pct: HashMap::new(),
            freq: qpc_frequency(),
        }
    }

    pub fn seed(&mut self, pid: u32, cpu_ms: u64) {
        self.prev.insert(
            pid,
            Sample {
                cpu_ms,
                qpc: qpc_now(),
            },
        );
    }

    pub fn update(&mut self, pid: u32, cpu_ms: u64, logical_cpus: u64) -> f32 {
        let now = qpc_now();
        let logical_cpus = logical_cpus.max(1);
        let freq = self.freq.max(1);

        let pct = if let Some(prev) = self.prev.get(&pid) {
            let ticks = now.saturating_sub(prev.qpc);
            let dt_wall = ticks as f64 / freq as f64;
            if dt_wall >= 0.05 {
                let dt_cpu_secs = cpu_ms.saturating_sub(prev.cpu_ms) as f64 / 1000.0;
                let raw = 100.0 * dt_cpu_secs / (dt_wall * logical_cpus as f64);
                raw.clamp(0.0, 100.0) as f32
            } else {
                *self.last_pct.get(&pid).unwrap_or(&0.0)
            }
        } else {
            0.0
        };

        self.prev.insert(
            pid,
            Sample {
                cpu_ms,
                qpc: now,
            },
        );
        self.last_pct.insert(pid, pct);
        pct
    }

    pub fn retain(&mut self, live: &[u32]) {
        let set: std::collections::HashSet<u32> = live.iter().copied().collect();
        self.prev.retain(|pid, _| set.contains(pid));
        self.last_pct.retain(|pid, _| set.contains(pid));
    }
}
