import { useProjectStore } from "../../state/projectStore";
import { formatTimecode } from "../../utils/time";
import { projectDuration, sourceCapabilities } from "../../utils/ffmpegHelpers";

type Props = {
  onFullscreenPreview?: () => void;
  onPopoutPreview?: () => void;
  onSecondaryPreview?: () => void;
};

export function Toolbar({ onFullscreenPreview, onPopoutPreview, onSecondaryPreview }: Props) {
  const project = useProjectStore((s) => s.project);
  const playhead = useProjectStore((s) => s.playhead);
  const sliceClipAtPlayhead = useProjectStore((s) => s.sliceClipAtPlayhead);
  const setMarkIn = useProjectStore((s) => s.setMarkIn);
  const setMarkOut = useProjectStore((s) => s.setMarkOut);
  const addMarker = useProjectStore((s) => s.addMarker);
  const toggleTheme = useProjectStore((s) => s.toggleTheme);
  const theme = useProjectStore((s) => s.theme);

  const fps = sourceCapabilities(project.media).fps || 30;
  const duration = projectDuration(project);

  return (
    <header className="toolbar nle-toolbar">
      <div className="brand">
        <img className="brand-mark-sm" src="/applogo.png" alt="" />
        <div className="brand-text">
          <strong>Felty's Movie Maker</strong>
          <span className="brand-sub">{project.name}</span>
        </div>
      </div>

      <div className="toolbar-group edit-modes">
        <button type="button" className="nle-tool" onClick={setMarkIn} title="Mark In (I)">
          I
        </button>
        <button type="button" className="nle-tool" onClick={addMarker} title="Mark (M)">
          M
        </button>
        <button type="button" className="nle-tool" onClick={setMarkOut} title="Mark Out (O)">
          O
        </button>
        <span className="tool-sep" />
        <button type="button" className="nle-tool wide" onClick={sliceClipAtPlayhead} title="Blade / Slice (S)">
          Blade
        </button>
      </div>

      <div className="toolbar-group tc-readout">
        <span className="timecode">{formatTimecode(playhead)}</span>
        <span className="tc-sep">/</span>
        <span className="timecode muted">{formatTimecode(duration)}</span>
        <span className="fps-badge">{Math.round(fps)} fps</span>
      </div>

      <div className="toolbar-group toolbar-end">
        <button type="button" className="ghost-btn" onClick={() => onFullscreenPreview?.()}>
          Fullscreen
        </button>
        <button type="button" className="ghost-btn" onClick={() => onPopoutPreview?.()}>
          Pop Out
        </button>
        <button type="button" className="ghost-btn" onClick={() => onSecondaryPreview?.()}>
          2nd Display
        </button>
        <button
          type="button"
          className="ghost-btn"
          onClick={toggleTheme}
          title="Toggle light / dark"
        >
          {theme === "dark" ? "Light" : "Dark"}
        </button>
      </div>
    </header>
  );
}
