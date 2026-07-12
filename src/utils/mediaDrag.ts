import type { TrackKind } from "../state/projectStore";

export type MediaDragPayload = {
  kind: "mmm-media";
  mediaId: string;
  track: TrackKind;
  name?: string;
};

type DragListeners = {
  onMove?: (x: number, y: number) => void;
  onDrop?: (x: number, y: number, payload: MediaDragPayload) => void;
  onCancel?: () => void;
};

let activeDrag: MediaDragPayload | null = null;
let ghostEl: HTMLDivElement | null = null;
let listeners: DragListeners = {};

export function getActiveMediaDrag(): MediaDragPayload | null {
  return activeDrag;
}

export function defaultTrackForMediaType(type: string): TrackKind {
  if (type === "audio") return "audio";
  return "video";
}

export function isMediaDragging(): boolean {
  return activeDrag != null;
}

export function setMediaDragUiListeners(next: DragListeners) {
  listeners = next;
}

export function beginPointerMediaDrag(
  e: React.PointerEvent,
  payload: MediaDragPayload
) {
  if (e.button !== 0) return;
  const startX = e.clientX;
  const startY = e.clientY;
  let started = false;

  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (!started) {
      if (Math.hypot(dx, dy) < 6) return;
      started = true;
      activeDrag = payload;
      ghostEl = document.createElement("div");
      ghostEl.className = "media-drag-ghost";
      ghostEl.textContent = payload.name || "Media";
      document.body.appendChild(ghostEl);
      document.body.classList.add("is-dragging-media");
    }
    moveGhost(ev.clientX, ev.clientY);
    listeners.onMove?.(ev.clientX, ev.clientY);
  };

  const onUp = (ev: PointerEvent) => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    const payloadNow = activeDrag;
    const wasDragging = started;
    cleanupGhost();
    document.body.classList.remove("is-dragging-media");
    activeDrag = null;
    if (wasDragging && payloadNow) {
      listeners.onDrop?.(ev.clientX, ev.clientY, payloadNow);
    } else {
      listeners.onCancel?.();
    }
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
}

function moveGhost(x: number, y: number) {
  if (!ghostEl) return;
  ghostEl.style.transform = `translate(${x + 12}px, ${y + 12}px)`;
}

function cleanupGhost() {
  ghostEl?.remove();
  ghostEl = null;
}

export function findTrackLaneAtPoint(
  x: number,
  y: number
): { el: HTMLElement; kind: TrackKind } | null {
  const stack = document.elementsFromPoint(x, y);
  for (const node of stack) {
    if (!(node instanceof HTMLElement)) continue;
    const lane = node.closest(".track-lane[data-track]") as HTMLElement | null;
    if (lane) {
      const kind = lane.dataset.track as TrackKind;
      if (kind === "video" || kind === "overlay" || kind === "audio") {
        return { el: lane, kind };
      }
    }
  }
  return null;
}
