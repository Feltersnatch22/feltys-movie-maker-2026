/** Pixels per second on the timeline */
export const DEFAULT_PX_PER_SEC = 80;

/** Width of the sticky track label column — keep in sync with CSS grid. */
export const TRACK_LABEL_WIDTH = 84;

export function secondsToPixels(seconds: number, pxPerSec = DEFAULT_PX_PER_SEC): number {
  return seconds * pxPerSec;
}

export function pixelsToSeconds(pixels: number, pxPerSec = DEFAULT_PX_PER_SEC): number {
  return pixels / pxPerSec;
}

/** Convert a client X inside the scroll container to timeline seconds. */
export function clientXToSeconds(
  clientX: number,
  scrollEl: HTMLElement,
  pxPerSec: number,
  labelWidth = TRACK_LABEL_WIDTH
): number {
  const rect = scrollEl.getBoundingClientRect();
  const x = clientX - rect.left + scrollEl.scrollLeft - labelWidth;
  return Math.max(0, pixelsToSeconds(x, pxPerSec));
}

export function formatTimecode(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 100);
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(sec)}.${pad(ms)}`;
  }
  return `${pad(m)}:${pad(sec)}.${pad(ms)}`;
}

function pad(n: number, width = 2): string {
  return n.toString().padStart(width, "0");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
