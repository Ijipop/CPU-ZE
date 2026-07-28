# CPU-ZE

Mini Task Manager Windows — léger, rapide, et soigné.

## Fonctionnalités

- Onglets **CPU** / **RAM** avec tri automatique et filtre (conservé entre onglets)
- Onglet **Temp** (CPU / GPU) avec **actuelle / min / moyenne / max** + reset
- Stats globales (CPU total, RAM utilisée, nombre de processus) — clic sur RAM pour basculer Go ↔ %
- Clic droit → **Terminer la tâche** (garde-fous : self-PID, processus critiques)
- **Mode micro** (Compact) : HUD always-on-top avec CPU / RAM / temps
- Option **Ouvrir au démarrage de Windows**
- **Mise à jour automatique** via GitHub (repo privé supporté)
- Fenêtre custom (sans décorations OS), entièrement redimensionnable
- Figé temporaire : maintenir **Ctrl** pour stopper le refresh de la liste

## Métriques (parité Gestionnaire des tâches)

- **CPU processus** : `100 × Δ(GetProcessTimes) / (ΔQPC × cœurs logiques)` — onglet Processes
- **CPU global** : `GetSystemTimes` (idle/kernel/user) — onglet Performance
- **RAM processus** : **Private Working Set** (`PROCESS_MEMORY_COUNTERS_EX2`) — colonne Mémoire TM
- **RAM système** : `GlobalMemoryStatusEx` (`TotalPhys − AvailPhys`)
- **Températures** :
  1. **PawnIO** (driver noyau embarqué) — **recommandé**, un clic Admin une seule fois
  2. LibreHardwareMonitor (`http://127.0.0.1:8085/data.json`) — fallback
  3. HWiNFO (mémoire partagée) — fallback optionnel
  4. ACPI (scoré, uniquement si le label ressemble à un CPU)
  - GPU : NVML (NVIDIA) en priorité, sinon LHM / HWiNFO

### Capteurs CPU (PawnIO)

Sur beaucoup de PC (surtout AMD Ryzen), Windows n’expose pas la temp CPU en user-mode. CPU-ZE embarque les modules PawnIO + l’installateur signé :

1. Onglet **Temp** → **Activer les capteurs CPU**
2. Valide l’UAC (une fois)
3. Les temps Tctl / Package apparaissent sans LHM ni HWiNFO

[PawnIO](https://pawnio.eu/) est le même driver utilisé par LibreHardwareMonitor. LHM / HWiNFO restent des fallbacks si tu les as déjà.

## Prérequis (dev)

- Node.js 18+
- Rust (rustup)
- WebView2 (inclus sur Windows 10/11 récents)

## Lancer en développement

```bash
npm install
# Token GitHub (Contents: Read) pour tester la MAJ sur repo privé :
#   $env:CPUZE_GH_UPDATER_TOKEN = (gh auth token)
npm run tauri dev
```

## Build release

```bash
$env:CPUZE_GH_UPDATER_TOKEN = (gh auth token)   # obligatoire si le repo est privé
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw "$env:USERPROFILE\.tauri\cpu-ze.key"
npm run tauri build
```

Artefacts locaux :

- `src-tauri/target/release/cpu-ze.exe`
- `src-tauri/target/release/bundle/nsis/CPU-ZE_*_x64-setup.exe`

> Les builds ne sont **pas** signés Authenticode (usage limité / perso). Windows SmartScreen peut avertir — normal sans certificat code-signing.

## Releases & mises à jour (repo privé)

Le endpoint updater lit :

`https://api.github.com/repos/Ijipop/CPU-ZE/contents/updater/latest.json?ref=release`

avec un **fine-grained PAT** (Contents: Read sur `CPU-ZE`) embarqué au build (`CPUZE_GH_UPDATER_TOKEN`). Les URLs d’install dans `updater/latest.json` sont des **API asset URLs**.

1. Build signé avec le token.
2. `gh release create vX.Y.Z …` (NSIS + sig + msi).
3. `pwsh scripts/publish-updater-json.ps1 -Tag vX.Y.Z`
4. Commit + push `updater/latest.json` sur la branche **`release`**.

Les installs **sans** token (≤ 0.2.1) ne peuvent pas s’auto-mettre à jour : installer manuellement la première build tokenisée.

Secrets GitHub (CI) :

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (optionnel)
- `CPUZE_GH_UPDATER_TOKEN` — fine-grained PAT Contents: Read

## Stack

Tauri 2 · React · TypeScript · sysinfo · Win32 metrics · NVML · PawnIO · LibreHardwareMonitor · tauri-plugin-updater
