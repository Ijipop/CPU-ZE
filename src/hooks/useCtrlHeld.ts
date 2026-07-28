import { useEffect, useState } from "react";

/** True while Control is held alone (freeze process list). Ctrl+chord cancels. */
export function useCtrlHeld() {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Control") {
        setHeld(true);
        return;
      }
      // Any other key while Ctrl is down = shortcut chord, don't freeze.
      if (e.ctrlKey) setHeld(false);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Control") setHeld(false);
    };
    const onBlur = () => setHeld(false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return held;
}
