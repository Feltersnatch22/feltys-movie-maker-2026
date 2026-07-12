import { useEffect, useRef, useState } from "react";

type Props = {
  onDone?: () => void;
  /** Hold time before exit begins (ms) */
  durationMs?: number;
};

export function SplashScreen({ onDone, durationMs = 2800 }: Props) {
  const [phase, setPhase] = useState<"enter" | "hold" | "exit" | "gone">("enter");
  const doneRef = useRef(false);
  const timers = useRef<number[]>([]);

  function finish() {
    if (doneRef.current) return;
    doneRef.current = true;
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    setPhase("exit");
    const id = window.setTimeout(() => {
      setPhase("gone");
      onDone?.();
    }, 520);
    timers.current.push(id);
  }

  useEffect(() => {
    timers.current.push(window.setTimeout(() => setPhase("hold"), 60));
    timers.current.push(window.setTimeout(() => finish(), durationMs));
    return () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs]);

  if (phase === "gone") return null;

  return (
    <div
      className={`splash-screen phase-${phase}`}
      role="presentation"
      onClick={finish}
    >
      <div className="splash-atmosphere" aria-hidden />
      <div className="splash-grain" aria-hidden />
      <div className="splash-vignette" aria-hidden />
      <div className="splash-beam" aria-hidden />

      <div className="splash-stage">
        <div className="splash-logo-wrap">
          <img className="splash-logo" src="/applogo.png" alt="" />
          <div className="splash-logo-glow" aria-hidden />
        </div>

        <h1 className="splash-title">
          <span className="splash-title-brand">Felty&apos;s Movie Maker</span>
          <span className="splash-title-year">2026</span>
        </h1>
      </div>
    </div>
  );
}
