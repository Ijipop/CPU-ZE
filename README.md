# CPU-ZE

Mini Task Manager Windows — léger, rapide, et soigné.

## Fonctionnalités

- Onglets **CPU** / **RAM** avec tri automatique et filtre (conservé entre onglets)
- Onglet **Temp** (CPU / GPU) avec **actuelle / min / moyenne / max** + reset + **GPU util %** (NVML)
- Stats globales (CPU total, RAM utilisée, nombre de processus) — clic sur RAM pour basculer Go ↔ %
- Clic droit → **Terminer la tâche** (confirm in-app, garde-fous critiques)
- **Mode micro** (Compact) : HUD always-on-top avec CPU / RAM / temps / GPU % — **Alt+Entrée** pour basculer
- Option **Démarrer en mode micro** + **position mémorisée** (multi-écrans)
- **À propos** + **aide raccourcis** (F1 / ?) — version visible dans la titlebar
- Option **Ouvrir au démarrage (Admin)**
- **Mise à jour automatique** via GitHub (repo public)
- Fenêtre custom (sans décorations OS), entièrement redimensionnable
- Figé temporaire : maintenir **Ctrl** (seul) pour stopper le refresh de la liste

## Métriques (parité Gestionnaire des tâches)

- **CPU processus** : `100 × Δ(GetProcessTimes) / (ΔQPC × cœurs logiques)`
- **CPU global** : `GetSystemTimes`
- **RAM processus** : **Private Working Set**
- **RAM système** : `GlobalMemoryStatusEx`
- **Températures** :
  1. **PawnIO** — recommandé, un clic Admin une seule fois
  2. LibreHardwareMonitor / HWiNFO / ACPI en fallback
  - GPU : NVML (temp + util %), sinon LHM / HWiNFO

### Capteurs CPU (PawnIO)

1. Onglet **Temp** → **Activer les capteurs CPU**
2. Valide l’UAC (une fois) — installateur : `-install -silent`
3. Les temps Tctl / Package apparaissent

## Prérequis (dev)

- Node.js 18+
- Rust (rustup)
- WebView2

## Lancer en développement

```bash
npm install
npm run tauri dev
```

## Build release

```bash
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw "$env:USERPROFILE\.tauri\cpu-ze.key"
npm run tauri build
```

## Releases & mises à jour

Endpoint : `https://raw.githubusercontent.com/Ijipop/CPU-ZE/release/updater/latest.json`  
(URLs d’install = liens Release GitHub publics.)

1. Build signé Tauri
2. `gh release create vX.Y.Z …`
3. `powershell -File scripts/publish-updater-json.ps1 -Tag vX.Y.Z`
4. Commit + push `updater/latest.json` sur la branche **`release`**

Secrets CI : `TAURI_SIGNING_PRIVATE_KEY` (+ password optionnel).

## Stack

Tauri 2 · React · TypeScript · sysinfo · Win32 metrics · NVML · PawnIO · LibreHardwareMonitor · tauri-plugin-updater
