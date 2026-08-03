export type MessageKey = keyof typeof fr;

/** French is the source of truth for keys. */
export const fr = {
  "brand.sub": "Mini Task Manager",
  "title.help": "Raccourcis (F1)",
  "title.helpAria": "Aide raccourcis",
  "title.about": "À propos",
  "title.expand": "Agrandir (Alt+Entrée)",
  "title.micro": "Mode micro (Alt+Entrée)",
  "title.exitMicro": "Quitter le mode micro",
  "title.enterMicro": "Passer en mode micro",
  "title.minimize": "Réduire",
  "title.restore": "Restaurer",
  "title.maximize": "Agrandir",
  "title.close": "Fermer",
  "title.menu": "Menu",

  "tray.minimizeToTray": "Hors barre des tâches (icônes cachées)",
  "tray.show": "Afficher CPU-ZE",
  "tray.quit": "Quitter",

  "lang.fr": "FR",
  "lang.en": "EN",
  "lang.aria": "Changer la langue",
  "lang.toFr": "Passer en français",
  "lang.toEn": "Switch to English",

  "tabs.aria": "Vues CPU-ZE",
  "tabs.temp": "Temp",

  "metrics.processes": "Processus",
  "metrics.ramShowPct": "Cliquer pour afficher le %",
  "metrics.ramShowBytes": "Cliquer pour afficher Go / Go",
  "metrics.unitGb": "Go",
  "metrics.unitMb": "Mo",

  "footer.autostart": "Ouvrir au démarrage (Admin)",
  "footer.startMicro": "Démarrer en mode micro",
  "footer.tip": "Alt+Entrée = micro · Ctrl = figer · position mémorisée",

  "update.availableKicker": "Mise à jour disponible",
  "update.lead":
    "Une nouvelle version est prête. Tu peux l’installer maintenant ou continuer et le faire plus tard — rien n’est forcé.",
  "update.whatsNew": "Nouveautés",
  "update.fallbackNotes": "Des améliorations et correctifs sont disponibles.",
  "update.later": "Plus tard",
  "update.install": "Installer",
  "update.retry": "Réessayer",
  "update.busy": "En cours…",
  "update.downloading": "Téléchargement…",
  "update.installing": "Installation…",
  "update.availableShort": "disponible",
  "update.bannerTitle": "Mise à jour {version}",
  "update.fail": "Échec",
  "update.close": "Fermer",
  "update.check": "Vérifier les mises à jour",
  "update.checking": "Vérification…",
  "update.available": "Mise à jour disponible",
  "update.versionAvailable": "v{version} disponible",
  "update.uptodate": "Déjà à jour",
  "update.checkFailed": "Échec de la vérif",
  "update.installFailed": "Échec de la mise à jour",
  "update.unreachable":
    "Mise à jour inaccessible — vérifie ta connexion ou réessaie plus tard.",
  "update.btn": "MàJ",
  "update.btnBusy": "MAJ",

  "confirm.cancel": "Annuler",
  "confirm.ok": "Confirmer",

  "ctx.actionsFor": "Actions pour {name}",
  "ctx.endTask": "Terminer la tâche",
  "ctx.endParent": "Terminer l’application parente",
  "ctx.findParent": "Trouver l’application parente",

  "table.filterPh": "Filtrer par nom, PID, chemin…",
  "table.filterAria": "Filtrer les processus",
  "table.shown": "{count} affichés",
  "table.frozen": "Figé · Ctrl",
  "table.frozenTitle": "Molette = scroll · Relâche Ctrl pour reprendre",
  "table.colName": "Nom",
  "table.colParent": "Parent",
  "table.colMemory": "Mémoire",
  "table.cpuTitle":
    "% du CPU total — même formule que le Gestionnaire des tâches (Processes)",
  "table.ramTitle":
    "Private Working Set — même métrique que la colonne Mémoire du Gestionnaire des tâches",
  "table.ramOfTotal": "{pct}% de la RAM",
  "table.emptyFilter": "Aucun résultat pour « {query} »",
  "table.empty": "Aucun processus trouvé",
  "table.killTitle": "Terminer la tâche",
  "table.killSensitive":
    "« {name} » (PID {pid}) est un processus Windows sensible — souvent protégé. Continuer ?",
  "table.killConfirm": "Terminer « {name} » (PID {pid}) ?",
  "table.killBtn": "Terminer",
  "table.killParentTitle": "Terminer l’application parente",
  "table.killHelper":
    "« {name} » (PID {pid}) est un processus auxiliaire (ex. WebView2). Terminer le parent « {parentName} » (PID {parentPid}) évite de casser d’autres apps qui partagent le même helper.",
  "table.killParentConfirm":
    "Terminer le parent « {parentName} » (PID {parentPid}) de « {name} » ?",
  "table.killParentBtn": "Terminer le parent",
  "table.killSelfOnlyBtn": "Terminer seulement ce processus",
  "table.killed": "« {name} » terminé",
  "table.killedSelf": "Fermeture de CPU-ZE…",
  "table.viewFlat": "Liste",
  "table.viewTree": "Arbre",
  "table.viewGroup": "Identiques",
  "table.viewAria": "Mode d’affichage des processus",
  "table.findParent": "Trouver le parent",
  "table.findParentAria": "Trouver l’application parente du processus sélectionné",
  "table.times": "×{count}",
  "table.noParent": "—",
  "table.aggHint": "Total sous-arbre (replié)",

  "app.loadingProcesses": "Chargement des processus…",

  "about.body":
    "Mini Task Manager Windows — CPU, RAM et températures, léger et rapide.",
  "about.cpuSensors": "Capteurs CPU",
  "about.cpuSensorsDetail":
    "PawnIO (AMD Tctl / Intel package), puis LHM, HWiNFO, ACPI",
  "about.gpu": "GPU",
  "about.gpuDetail": "NVML (NVIDIA) en priorité, sinon LHM / HWiNFO",
  "about.metrics": "Métriques",
  "about.metricsDetail":
    "parité Gestionnaire des tâches : CPU = GetProcessTimes/QPC · RAM = Private Working Set",
  "about.footnote":
    "Driver PawnIO (pawnio.eu) — lecture des temps CPU en Admin. Coche « Ouvrir au démarrage (Admin) » pour un login élevé sans UAC à chaque fois.",
  "about.close": "Fermer",

  "help.title": "Raccourcis",
  "help.close": "Fermer",
  "help.altEnter": "Agrandir / réduire (mode micro)",
  "help.ctrl": "Figer la liste (molette = scroll)",
  "help.rightClick": "Menu → Terminer la tâche",
  "help.micro": "HUD compact always-on-top (titlebar)",
  "help.ramClick": "Basculer Go ↔ % (header / HUD)",
  "help.tabs": "Onglets CPU / RAM / Temp",
  "help.f1": "Cette aide",
  "help.keys.altEnter": "Alt+Entrée",
  "help.keys.ctrl": "Ctrl (maintenir)",
  "help.keys.rightClick": "Clic droit",
  "help.keys.micro": "Mode micro",
  "help.keys.ram": "Clic RAM",
  "help.keys.tabs": "1 / 2 / 3",
  "help.keys.f1": "F1 ou ?",

  "temp.current": "Actuelle",
  "temp.min": "Min",
  "temp.avg": "Moy.",
  "temp.max": "Max",
  "temp.hint": "Températures en temps réel",
  "temp.resetTitle": "Reset min / moy. / max",
  "temp.reset": "Reset",
  "temp.resetToast": "Min / moy. / max réinitialisés",
  "temp.loading": "Lecture des capteurs…",
  "temp.usage": "Utilisation",
  "temp.onboardTitle": "Première visite Temp",
  "temp.onboardBody":
    "Sur Ryzen / Intel récents, Windows n’expose souvent pas la temp CPU. Active PawnIO une fois (Admin) pour lire Tctl / Package.",
  "temp.onboardOk": "OK",
  "temp.gpuMissing":
    "GPU non détecté — NVML (NVIDIA), sinon LibreHardwareMonitor ou HWiNFO.",
  "temp.cpuMissing": "Température CPU indisponible pour l’instant.",
  "temp.cpuMissingSub":
    "Si tu viens d’installer PawnIO, relance CPU-ZE en Admin (UAC).",
  "temp.elevateHint":
    "PawnIO est installé, mais Windows n’autorise la lecture des capteurs qu’en Administrateur.",
  "temp.installHint":
    "Capteurs CPU bas niveau (PawnIO) — une seule fois, avec droits Admin.",
  "temp.elevateBtn": "Relancer CPU-ZE en Admin",
  "temp.installBtn": "Activer les capteurs CPU",
  "temp.launching": "Lancement…",
  "temp.awaitingDriver": "En attente du driver…",
  "temp.reinstall": "Réinstaller PawnIO",
  "temp.installStarted":
    "Installateur lancé — valide l’UAC, puis attends quelques secondes…",
  "temp.elevateStarted": "Valide l’UAC — cette fenêtre se fermera toute seule.",
  "temp.ready": "Capteurs CPU prêts.",
  "temp.readyToast": "PawnIO prêt — temps CPU actifs",
  "temp.needsElevateAfterInstall":
    "Driver installé — relance CPU-ZE en Admin pour lire les temps.",
  "temp.notDetectedYet":
    "PawnIO pas encore détecté — valide l’UAC si demandé, ou réessaie.",
  "temp.readyButFail":
    "PawnIO est prêt mais la lecture a échoué — CPU non supporté ou accès PCI occupé. Réessaie dans un instant.",

  "err.killSelf": "CPU-ZE se ferme…",
  "err.systemProtected": "Processus système protégé",
  "err.criticalProtected": "Processus critique protégé : {detail}",
  "err.killDenied":
    "Impossible de terminer le processus {detail} — accès refusé ou déjà terminé",
  "err.notFound": "Processus introuvable: {detail}",
  "err.lockPoisoned": "Verrou {what} empoisonné — redémarre CPU-ZE",
} as const;

