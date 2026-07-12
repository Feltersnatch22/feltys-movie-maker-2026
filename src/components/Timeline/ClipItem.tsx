import { useEffect, useRef } from "react";
import { useProjectStore, type Clip, type TrackKind } from "../../state/projectStore";
import { clipDuration } from "../../utils/ffmpegHelpers";
import { pixelsToSeconds, secondsToPixels } from "../../utils/time";
import { useContextMenu, type ContextMenuItem } from "../shared/ContextMenu";

type Props = {
  clip: Clip;
  pxPerSec: number;
};

type DragMode = "move" | "start" | "end";

export function ClipItem({ clip, pxPerSec }: Props) {
  const mediaName = useProjectStore(
    (s) => s.project.media.find((m) => m.id === clip.mediaId)?.name
  );
  const selected = useProjectStore(
    (s) => s.selection?.kind === "clip" && s.selection.id === clip.id
  );
  const clipboard = useProjectStore((s) => s.clipboard);
  const setSelection = useProjectStore((s) => s.setSelection);
  const moveClip = useProjectStore((s) => s.moveClip);
  const resizeClip = useProjectStore((s) => s.resizeClip);
  const updateClip = useProjectStore((s) => s.updateClip);
  const cutSelection = useProjectStore((s) => s.cutSelection);
  const copySelection = useProjectStore((s) => s.copySelection);
  const pasteClipboard = useProjectStore((s) => s.pasteClipboard);
  const duplicateSelection = useProjectStore((s) => s.duplicateSelection);
  const deleteSelection = useProjectStore((s) => s.deleteSelection);
  const sliceClipAtPlayhead = useProjectStore((s) => s.sliceClipAtPlayhead);
  const trimClipToPlayhead = useProjectStore((s) => s.trimClipToPlayhead);
  const setPlayheadPosition = useProjectStore((s) => s.setPlayheadPosition);
  const addEffectToSelected = useProjectStore((s) => s.addEffectToSelected);
  const setStatusMessage = useProjectStore((s) => s.setStatusMessage);

  const { openContextMenu, menuNode } = useContextMenu();

  const width = Math.max(8, secondsToPixels(clipDuration(clip), pxPerSec));
  const left = secondsToPixels(clip.position, pxPerSec);

  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    origPos: number;
    pointerId: number;
  } | null>(null);
  const pxRef = useRef(pxPerSec);
  const clipIdRef = useRef(clip.id);
  pxRef.current = pxPerSec;
  clipIdRef.current = clip.id;

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dSec = pixelsToSeconds(dx, pxRef.current);
      if (drag.mode === "move") {
        moveClip(clipIdRef.current, Math.max(0, drag.origPos + dSec));
      } else if (drag.mode === "start") {
        resizeClip(clipIdRef.current, "start", dSec);
        drag.startX = e.clientX;
      } else {
        resizeClip(clipIdRef.current, "end", dSec);
        drag.startX = e.clientX;
      }
    }

    function onUp() {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.classList.remove("is-trimming-clip");
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [moveClip, resizeClip]);

  function beginDrag(e: React.PointerEvent, mode: DragMode) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setSelection({ kind: "clip", id: clip.id });
    dragRef.current = {
      mode,
      startX: e.clientX,
      origPos: clip.position,
      pointerId: e.pointerId,
    };
    if (mode === "start" || mode === "end") {
      document.body.classList.add("is-trimming-clip");
    }
  }

  function moveToTrack(track: TrackKind) {
    if (clip.track === track) return;
    updateClip(clip.id, { track });
    setStatusMessage(`Moved clip to ${track === "video" ? "V1" : track === "overlay" ? "V2" : "A1"}`);
  }

  function buildMenu(): ContextMenuItem[] {
    return [
      { kind: "label", label: mediaName ?? "Clip" },
      {
        kind: "item",
        label: "Cut",
        shortcut: "Ctrl+X",
        action: () => {
          setSelection({ kind: "clip", id: clip.id });
          cutSelection();
        },
      },
      {
        kind: "item",
        label: "Copy",
        shortcut: "Ctrl+C",
        action: () => {
          setSelection({ kind: "clip", id: clip.id });
          copySelection();
        },
      },
      {
        kind: "item",
        label: "Paste",
        shortcut: "Ctrl+V",
        disabled: !clipboard,
        action: () => pasteClipboard(),
      },
      {
        kind: "item",
        label: "Duplicate",
        shortcut: "Ctrl+D",
        action: () => {
          setSelection({ kind: "clip", id: clip.id });
          duplicateSelection();
        },
      },
      { kind: "sep" },
      {
        kind: "item",
        label: "Blade at Playhead",
        shortcut: "S",
        action: () => {
          setSelection({ kind: "clip", id: clip.id });
          sliceClipAtPlayhead();
        },
      },
      {
        kind: "item",
        label: "Trim Start to Playhead",
        shortcut: "[",
        action: () => {
          setSelection({ kind: "clip", id: clip.id });
          trimClipToPlayhead("start");
        },
      },
      {
        kind: "item",
        label: "Trim End to Playhead",
        shortcut: "]",
        action: () => {
          setSelection({ kind: "clip", id: clip.id });
          trimClipToPlayhead("end");
        },
      },
      { kind: "sep" },
      {
        kind: "item",
        label: "Move to V1 (Video)",
        disabled: clip.track === "video",
        action: () => moveToTrack("video"),
      },
      {
        kind: "item",
        label: "Move to V2 (Overlay)",
        disabled: clip.track === "overlay",
        action: () => moveToTrack("overlay"),
      },
      {
        kind: "item",
        label: "Move to A1 (Audio)",
        disabled: clip.track === "audio",
        action: () => moveToTrack("audio"),
      },
      { kind: "sep" },
      {
        kind: "item",
        label: "Go to Clip Start",
        action: () => setPlayheadPosition(clip.position),
      },
      {
        kind: "item",
        label: "Go to Clip End",
        action: () => setPlayheadPosition(clip.position + clipDuration(clip)),
      },
      { kind: "sep" },
      {
        kind: "item",
        label: "Add Fade In",
        action: () => {
          setSelection({ kind: "clip", id: clip.id });
          addEffectToSelected("fadeIn", 0.5);
        },
      },
      {
        kind: "item",
        label: "Add Fade Out",
        action: () => {
          setSelection({ kind: "clip", id: clip.id });
          addEffectToSelected("fadeOut", 0.5);
        },
      },
      {
        kind: "item",
        label: "Inspect Clip",
        action: () => {
          setSelection({ kind: "clip", id: clip.id });
          setStatusMessage("Clip selected — edit in Inspector");
        },
      },
      { kind: "sep" },
      {
        kind: "item",
        label: "Delete",
        shortcut: "Del",
        danger: true,
        action: () => {
          setSelection({ kind: "clip", id: clip.id });
          deleteSelection();
        },
      },
    ];
  }

  return (
    <>
      <div
        className={`clip-item track-${clip.track} ${selected ? "selected" : ""}`}
        style={{ left, width }}
        onPointerDown={(e) => beginDrag(e, "move")}
        onClick={(e) => {
          e.stopPropagation();
          setSelection({ kind: "clip", id: clip.id });
        }}
        onContextMenu={(e) => {
          setSelection({ kind: "clip", id: clip.id });
          openContextMenu(e, buildMenu());
        }}
        title={mediaName ?? clip.id}
      >
        <span className="clip-label">{mediaName ?? "Clip"}</span>

        {selected && (
          <>
            <button
              type="button"
              className="trim-handle left"
              title="Drag to trim start"
              aria-label="Trim start"
              onPointerDown={(e) => beginDrag(e, "start")}
            >
              <span className="trim-glyph" aria-hidden />
            </button>
            <button
              type="button"
              className="trim-handle right"
              title="Drag to trim end"
              aria-label="Trim end"
              onPointerDown={(e) => beginDrag(e, "end")}
            >
              <span className="trim-glyph" aria-hidden />
            </button>
          </>
        )}
      </div>
      {menuNode}
    </>
  );
}
