import { useEffect, useMemo, useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useProjectStore } from "../../state/projectStore";
import { FontPicker } from "../shared/FontPicker";
import { fontCss } from "../../utils/fonts";

export type GifExportSettings = {
  inputPath: string;
  outputPath: string;
  start: number;
  end: number;
  width: number;
  fps: number;
  topText: string;
  bottomText: string;
  fontSize: number;
  font: string;
  textColor: string;
  strokeColor: string;
  strokeWidth: number;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
  speed: number;
};

const MEME_PRESETS = [
  { label: "Classic", top: "WHEN YOU", bottom: "FINALLY FINISH THE EDIT" },
  { label: "Drake", top: "", bottom: "POV: THIS CLIP" },
  { label: "Distracted", top: "ME", bottom: "THE TIMELINE" },
  { label: "This is fine", top: "THIS IS FINE", bottom: "" },
];

export function GifMemeMaker() {
  const project = useProjectStore((s) => s.project);
  const selection = useProjectStore((s) => s.selection);
  const playhead = useProjectStore((s) => s.playhead);
  const setStatusMessage = useProjectStore((s) => s.setStatusMessage);
  const setPlayheadPosition = useProjectStore((s) => s.setPlayheadPosition);

  const source = useMemo(() => {
    if (selection?.kind === "clip") {
      const clip = project.clips.find((c) => c.id === selection.id);
      const media = clip && project.media.find((m) => m.id === clip.mediaId);
      if (clip && media && media.type !== "audio") {
        return {
          path: media.path,
          name: media.name,
          start: clip.start,
          end: clip.end,
          mediaStart: clip.start,
          mediaEnd: clip.end,
          label: `Clip · ${media.name}`,
        };
      }
    }
    if (selection?.kind === "media") {
      const media = project.media.find((m) => m.id === selection.id);
      if (media && media.type !== "audio") {
        return {
          path: media.path,
          name: media.name,
          start: 0,
          end: Math.min(media.duration || 3, 5),
          mediaStart: 0,
          mediaEnd: media.duration || 5,
          label: `Media · ${media.name}`,
        };
      }
    }
    const first = project.media.find((m) => m.type === "video" || m.type === "image");
    if (first) {
      return {
        path: first.path,
        name: first.name,
        start: 0,
        end: Math.min(first.duration || 3, 5),
        mediaStart: 0,
        mediaEnd: first.duration || 5,
        label: `Media · ${first.name}`,
      };
    }
    return null;
  }, [project, selection]);

  const [topText, setTopText] = useState("");
  const [bottomText, setBottomText] = useState("FELTY'S MOVIE MAKER");
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(3);
  const [width, setWidth] = useState(480);
  const [fps, setFps] = useState(12);
  const [fontSize, setFontSize] = useState(36);
  const [font, setFont] = useState("impact");
  const [speed, setSpeed] = useState(1);
  const [textColor, setTextColor] = useState("#ffffff");
  const [strokeColor, setStrokeColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!source) return;
    setStart(Number(source.start.toFixed(2)));
    setEnd(Number(source.end.toFixed(2)));
  }, [source?.path, source?.start, source?.end]);

  useEffect(() => {
    if (!source) {
      setPreviewUrl(null);
      return;
    }
    const t = Math.min(Math.max(start, source.mediaStart), Math.max(end - 0.05, start));
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      try {
        const url = await invoke<string>("get_frame_data_url", {
          path: source.path,
          time: t,
          maxWidth: 640,
        });
        if (!cancelled) setPreviewUrl(url);
      } catch {
        if (!cancelled) setPreviewUrl(null);
      }
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [source, start, end]);

  function usePlayheadAsStart() {
    if (!source) return;
    // Map timeline playhead → source time if a clip is selected
    if (selection?.kind === "clip") {
      const clip = project.clips.find((c) => c.id === selection.id);
      if (clip) {
        const local = clip.start + (playhead - clip.position) * clip.speed;
        setStart(Number(Math.max(clip.start, Math.min(local, clip.end - 0.1)).toFixed(2)));
        return;
      }
    }
    setStart(Number(playhead.toFixed(2)));
  }

  function usePlayheadAsEnd() {
    if (!source) return;
    if (selection?.kind === "clip") {
      const clip = project.clips.find((c) => c.id === selection.id);
      if (clip) {
        const local = clip.start + (playhead - clip.position) * clip.speed;
        setEnd(Number(Math.max(start + 0.1, Math.min(local, clip.end)).toFixed(2)));
        return;
      }
    }
    setEnd(Number(Math.max(start + 0.1, playhead).toFixed(2)));
  }

  async function onExportGif() {
    if (!source) {
      setStatusMessage("Import a video or image first");
      return;
    }
    const dest = await save({
      filters: [{ name: "GIF", extensions: ["gif"] }],
      defaultPath: `${source.name.replace(/\.[^.]+$/, "") || "meme"}.gif`,
    });
    if (!dest) return;

    const settings: GifExportSettings = {
      inputPath: source.path,
      outputPath: dest,
      start,
      end,
      width,
      fps,
      topText,
      bottomText,
      fontSize,
      font,
      textColor,
      strokeColor,
      strokeWidth,
      cropX: 0,
      cropY: 0,
      cropW: 1,
      cropH: 1,
      speed,
    };

    setBusy(true);
    setStatusMessage("Making GIF…");
    try {
      await invoke("export_gif", { settings });
      setStatusMessage(`GIF saved → ${dest}`);
    } catch (e) {
      setStatusMessage(String(e));
    } finally {
      setBusy(false);
    }
  }

  const duration = Math.max(0.1, end - start);

  return (
    <section className="panel gif-meme-panel">
      <div className="panel-header">
        <h2>GIF / Meme</h2>
        {busy && <span className="badge">Rendering</span>}
      </div>
      <div className="properties-body">
        <div className="prop-block">
          <p className="hint">
            {source
              ? `Source: ${source.label}`
              : "Import video/image (or select a clip) to make a GIF meme."}
          </p>

          <div className="meme-preview">
            {previewUrl ? (
              <div className="meme-frame">
                <img src={previewUrl} alt="Meme preview frame" />
                {topText.trim() && (
                  <span
                    className="meme-caption top"
                    style={{ fontFamily: fontCss(font), fontSize: Math.max(14, fontSize * 0.55) }}
                  >
                    {topText}
                  </span>
                )}
                {bottomText.trim() && (
                  <span
                    className="meme-caption bottom"
                    style={{ fontFamily: fontCss(font), fontSize: Math.max(14, fontSize * 0.55) }}
                  >
                    {bottomText}
                  </span>
                )}
              </div>
            ) : (
              <div className="preview-empty">
                <p>No preview</p>
                <span>Select media to preview captions</span>
              </div>
            )}
          </div>

          <h3>Captions</h3>
          <label>
            Top text
            <input
              value={topText}
              onChange={(e) => setTopText(e.target.value)}
              placeholder="TOP TEXT"
            />
          </label>
          <label>
            Bottom text
            <input
              value={bottomText}
              onChange={(e) => setBottomText(e.target.value)}
              placeholder="BOTTOM TEXT"
            />
          </label>
          <FontPicker value={font} onChange={setFont} label="Caption font" />
          <div className="effect-grid">
            {MEME_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                className="tool-btn compact"
                onClick={() => {
                  setTopText(p.top);
                  setBottomText(p.bottom);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <h3>Range</h3>
          <div className="inline-fields">
            <label>
              Start (s)
              <input
                type="number"
                step="0.05"
                min={0}
                value={start}
                onChange={(e) => setStart(Number(e.target.value))}
              />
            </label>
            <label>
              End (s)
              <input
                type="number"
                step="0.05"
                min={0}
                value={end}
                onChange={(e) => setEnd(Number(e.target.value))}
              />
            </label>
          </div>
          <div className="inline-actions">
            <button type="button" className="tool-btn compact" onClick={usePlayheadAsStart}>
              In @ playhead
            </button>
            <button type="button" className="tool-btn compact" onClick={usePlayheadAsEnd}>
              Out @ playhead
            </button>
            <button
              type="button"
              className="tool-btn compact"
              onClick={() => setPlayheadPosition(start)}
            >
              Scrub to in
            </button>
          </div>
          <p className="hint">
            Length {duration.toFixed(2)}s → ~{(duration / speed).toFixed(2)}s at {speed}×
            (max 30s source)
          </p>

          <h3>GIF settings</h3>
          <label>
            Width {width}px
            <input
              type="range"
              min={240}
              max={720}
              step={10}
              value={width}
              onChange={(e) => setWidth(Number(e.target.value))}
            />
          </label>
          <label>
            FPS {fps}
            <input
              type="range"
              min={6}
              max={20}
              step={1}
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
            />
          </label>
          <label>
            Speed {speed.toFixed(2)}×
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            />
          </label>
          <label>
            Caption size {fontSize}
            <input
              type="range"
              min={18}
              max={64}
              step={1}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
            />
          </label>
          <div className="inline-fields">
            <label>
              Text
              <input
                type="color"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
              />
            </label>
            <label>
              Stroke
              <input
                type="color"
                value={strokeColor}
                onChange={(e) => setStrokeColor(e.target.value)}
              />
            </label>
            <label>
              Stroke W
              <input
                type="number"
                min={0}
                max={8}
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(Number(e.target.value))}
              />
            </label>
          </div>

          <button
            type="button"
            className="tool-btn primary"
            disabled={!source || busy}
            onClick={onExportGif}
          >
            Export GIF
          </button>
        </div>
      </div>
    </section>
  );
}