export const en: Record<MessageKey, string> = {
  "brand.sub": "Mini Task Manager",
  "title.help": "Shortcuts (F1)",
  "title.helpAria": "Shortcuts help",
  "title.about": "About",
  "title.expand": "Expand (Alt+Enter)",
  "title.micro": "Micro mode (Alt+Enter)",
  "title.exitMicro": "Exit micro mode",
  "title.enterMicro": "Enter micro mode",
  "title.minimize": "Minimize",
  "title.restore": "Restore",
  "title.maximize": "Maximize",
  "title.close": "Close",
  "title.menu": "Menu",

  "tray.minimizeToTray": "Hide from taskbar (system tray)",
  "tray.show": "Show CPU-ZE",
  "tray.quit": "Quit",

  "lang.fr": "FR",
  "lang.en": "EN",
  "lang.aria": "Change language",
  "lang.toFr": "Switch to French",
  "lang.toEn": "Switch to English",

  "tabs.aria": "CPU-ZE views",
  "tabs.temp": "Temp",

  "metrics.processes": "Processes",
  "metrics.ramShowPct": "Click to show %",
  "metrics.ramShowBytes": "Click to show GB / GB",
  "metrics.unitGb": "GB",
  "metrics.unitMb": "MB",

  "footer.autostart": "Open at startup (Admin)",
  "footer.startMicro": "Start in micro mode",
  "footer.tip": "Alt+Enter = micro · Ctrl = freeze · position remembered",

  "update.availableKicker": "Update available",
  "update.lead":
    "A new version is ready. Install now or keep going and do it later — nothing is forced.",
  "update.whatsNew": "What’s new",
  "update.fallbackNotes": "Improvements and fixes are available.",
  "update.later": "Later",
  "update.install": "Install",
  "update.retry": "Retry",
  "update.busy": "Working…",
  "update.downloading": "Downloading…",
  "update.installing": "Installing…",
  "update.availableShort": "available",
  "update.bannerTitle": "Update {version}",
  "update.fail": "Failed",
  "update.close": "Close",
  "update.check": "Check for updates",
  "update.checking": "Checking…",
  "update.available": "Update available",
  "update.versionAvailable": "v{version} available",
  "update.uptodate": "Up to date",
  "update.checkFailed": "Check failed",
  "update.installFailed": "Update failed",
  "update.unreachable":
    "Update unreachable — check your connection or try again later.",
  "update.btn": "Upd",
  "update.btnBusy": "UPD",

  "confirm.cancel": "Cancel",
  "confirm.ok": "Confirm",

  "ctx.actionsFor": "Actions for {name}",
  "ctx.endTask": "End task",
  "ctx.endParent": "End parent application",
  "ctx.findParent": "Find parent application",

  "table.filterPh": "Filter by name, PID, path…",
  "table.filterAria": "Filter processes",
  "table.shown": "{count} shown",
  "table.frozen": "Frozen · Ctrl",
  "table.frozenTitle": "Wheel = scroll · Release Ctrl to resume",
  "table.colName": "Name",
  "table.colParent": "Parent",
  "table.colMemory": "Memory",
  "table.cpuTitle":
    "% of total CPU — same formula as Task Manager (Processes)",
  "table.ramTitle":
    "Private Working Set — same metric as Task Manager’s Memory column",
  "table.ramOfTotal": "{pct}% of RAM",
  "table.emptyFilter": "No results for “{query}”",
  "table.empty": "No processes found",
  "table.killTitle": "End task",
  "table.killSensitive":
    "“{name}” (PID {pid}) is a sensitive Windows process — often protected. Continue?",
  "table.killConfirm": "End “{name}” (PID {pid})?",
  "table.killBtn": "End task",
  "table.killParentTitle": "End parent application",
  "table.killHelper":
    "“{name}” (PID {pid}) is a helper process (e.g. WebView2). Ending parent “{parentName}” (PID {parentPid}) avoids breaking other apps that share the same helper.",
  "table.killParentConfirm":
    "End parent “{parentName}” (PID {parentPid}) of “{name}”?",
  "table.killParentBtn": "End parent",
  "table.killSelfOnlyBtn": "End only this process",
  "table.killed": "“{name}” ended",
  "table.killedSelf": "Closing CPU-ZE…",
  "table.viewFlat": "List",
  "table.viewTree": "Tree",
  "table.viewGroup": "Identical",
  "table.viewAria": "Process view mode",
  "table.findParent": "Find parent",
  "table.findParentAria": "Find the parent application of the selected process",
  "table.times": "×{count}",
  "table.noParent": "—",
  "table.aggHint": "Subtree total (collapsed)",

  "app.loadingProcesses": "Loading processes…",

  "about.body":
    "Windows Mini Task Manager — CPU, RAM and temperatures, light and fast.",
  "about.cpuSensors": "CPU sensors",
  "about.cpuSensorsDetail":
    "PawnIO (AMD Tctl / Intel package), then LHM, HWiNFO, ACPI",
  "about.gpu": "GPU",
  "about.gpuDetail": "NVML (NVIDIA) first, otherwise LHM / HWiNFO",
  "about.metrics": "Metrics",
  "about.metricsDetail":
    "Task Manager parity: CPU = GetProcessTimes/QPC · RAM = Private Working Set",
  "about.footnote":
    "PawnIO driver (pawnio.eu) — CPU temps need Admin. Enable “Open at startup (Admin)” for elevated login without UAC every time.",
  "about.close": "Close",

  "help.title": "Shortcuts",
  "help.close": "Close",
  "help.altEnter": "Expand / shrink (micro mode)",
  "help.ctrl": "Freeze the list (wheel = scroll)",
  "help.rightClick": "Menu → End task",
  "help.micro": "Compact always-on-top HUD (titlebar)",
  "help.ramClick": "Toggle GB ↔ % (header / HUD)",
  "help.tabs": "CPU / RAM / Temp tabs",
  "help.f1": "This help",
  "help.keys.altEnter": "Alt+Enter",
  "help.keys.ctrl": "Ctrl (hold)",
  "help.keys.rightClick": "Right-click",
  "help.keys.micro": "Micro mode",
  "help.keys.ram": "Click RAM",
  "help.keys.tabs": "1 / 2 / 3",
  "help.keys.f1": "F1 or ?",

  "temp.current": "Current",
  "temp.min": "Min",
  "temp.avg": "Avg",
  "temp.max": "Max",
  "temp.hint": "Live temperatures",
  "temp.resetTitle": "Reset min / avg / max",
  "temp.reset": "Reset",
  "temp.resetToast": "Min / avg / max reset",
  "temp.loading": "Reading sensors…",
  "temp.usage": "Usage",
  "temp.onboardTitle": "First visit to Temp",
  "temp.onboardBody":
    "On recent Ryzen / Intel, Windows often doesn’t expose CPU temp. Enable PawnIO once (Admin) to read Tctl / Package.",
  "temp.onboardOk": "OK",
  "temp.gpuMissing":
    "GPU not detected — NVML (NVIDIA), otherwise LibreHardwareMonitor or HWiNFO.",
  "temp.cpuMissing": "CPU temperature unavailable for now.",
  "temp.cpuMissingSub":
    "If you just installed PawnIO, relaunch CPU-ZE as Admin (UAC).",
  "temp.elevateHint":
    "PawnIO is installed, but Windows only allows sensor reads as Administrator.",
  "temp.installHint":
    "Low-level CPU sensors (PawnIO) — one-time setup with Admin rights.",
  "temp.elevateBtn": "Relaunch CPU-ZE as Admin",
  "temp.installBtn": "Enable CPU sensors",
  "temp.launching": "Starting…",
  "temp.awaitingDriver": "Waiting for driver…",
  "temp.reinstall": "Reinstall PawnIO",
  "temp.installStarted":
    "Installer launched — approve UAC, then wait a few seconds…",
  "temp.elevateStarted": "Approve UAC — this window will close on its own.",
  "temp.ready": "CPU sensors ready.",
  "temp.readyToast": "PawnIO ready — CPU temps active",
  "temp.needsElevateAfterInstall":
    "Driver installed — relaunch CPU-ZE as Admin to read temps.",
  "temp.notDetectedYet":
    "PawnIO not detected yet — approve UAC if prompted, or try again.",
  "temp.readyButFail":
    "PawnIO is ready but the read failed — unsupported CPU or busy PCI access. Try again in a moment.",

  "err.killSelf": "Closing CPU-ZE…",
  "err.systemProtected": "Protected system process",
  "err.criticalProtected": "Protected critical process: {detail}",
  "err.killDenied":
    "Cannot end process {detail} — access denied or already ended",
  "err.notFound": "Process not found: {detail}",
  "err.lockPoisoned": "Lock {what} poisoned — restart CPU-ZE",
};
