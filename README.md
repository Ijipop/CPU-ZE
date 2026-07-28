# CPU-ZE

Mini Task Manager Windows — léger, rapide, et soigné.

## Fonctionnalités

- Onglets **CPU** / **RAM** avec tri automatique
- Onglet **Temp** (CPU ACPI + GPU NVIDIA via NVML) avec min / max + reset
- Stats globales (CPU total, RAM utilisée)
- Clic droit → **Terminer la tâche**
- Option **Ouvrir au démarrage de Windows**
- **Mise à jour automatique** via GitHub Releases (`latest.json`)
- Fenêtre entièrement redimensionnable

## Prérequis (dev)

- Node.js 18+
- Rust (rustup)
- WebView2 (inclus sur Windows 10/11 récents)

## Lancer en développement

```bash
npm install
npm run tauri dev
```

## Build release

```bash
npm run tauri build
```

Artefacts locaux :

- `src-tauri/target/release/cpu-ze.exe`
- `src-tauri/target/release/bundle/nsis/CPU-ZE_*_x64-setup.exe`

## Releases & mises à jour

1. Pousse sur la branche `release` (ou un tag `v*`), ou lance le workflow **publish** manuellement.
2. GitHub Actions build Windows, signe les artefacts updater, et publie une Release avec `latest.json`.
3. Les installs existantes détectent la MAJ au démarrage et proposent **Installer**.

Secrets GitHub requis :

- `TAURI_SIGNING_PRIVATE_KEY` — contenu de la clé privée (générée via `npx tauri signer generate`)
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — optionnel si la clé a un mot de passe

## Stack

Tauri 2 · React · TypeScript · sysinfo · NVML · tauri-plugin-updater
