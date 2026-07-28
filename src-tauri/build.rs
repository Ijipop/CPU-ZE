fn main() {
    tauri_build::build();

    let token = std::env::var("CPUZE_GH_UPDATER_TOKEN").unwrap_or_default();
    // Embed at compile time for private-repo updater auth.
    println!("cargo:rustc-env=CPUZE_GH_UPDATER_TOKEN={token}");
    println!("cargo:rerun-if-env-changed=CPUZE_GH_UPDATER_TOKEN");
}
