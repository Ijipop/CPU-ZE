use serde::Deserialize;
use serde_json::Value;
use std::ffi::OsStr;
use std::mem::MaybeUninit;
use std::os::windows::ffi::OsStrExt;
use std::time::Duration;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE};
use windows::Win32::System::Memory::{
    MapViewOfFile, OpenFileMappingW, UnmapViewOfFile, VirtualQuery, FILE_MAP_READ,
    MEMORY_BASIC_INFORMATION, MEMORY_MAPPED_VIEW_ADDRESS,
};

use crate::commands::SensorReading;

const HWINFO_MAP_NAMES: &[&str] = &[
    "Global\\HWiNFO_SENS_SM2",
    "HWiNFO_SENS_SM2",
    "Global\\HWiNFO_SENSORS_SM2",
    "HWiNFO_SENSORS_SM2",
];

const SENSOR_TYPE_TEMP: u32 = 1;
const STRING_LEN: usize = 128;
const UNIT_LEN: usize = 16;
const MAX_ELEMENTS: usize = 4096;
const HEADER_SIZE: usize = std::mem::size_of::<HwInfoHeader>();

#[repr(C, packed)]
struct HwInfoHeader {
    signature: u32,
    version: u32,
    revision: u32,
    poll_time: i64,
    sensor_section_offset: u32,
    sensor_element_size: u32,
    sensor_element_count: u32,
    reading_section_offset: u32,
    reading_element_size: u32,
    reading_element_count: u32,
}

