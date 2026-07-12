import { useEffect, useRef } from "react";

export const APP_VERSION = "0.1.0";

const DEDICATION =
  "For my dad, Wayne, who gave me my first computer—a Radio Shack with 64 KB of memory—in 1978, and with it a lifelong sense of possibility. Inspired by my sister Janet and my brother Phil, whose lives reflect the love and example of our parents, and who are now raising children of character, kindness, and promise in their own turn.";

const BLURB =
  'Built by Matt Kading, a/k/a “Felty,” Felty’s Movie Maker 2026 is a desktop editor for storytellers who want control, clarity, and software that does not come with a leash. Local, capable, and designed to be yours.';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AboutDialog({ open, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="about-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="about-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
      >
        <header className="about-hero">
          <img className="about-logo" src="/applogo.png" alt="" />
          <div className="about-hero-text">
            <h1 id="about-title">Felty&apos;s Movie Maker</h1>
            <p className="about-year">2026</p>
          </div>
        </header>

        <dl className="about-meta">
          <div>
            <dt>Version</dt>
            <dd>{APP_VERSION}</dd>
          </div>
          <div>
            <dt>Platforms</dt>
            <dd>Windows · macOS · Linux</dd>
          </div>
          <div>
            <dt>Engine</dt>
            <dd>Tauri 2 · React · FFmpeg</dd>
          </div>
        </dl>

        <section className="about-section">
          <h2>About the maker</h2>
          <p>{BLURB}</p>
        </section>

        <section className="about-section about-dedication">
          <h2>Dedication</h2>
          <p>{DEDICATION}</p>
        </section>

        <footer className="about-footer">
          <button ref={closeRef} type="button" className="about-close" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
