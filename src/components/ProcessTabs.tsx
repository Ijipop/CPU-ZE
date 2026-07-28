import type { TabId } from "../types";

interface ProcessTabsProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

export function ProcessTabs({ active, onChange }: ProcessTabsProps) {
  return (
    <div className="tabs" role="tablist" aria-label="Vues CPU-ZE">
      <button
        type="button"
        role="tab"
        aria-selected={active === "cpu"}
        className={`tab ${active === "cpu" ? "tab-active" : ""}`}
        onClick={() => onChange("cpu")}
      >
        CPU
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === "ram"}
        className={`tab ${active === "ram" ? "tab-active" : ""}`}
        onClick={() => onChange("ram")}
      >
        RAM
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === "temp"}
        className={`tab ${active === "temp" ? "tab-active" : ""}`}
        onClick={() => onChange("temp")}
      >
        Temp
      </button>
    </div>
  );
}
