//! Extract 16x16 shell icons via SHGetFileInfoW + DrawIconEx → PNG base64.

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;

use base64::Engine as _;
use windows::core::PCWSTR;
use windows::Win32::Graphics::Gdi::{
    CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, GetDC, ReleaseDC,
    SelectObject, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS, HGDIOBJ,
};
use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
use windows::Win32::UI::Shell::{
    SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_SMALLICON,
};
use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, DrawIconEx, DI_NORMAL, HICON};

const ICON_SIZE: i32 = 16;

/// Extracts the small (16x16) shell icon for `path` and returns it as a PNG,
/// base64-encoded (no `data:` prefix). Returns `None` on any failure.
pub fn extract_icon_png_base64(path: &str) -> Option<String> {
    if path.trim().is_empty() {
        return None;
    }
    if !Path::new(path).exists() {
        return None;
    }

    let wide: Vec<u16> = OsStr::new(path).encode_wide().chain(std::iter::once(0)).collect();
    let mut sfi = SHFILEINFOW::default();

    let res = unsafe {
        SHGetFileInfoW(
            PCWSTR(wide.as_ptr()),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut sfi),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_SMALLICON,
        )
    };
    if res == 0 || sfi.hIcon.is_invalid() {
        return None;
    }

    let png = unsafe { hicon_to_png(sfi.hIcon) };
    unsafe {
        let _ = DestroyIcon(sfi.hIcon);
    }

    png.map(|bytes| base64::engine::general_purpose::STANDARD.encode(bytes))
}

unsafe fn hicon_to_png(hicon: HICON) -> Option<Vec<u8>> {
    let pixel_count = (ICON_SIZE * ICON_SIZE) as usize;

    let screen_dc = GetDC(None);
    if screen_dc.is_invalid() {
        return None;
    }
    let mem_dc = CreateCompatibleDC(Some(screen_dc));
    if mem_dc.is_invalid() {
        ReleaseDC(None, screen_dc);
        return None;
    }

    let mut bmi = BITMAPINFO::default();
    bmi.bmiHeader = BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: ICON_SIZE,
        biHeight: -ICON_SIZE, // top-down
        biPlanes: 1,
        biBitCount: 32,
        biCompression: 0, // BI_RGB
        ..Default::default()
    };

    let mut bits_ptr: *mut std::ffi::c_void = std::ptr::null_mut();
    let hbitmap = match CreateDIBSection(
        Some(mem_dc),
        &bmi,
        DIB_RGB_COLORS,
        &mut bits_ptr,
        None,
        0,
    ) {
        Ok(hb) => hb,
        Err(_) => {
            let _ = DeleteDC(mem_dc);
            ReleaseDC(None, screen_dc);
            return None;
        }
    };
    if bits_ptr.is_null() {
        let _ = DeleteObject(HGDIOBJ(hbitmap.0));
        let _ = DeleteDC(mem_dc);
        ReleaseDC(None, screen_dc);
        return None;
    }

    let old = SelectObject(mem_dc, HGDIOBJ(hbitmap.0));
    std::ptr::write_bytes(bits_ptr as *mut u8, 0, pixel_count * 4);

    let draw_ok = DrawIconEx(mem_dc, 0, 0, hicon, ICON_SIZE, ICON_SIZE, 0, None, DI_NORMAL).is_ok();

    let mut rgba = vec![0u8; pixel_count * 4];
    if draw_ok {
        let pixels = std::slice::from_raw_parts(bits_ptr as *const u8, pixel_count * 4);
        for i in 0..pixel_count {
            let b = pixels[i * 4];
            let g = pixels[i * 4 + 1];
            let r = pixels[i * 4 + 2];
            let a = pixels[i * 4 + 3];
            rgba[i * 4] = r;
            rgba[i * 4 + 1] = g;
            rgba[i * 4 + 2] = b;
            rgba[i * 4 + 3] = a;
        }
    }

    SelectObject(mem_dc, old);
    let _ = DeleteObject(HGDIOBJ(hbitmap.0));
    let _ = DeleteDC(mem_dc);
    ReleaseDC(None, screen_dc);

    if !draw_ok {
        return None;
    }

    // Legacy mask-based icons render with all-zero alpha. Force opaque on non-black pixels.
    let has_alpha = rgba.chunks_exact(4).any(|px| px[3] != 0);
    if !has_alpha {
        for chunk in rgba.chunks_exact_mut(4) {
            if chunk[0] != 0 || chunk[1] != 0 || chunk[2] != 0 {
                chunk[3] = 255;
            }
        }
    }

    let mut buf = Vec::with_capacity(512);
    {
        let mut encoder = png::Encoder::new(&mut buf, ICON_SIZE as u32, ICON_SIZE as u32);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().ok()?;
        writer.write_image_data(&rgba).ok()?;
    }
    Some(buf)
}
