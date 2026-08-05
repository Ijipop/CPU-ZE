import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useLocale } from "../i18n/LocaleContext";

interface AffinityDialogProps {
  pid: number;
  processName: string;
  cpuCount: number;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}

export function AffinityDialog({
  pid,
  processName,
  cpuCount,
  onClose,
  onSaved,
  onError,
}: AffinityDialogProps) {
  const { t } = useLocale();
  const n = Math.max(1, Math.min(64, cpuCount || 1));
  const [mask, setMask] = useState<bigint>(0n);
  const [systemMask, setSystemMask] = useState<bigint>((1n << BigInt(n)) - 1n);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const dto = await invoke<{ mask: number; systemMask: number }>(
          "get_process_affinity",
          { pid },
        );
        if (cancelled) return;
        setMask(BigInt(dto.mask >>> 0));
        setSystemMask(BigInt(dto.systemMask >>> 0) || (1n << BigInt(n)) - 1n);
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
        onClose();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pid, n, onClose, onError]);

  const toggle = (bit: number) => {
    const b = 1n << BigInt(bit);
    if ((systemMask & b) === 0n) return;
    setMask((m) => ((m & b) !== 0n ? m & ~b : m | b));
  };

  const save = async () => {
    if (mask === 0n) {
      onError(t("affinity.empty"));
      return;
    }
    setSaving(true);
    try {
      // JS number is fine for ≤53 bits; for more cores pass low 32 / use string — keep u64 via Number for ≤32.
      await invoke("set_process_affinity", {
        pid,
        mask: Number(mask & 0xffffffffn),
      });
      onSaved();
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal affinity-dialog"
        role="dialog"
        aria-labelledby="affinity-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="affinity-title">{t("affinity.title")}</h2>
        <p className="modal-lead">
          {t("affinity.lead", { name: processName, pid })}
        </p>
        {loading ? (
          <p className="mono">{t("affinity.loading")}</p>
        ) : (
          <div className="affinity-grid">
            {Array.from({ length: n }, (_, i) => {
              const bit = 1n << BigInt(i);
              const allowed = (systemMask & bit) !== 0n;
              const on = (mask & bit) !== 0n;
              return (
                <label
                  key={i}
                  className={`affinity-chip ${on ? "is-on" : ""} ${!allowed ? "is-disabled" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!allowed || saving}
                    onChange={() => toggle(i)}
                  />
                  CPU {i}
                </label>
              );
            })}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="modal-btn-ghost" onClick={onClose}>
            {t("confirm.cancel")}
          </button>
          <button
            type="button"
            className="modal-btn"
            disabled={loading || saving || mask === 0n}
            onClick={() => void save()}
          >
            {t("affinity.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