fn wide_null(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

fn read_c_string(buf: &[u8]) -> String {
    let end = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
    String::from_utf8_lossy(&buf[..end]).trim().to_string()
}

fn mapped_region_len(view: MEMORY_MAPPED_VIEW_ADDRESS) -> Option<usize> {
    let mut info = MaybeUninit::<MEMORY_BASIC_INFORMATION>::uninit();
    let written = unsafe {
        VirtualQuery(
            Some(view.Value),
            info.as_mut_ptr(),
            std::mem::size_of::<MEMORY_BASIC_INFORMATION>(),
        )
    };
    if written == 0 {
        return None;
    }
    let info = unsafe { info.assume_init() };
    Some(info.RegionSize)
}

fn open_hwinfo_mapping() -> Option<(HANDLE, MEMORY_MAPPED_VIEW_ADDRESS, usize)> {
    for name in HWINFO_MAP_NAMES {
        let wide = wide_null(name);
        let handle =
            unsafe { OpenFileMappingW(FILE_MAP_READ.0, false, PCWSTR(wide.as_ptr())) };
        let Ok(handle) = handle else {
            continue;
        };
        if handle.is_invalid() || handle == INVALID_HANDLE_VALUE {
            continue;
        }
        let view = unsafe { MapViewOfFile(handle, FILE_MAP_READ, 0, 0, 0) };
        if view.Value.is_null() {
            unsafe {
                let _ = CloseHandle(handle);
            }
            continue;
        }
        let Some(len) = mapped_region_len(view) else {
            unsafe {
                let _ = UnmapViewOfFile(view);
                let _ = CloseHandle(handle);
            }
            continue;
        };
        if len < HEADER_SIZE {
            unsafe {
                let _ = UnmapViewOfFile(view);
                let _ = CloseHandle(handle);
            }
            continue;
        }
        return Some((handle, view, len));
    }
    None
}

fn range_ok(mapped_len: usize, offset: usize, size: usize) -> bool {
    size > 0 && offset.checked_add(size).is_some_and(|end| end <= mapped_len)
}

fn score_cpu_temp(sensor: &str, label: &str) -> i32 {
    let s = sensor.to_lowercase();
    let l = label.to_lowercase();

    // Exclude discrete storage / dedicated GPU sensors — but NOT APU names like
    // "Ryzen … with Radeon Graphics" (LHM / Renoir laptops).
    let looks_like_cpu = s.contains("ryzen")
        || s.contains("amd")
        || s.contains("intel")
        || s.contains("cpu")
        || s.contains("zen");
    let looks_like_gpu_only = (s.contains("nvidia")
        || s.contains("geforce")
        || s.contains("gtx")
        || s.contains("rtx")
        || (s.contains("radeon") && !looks_like_cpu)
        || (s.contains("gpu") && !looks_like_cpu))
        && !looks_like_cpu;

    if looks_like_gpu_only
        || s.contains("s.m.a.r.t")
        || s.contains("ssd")
        || s.contains("hdd")
        || s.contains("nvme")
    {
        return -100;
    }

    let mut score = 0;
    if looks_like_cpu {
        score += 20;
    }
    if l.contains("tctl") || l.contains("tdie") || l.contains("tctl/tdie") {
        score += 100;
    } else if l.contains("package") {
        score += 80;
    } else if l.contains("cpu") && (l.contains("temp") || l.contains("temperature")) {
        score += 60;
    } else if l.contains("temperature") && looks_like_cpu {
        // LHM often labels the package sensor simply "Temperature"
        score += 55;
    } else if l.contains("core") && (l.contains("average") || l.contains("avg") || l.contains("max")) {
        score += 40;
    } else if l.starts_with("core #") || l.starts_with("core(") || l.starts_with("core ") {
        score += 10;
    } else if looks_like_cpu {
        score += 5;
    } else {
        score -= 5;
    }
    score
}

fn score_gpu_temp(sensor: &str, label: &str) -> i32 {
    let s = sensor.to_lowercase();
    let l = label.to_lowercase();
    if !(s.contains("nvidia")
        || s.contains("geforce")
        || s.contains("gtx")
        || s.contains("rtx")
        || s.contains("radeon")
        || s.contains("gpu"))
    {
        return -100;
    }
    if l.contains("hotspot")
        || l.contains("point chaud")
        || l.contains("memoire")
        || l.contains("memory")
    {
        return 10;
    }
    if l.contains("gpu") && (l.contains("temp") || l.contains("temperature")) {
        return 100;
    }
    if l == "temperature" || l == "température" {
        return 90;
    }
    30
}

pub fn read_cpu_from_hwinfo() -> Option<SensorReading> {
    read_temp_from_hwinfo(score_cpu_temp)
}

pub fn read_gpu_from_hwinfo() -> Option<SensorReading> {
    read_temp_from_hwinfo(score_gpu_temp)
}

fn read_temp_from_hwinfo(score_fn: fn(&str, &str) -> i32) -> Option<SensorReading> {
    let (handle, view, mapped_len) = open_hwinfo_mapping()?;
    let result = unsafe { parse_hwinfo_view(view.Value as *const u8, mapped_len, score_fn) };
    unsafe {
        let _ = UnmapViewOfFile(view);
        let _ = CloseHandle(handle);
    }
    result
}

unsafe fn parse_hwinfo_view(
    base: *const u8,
    mapped_len: usize,
    score_fn: fn(&str, &str) -> i32,
) -> Option<SensorReading> {
    if base.is_null() || mapped_len < HEADER_SIZE {
        return None;
    }

    // Copy header bytes safely instead of unaligned packed ref.
    let header_bytes = std::slice::from_raw_parts(base, HEADER_SIZE);
    let header = std::ptr::read_unaligned(header_bytes.as_ptr() as *const HwInfoHeader);

    let sig = header.signature;
    if sig != u32::from_le_bytes(*b"HWiS") && sig != u32::from_le_bytes(*b"SiWH") {
        return None;
    }

    let sensor_count = (header.sensor_element_count as usize).min(MAX_ELEMENTS);
    let sensor_size = header.sensor_element_size as usize;
    let reading_count = (header.reading_element_count as usize).min(MAX_ELEMENTS);
    let reading_size = header.reading_element_size as usize;
    let sensor_offset = header.sensor_section_offset as usize;
    let reading_offset = header.reading_section_offset as usize;

    if sensor_size < 8 + STRING_LEN * 2 || reading_size < 12 + STRING_LEN * 2 + UNIT_LEN + 32 {
        return None;
    }

    let sensor_span = sensor_count.checked_mul(sensor_size)?;
    let reading_span = reading_count.checked_mul(reading_size)?;
    if !range_ok(mapped_len, sensor_offset, sensor_span)
        || !range_ok(mapped_len, reading_offset, reading_span)
    {
        return None;
    }

    let mut sensor_names = Vec::with_capacity(sensor_count);
    for i in 0..sensor_count {
        let elem = sensor_offset + i * sensor_size;
        if !range_ok(mapped_len, elem + 8, STRING_LEN * 2) {
            return None;
        }
        let name_orig = std::slice::from_raw_parts(base.add(elem + 8), STRING_LEN);
        let name_user = std::slice::from_raw_parts(base.add(elem + 8 + STRING_LEN), STRING_LEN);
        let name = read_c_string(name_user);
        let name = if name.is_empty() {
            read_c_string(name_orig)
        } else {
            name
        };
        sensor_names.push(name);
    }

    let mut best: Option<(i32, SensorReading)> = None;
    for i in 0..reading_count {
        let elem = reading_offset + i * reading_size;
        if !range_ok(mapped_len, elem, reading_size) {
            return None;
        }
        let ptr = base.add(elem);
        let t_reading = u32::from_le_bytes([*ptr, *ptr.add(1), *ptr.add(2), *ptr.add(3)]);
        if t_reading != SENSOR_TYPE_TEMP {
            continue;
        }
        let sensor_index =
            u32::from_le_bytes([*ptr.add(4), *ptr.add(5), *ptr.add(6), *ptr.add(7)]) as usize;
        if sensor_index >= sensor_names.len() {
            continue;
        }

        let label_orig = std::slice::from_raw_parts(ptr.add(12), STRING_LEN);
        let label_user = std::slice::from_raw_parts(ptr.add(12 + STRING_LEN), STRING_LEN);
        let mut label = read_c_string(label_user);
        if label.is_empty() {
            label = read_c_string(label_orig);
        }

        let value_ptr = ptr.add(12 + STRING_LEN * 2 + UNIT_LEN);
        let value = f64::from_le_bytes([
            *value_ptr,
            *value_ptr.add(1),
            *value_ptr.add(2),
            *value_ptr.add(3),
            *value_ptr.add(4),
            *value_ptr.add(5),
            *value_ptr.add(6),
            *value_ptr.add(7),
        ]);
        if !(1.0..=120.0).contains(&value) {
            continue;
        }

        let sensor = &sensor_names[sensor_index];
        let score = score_fn(sensor, &label);
        if score < 0 {
            continue;
        }

        let reading = SensorReading {
            celsius: value as f32,
            label: format!("{sensor} · {label}"),
            source: "HWiNFO".into(),
        };
        match &best {
            Some((best_score, _)) if *best_score >= score => {}
            _ => best = Some((score, reading)),
        }
    }

    best.map(|(_, r)| r)
}

#[derive(Debug, Deserialize)]
struct LhmNode {
    #[serde(default, rename = "Text")]
    text: String,
    #[serde(default, rename = "Value")]
    value: String,
    #[serde(default, rename = "Children")]
    children: Vec<LhmNode>,
}

fn parse_lhm_celsius(value: &str) -> Option<f32> {
    let cleaned = value
        .replace('°', " ")
        .replace('C', " ")
        .replace(',', ".")
        .trim()
        .split_whitespace()
        .next()?
        .to_string();
    cleaned
        .parse::<f32>()
        .ok()
        .filter(|v| (1.0..=120.0).contains(v))
}

fn walk_lhm(
    node: &LhmNode,
    path: &str,
    score_fn: fn(&str, &str) -> i32,
    best: &mut Option<(i32, SensorReading)>,
) {
    let current_path = if path.is_empty() {
        node.text.clone()
    } else if node.text.is_empty() {
        path.to_string()
    } else {
        format!("{path}/{}", node.text)
    };

    if let Some(celsius) = parse_lhm_celsius(&node.value) {
        let score = score_fn(&current_path, &node.text);
        if score >= 0 {
            let parent = path.rsplit('/').next().unwrap_or("CPU");
            let reading = SensorReading {
                celsius,
                label: format!("{parent} · {}", node.text),
                source: "LibreHardwareMonitor".into(),
            };
            match best {
                Some((best_score, _)) if *best_score >= score => {}
                _ => *best = Some((score, reading)),
            }
        }
    }

    for child in &node.children {
        walk_lhm(child, &current_path, score_fn, best);
    }
}

pub fn read_cpu_from_lhm() -> Option<SensorReading> {
    read_from_lhm(score_cpu_temp)
}

pub fn read_gpu_from_lhm() -> Option<SensorReading> {
    read_from_lhm(score_gpu_temp)
}

fn read_from_lhm(score_fn: fn(&str, &str) -> i32) -> Option<SensorReading> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_millis(300)))
        .build()
        .into();

    let mut response = agent.get("http://127.0.0.1:8085/data.json").call().ok()?;
    let root: Value = response.body_mut().read_json().ok()?;
    let node: LhmNode = serde_json::from_value(root).ok()?;
    let mut best = None;
    walk_lhm(&node, "", score_fn, &mut best);
    best.map(|(_, r)| r)
}

pub fn read_cpu_from_acpi(components: &mut sysinfo::Components) -> Option<SensorReading> {
    components.refresh(true);
    let mut best: Option<(i32, SensorReading)> = None;
    for component in components.iter() {
        let Some(celsius) = component.temperature() else {
            continue;
        };
        if !(1.0..=120.0).contains(&celsius) {
            continue;
        }
        let label = component.label().to_string();
        let score = score_cpu_temp(&label, &label);
        if score < 0 {
            continue;
        }
        let reading = SensorReading {
            celsius,
            label,
            source: "ACPI".into(),
        };
        match &best {
            Some((best_score, _)) if *best_score >= score => {}
            _ => best = Some((score, reading)),
        }
    }
    best.map(|(_, r)| r)
}
