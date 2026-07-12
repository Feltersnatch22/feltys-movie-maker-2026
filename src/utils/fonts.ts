/** Shared font catalog for titles, credits, and GIF/meme captions. */
export type FontOption = {
  id: string;
  label: string;
  /** CSS font-family stack for UI / preview */
  css: string;
  /** Common Windows font file name for FFmpeg drawtext (optional) */
  winFile?: string;
};

export const FONT_OPTIONS: FontOption[] = [
  { id: "impact", label: "Impact (meme)", css: "Impact, Haettenschweiler, 'Arial Black', sans-serif", winFile: "impact.ttf" },
  { id: "arial", label: "Arial", css: "Arial, Helvetica, sans-serif", winFile: "arial.ttf" },
  { id: "arial-black", label: "Arial Black", css: "'Arial Black', Gadget, sans-serif", winFile: "ariblk.ttf" },
  { id: "georgia", label: "Georgia", css: "Georgia, 'Times New Roman', serif", winFile: "georgia.ttf" },
  { id: "times", label: "Times New Roman", css: "'Times New Roman', Times, serif", winFile: "times.ttf" },
  { id: "courier", label: "Courier New", css: "'Courier New', Courier, monospace", winFile: "cour.ttf" },
  { id: "verdana", label: "Verdana", css: "Verdana, Geneva, sans-serif", winFile: "verdana.ttf" },
  { id: "trebuchet", label: "Trebuchet MS", css: "'Trebuchet MS', Helvetica, sans-serif", winFile: "trebuc.ttf" },
  { id: "comic", label: "Comic Sans MS", css: "'Comic Sans MS', 'Comic Sans', cursive", winFile: "comic.ttf" },
  { id: "segoe", label: "Segoe UI", css: "'Segoe UI', Tahoma, sans-serif", winFile: "segoeui.ttf" },
  { id: "urbanist", label: "Urbanist", css: "'Urbanist', 'Satoshi', sans-serif" },
  { id: "satoshi", label: "Satoshi", css: "'Satoshi', 'Segoe UI', sans-serif" },
  { id: "ibm-plex", label: "IBM Plex Sans", css: "'IBM Plex Sans', 'Segoe UI', sans-serif" },
  { id: "bebas", label: "Bebas Neue", css: "'Bebas Neue', Impact, sans-serif" },
  { id: "oswald", label: "Oswald", css: "Oswald, 'Arial Narrow', sans-serif" },
  { id: "playfair", label: "Playfair Display", css: "'Playfair Display', Georgia, serif" },
  { id: "roboto-mono", label: "Roboto Mono", css: "'Roboto Mono', 'Courier New', monospace" },
];

export const TITLE_STYLES = [
  { id: "plain", label: "Plain" },
  { id: "fade", label: "Fade in / out" },
  { id: "lowerThird", label: "Lower third" },
  { id: "glitch", label: "Glitch" },
  { id: "neon", label: "Neon glow" },
  { id: "outline", label: "Heavy outline" },
  { id: "typewriter", label: "Typewriter" },
  { id: "credits", label: "Credits scroll" },
  { id: "cinematic", label: "Cinematic" },
] as const;

export type TitleStyleId = (typeof TITLE_STYLES)[number]["id"];

export function fontCss(idOrFamily: string): string {
  const hit = FONT_OPTIONS.find((f) => f.id === idOrFamily || f.css === idOrFamily || f.label === idOrFamily);
  return hit?.css ?? idOrFamily;
}

export function fontOptionId(idOrFamily: string): string {
  const hit = FONT_OPTIONS.find(
    (f) => f.id === idOrFamily || f.css === idOrFamily || f.label === idOrFamily || f.css.includes(idOrFamily)
  );
  return hit?.id ?? "arial";
}

/** Resolve a Windows font path for FFmpeg when possible. */
export function windowsFontPath(fontId: string): string | null {
  const hit = FONT_OPTIONS.find((f) => f.id === fontId || f.css === fontId);
  if (!hit?.winFile) return null;
  return `C:/Windows/Fonts/${hit.winFile}`;
}
