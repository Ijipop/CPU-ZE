# CPU-ZE

Mini Task Manager Windows — léger, rapide, et soigné.

## Fonctionnalités

- Onglets **CPU** / **RAM** avec tri automatique et filtre (conservé entre onglets)
- Onglet **Temp** (CPU / GPU) avec **actuelle / min / moyenne / max** + reset
- Stats globales (CPU total, RAM utilisée, nombre de processus)
- Clic droit → **Terminer la tâche** (garde-fous : self-PID, processus critiques)
- **Mode micro** (Compact) : HUD always-on-top avec CPU / RAM / temps
- Option **Ouvrir au démarrage de Windows**
- **Mise à jour automatique** via GitHub Releases (`latest.json`)
- Fenêtre custom (sans décorations OS), entièrement redimensionnable
- Figé temporaire : maintenir **Ctrl** pour stopper le refresh de la liste

## Métriques

- **CPU** : `% = Δtemps CPU / (Δhorloge × cœurs logiques)` — même logique que l’onglet Processes du Gestionnaire des tâches
- **RAM (processus)** : **octets privés** (Private Bytes). Ce n’est **pas** la colonne « Mémoire » du Gestionnaire (plus proche du working set privé)
- **Températures** :
  1. **LibreHardwareMonitor** (`http://127.0.0.1:8085/data.json`) — recommandé sur Ryzen
  2. HWiNFO (mémoire partagée) — fallback optionnel
  3. ACPI (scoré, uniquement si le label ressemble à un CPU)
  - GPU : NVML (NVIDIA) en priorité, sinon LHM / HWiNFO

### LibreHardwareMonitor (temp CPU)

Sur beaucoup de PC AMD, ACPI n’expose pas la temp CPU. Avec LHM :

1. Télécharge [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases)
2. **Options → Remote Web Server → Start** (port **8085**)
3. Laisse LHM ouvert (réduit dans la barre système OK)

Utile pour suivre **max / moyenne** sous la même charge (ex. savoir si la pâte thermique se dégrade).

HWiNFO Shared Memory reste supporté en secours si tu l’utilises déjà.

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

> Les builds ne sont **pas** signés Authenticode (usage limité / perso). Windows SmartScreen peut avertir — normal sans certificat code-signing.

## Releases & mises à jour

1. Pousse sur la branche `release` (ou un tag `v*`), ou lance le workflow **publish** manuellement.
2. GitHub Actions build Windows, signe les artefacts **updater** (clé Tauri), et publie une Release avec `latest.json`.
3. Les installs existantes détectent la MAJ au démarrage et proposent **Installer**.

Secrets GitHub requis :

- `TAURI_SIGNING_PRIVATE_KEY` — contenu de la clé privée (générée via `npx tauri signer generate`)
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — optionnel si la clé a un mot de passe

## Stack

Tauri 2 · React · TypeScript · sysinfo · NVML · LibreHardwareMonitor · tauri-plugin-updater
