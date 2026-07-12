import { useEffect, useState } from "react";
import { useProjectStore, type TrackKind } from "../../state/projectStore";
import { isMediaDragging } from "../../utils/mediaDrag";
import { ClipItem } from "./ClipItem";

type Props = {
  kind: TrackKind;
  label: string;
  pxPerSec: number;
};

export function Track({ kind, label, pxPerSec }: Props) {
  const allClips = useProjectStore((s) => s.project.clips);
  const clips = allClips.filter((c) => c.track === kind);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const onMove = (ev: PointerEvent) => {
      if (!isMediaDragging()) {
        setDragOver(false);
        return;
      }
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const lane = el?.closest?.(`.track-lane[data-track="${kind}"]`);
      setDragOver(!!lane);
    };
    const onUp = () => setDragOver(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [kind]);

  return (
    <div className="track-row">
      <div className="track-label">{label}</div>
      <div className={`track-lane ${dragOver ? "drop-target" : ""}`} data-track={kind}>
        {clips.length === 0 && <span className="track-drop-hint">Drop media here</span>}
        {clips.map((clip) => (
          <ClipItem key={clip.id} clip={clip} pxPerSec={pxPerSec} />
        ))}
      </div>
    </div>
  );
}
