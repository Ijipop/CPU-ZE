import type { UpdateStatus } from "../hooks/useUpdater";

interface UpdateCheckButtonProps {
  status: UpdateStatus;
  message: string | null;
  onCheck: () => void;
}

export function UpdateCheckButton({
  status,
  message,
  onCheck,
}: UpdateCheckButtonProps) {
  const busy =
    status === "checking" ||
    status === "downloading" ||
    status === "installing";

  const label =
    status === "checking"
      ? "…"
      : status === "downloading" || status === "installing"
        ? "MAJ"
        : "MàJ";

  const title =
    message ??
    (status === "checking"
      ? "Vérification…"
      : status === "available"
        ? "Mise à jour disponible"
        : "Vérifier les mises à jour");

  return (
    <button
      type="button"
      className={`maj-btn maj-${status}`}
      onClick={() => void onCheck()}
      disabled={busy}
      title={title}
      aria-label="Vérifier les mises à jour"
    >
      <span className="maj-orb" aria-hidden />
      <span className="maj-label">{label}</span>
      {status === "checking" && <span className="maj-spin" aria-hidden />}
      {status === "available" && <span className="maj-dot" aria-hidden />}
      {status === "uptodate" && <span className="maj-ok">✓</span>}
    </button>
  );
}
