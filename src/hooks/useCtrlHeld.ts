import { useEffect, useState } from "react";

/** True while Control is held (freeze process list). */
export function useCtrlHeld() {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Control") setHeld(true);
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
