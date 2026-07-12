import {
  FilmstripPlayRegular,
  ImageRegular,
  MusicNote2Regular,
} from "@fluentui/react-icons";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useProjectStore, type MediaItem, type TrackKind } from "../../state/projectStore";
import {
  beginPointerMediaDrag,
  defaultTrackForMediaType,
} from "../../utils/mediaDrag";

export function MediaLibrary() {
  const media = useProjectStore((s) => s.project.media);
  const selection = useProjectStore((s) => s.selection);
  const playhead = useProjectStore((s) => s.playhead);
  const addMedia = useProjectStore((s) => s.addMedia);
  const addClipFromMedia = useProjectStore((s) => s.addClipFromMedia);
  const setSelection = useProjectStore((s) => s.setSelection);
  const setStatusMessage = useProjectStore((s) => s.setStatusMessage);

  async function onImport() {
    const selected = await open({
      multiple: true,
      filters: [
        {
          name: "Media",
          extensions: [
            "mp4",
            "mov",
            "avi",
            "mkv",
            "wmv",
            "webm",
            "jpg",
            "jpeg",
            "png",
            "bmp",
            "mp3",
            "wav",
            "aac",
            "m4a",
          ],
        },
      ],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    for (const path of paths) {
      try {
        const item = await invoke<MediaItem>("add_media", { path });
        // Ensure type field exists even if serde naming differs
        const normalized: MediaItem = {
          ...item,
          type: (item.type || (item as { media_type?: string }).media_type || "video") as MediaItem["type"],
        };
        addMedia(normalized);
      } catch (e) {
        setStatusMessage(String(e));
      }
    }
  }

  function trackFor(item: MediaItem): TrackKind {
    return defaultTrackForMediaType(item.type);
  }

  function addToTimeline(item: MediaItem, position = playhead) {
    addClipFromMedia(item.id, trackFor(item), Math.max(0, position));
    setStatusMessage(`Added ${item.name} to timeline — select it to edit`);
    // Nudge UI to scroll timeline into view
    requestAnimationFrame(() => {
      document.querySelector(".timeline")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      document.querySelector(".clip-item.selected")?.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    });
  }

  function onPointerDown(e: React.PointerEvent, item: MediaItem) {
    if (e.button !== 0) return;
    beginPointerMediaDrag(e, {
      kind: "mmm-media",
      mediaId: item.id,
      track: trackFor(item),
      name: item.name,
    });
  }

  return (
    <section className="panel media-library">
      <div className="panel-header">
        <h2>Media Pool</h2>
        <button type="button" className="tool-btn compact" onClick={onImport}>
          Import
        </button>
      </div>
      <ul className="media-list">
        {media.length === 0 && (
          <li className="empty-hint">
            Import media, then drag onto the timeline (or double-click / Add).
          </li>
        )}
        {media.map((item) => {
          const selected = selection?.kind === "media" && selection.id === item.id;
          return (
            <li
              key={item.id}
              className={`media-item ${selected ? "selected" : ""}`}
              onPointerDown={(e) => onPointerDown(e, item)}
              onClick={() => setSelection({ kind: "media", id: item.id })}
              onDoubleClick={() => addToTimeline(item)}
              title="Drag to timeline, or double-click / Add"
            >
              <span className="media-icon">
                {item.type === "audio" ? (
                  <MusicNote2Regular fontSize={18} />
                ) : item.type === "image" ? (
                  <ImageRegular fontSize={18} />
                ) : (
                  <FilmstripPlayRegular fontSize={18} />
                )}
              </span>
              <span className="media-meta">
                <span className="media-name">{item.name}</span>
                <span className="media-sub">
                  {item.type}
                  {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
                  {item.fps ? ` · ${item.fps}fps` : ""}
                  {` · ${item.duration.toFixed(1)}s`}
                </span>
              </span>
              <button
                type="button"
                className="tool-btn compact media-add-btn"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  addToTimeline(item);
                }}
                title="Add to timeline at playhead"
              >
                Add
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
