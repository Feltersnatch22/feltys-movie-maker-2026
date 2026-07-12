import { useEffect, useRef } from "react";
import { useProjectStore, type Title } from "../../state/projectStore";
import { pixelsToSeconds, secondsToPixels } from "../../utils/time";
import { useContextMenu, type ContextMenuItem } from "../shared/ContextMenu";

type Props = {
  title: Title;
  pxPerSec: number;
};

type DragMode = "move" | "start" | "end";

export function TitleItem({ title, pxPerSec }: Props) {
  const selected = useProjectStore(
    (s) => s.selection?.kind === "title" && s.selection.id === title.id
  );
  const clipboard = useProjectStore((s) => s.clipboard);
  const setSelection = useProjectStore((s) => s.setSelection);
  const moveTitle = useProjectStore((s) => s.moveTitle);
  const resizeTitle = useProjectStore((s) => s.resizeTitle);
  const updateTitle = useProjectStore((s) => s.updateTitle);
  const cutSelection = useProjectStore((s) => s.cutSelection);
  const copySelection = useProjectStore((s) => s.copySelection);
  const pasteClipboard = useProjectStore((s) => s.pasteClipboard);
  const duplicateSelection = useProjectStore((s) => s.duplicateSelection);
  const deleteSelection = useProjectStore((s) => s.deleteSelection);
  const setPlayheadPosition = useProjectStore((s) => s.setPlayheadPosition);
  const setStatusMessage = useProjectStore((s) => s.setStatusMessage);

  const { openContextMenu, menuNode } = useContextMenu();

  const width = Math.max(28, secondsToPixels(title.duration, pxPerSec));
  const left = secondsToPixels(title.position, pxPerSec);

  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    origPos: number;
    origDur: number;
  } | null>(null);
  const pxRef = useRef(pxPerSec);
  const idRef = useRef(title.id);
  pxRef.current = pxPerSec;
  idRef.current = title.id;

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dSec = pixelsToSeconds(dx, pxRef.current);
      if (drag.mode === "move") {
        moveTitle(idRef.current, Math.max(0, drag.origPos + dSec));
      } else if (drag.mode === "start") {
        resizeTitle(idRef.current, "start", dSec);
        drag.startX = e.clientX;
      } else {
        resizeTitle(idRef.current, "end", dSec);
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
  }, [moveTitle, resizeTitle]);

  function beginDrag(e: React.PointerEvent, mode: DragMode) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setSelection({ kind: "title", id: title.id });
    dragRef.current = {
      mode,
      startX: e.clientX,
      origPos: title.position,
      origDur: title.duration,
    };
    if (mode === "start" || mode === "end") {
      document.body.classList.add("is-trimming-clip");
    }
  }

  function buildMenu(): ContextMenuItem[] {
    return [
      { kind: "label", label: title.text || "Title" },
      {
        kind: "item",
        label: "Cut",
        shortcut: "Ctrl+X",
        action: () => {
          setSelection({ kind: "title", id: title.id });
          cutSelection();
        },
      },
      {
        kind: "item",
        label: "Copy",
        shortcut: "Ctrl+C",
        action: () => {
          setSelection({ kind: "title", id: title.id });
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
          setSelection({ kind: "title", id: title.id });
          duplicateSelection();
        },
      },
      { kind: "sep" },
      {
        kind: "item",
        label: "Superimpose over Video",
        disabled: title.mode === "overlay",
        action: () => updateTitle(title.id, { mode: "overlay" }),
      },
      {
        kind: "item",
        label: "Standalone Title Card",
        disabled: title.mode === "standalone",
        action: () => updateTitle(title.id, { mode: "standalone" }),
      },
      { kind: "sep" },
      {
        kind: "item",
        label: "Go to Title Start",
        action: () => setPlayheadPosition(title.position),
      },
      {
        kind: "item",
        label: "Edit in Inspector",
        action: () => {
          setSelection({ kind: "title", id: title.id });
          setStatusMessage("Title selected — edit style in Inspector");
        },
      },
      { kind: "sep" },
      {
        kind: "item",
        label: "Delete",
        shortcut: "Del",
        danger: true,
        action: () => {
          setSelection({ kind: "title", id: title.id });
          deleteSelection();
        },
      },
    ];
  }

  return (
    <>
      <div
        className={`title-chip title-item mode-${title.mode} style-${title.style} ${
          selected ? "selected" : ""
        }`}
        style={{ left, width }}
        onPointerDown={(e) => beginDrag(e, "move")}
        onClick={(e) => {
          e.stopPropagation();
          setSelection({ kind: "title", id: title.id });
        }}
        onContextMenu={(e) => {
          setSelection({ kind: "title", id: title.id });
          openContextMenu(e, buildMenu());
        }}
        title={`${title.text} · ${title.style} · ${title.mode}`}
      >
        <span className="clip-label">{title.text || "Title"}</span>
        {selected && (
          <>
            <button
              type="button"
              className="trim-handle left"
              title="Drag to adjust start"
              aria-label="Trim title start"
              onPointerDown={(e) => beginDrag(e, "start")}
            >
              <span className="trim-glyph" aria-hidden />
            </button>
            <button
              type="button"
              className="trim-handle right"
              title="Drag to adjust end"
              aria-label="Trim title end"
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
