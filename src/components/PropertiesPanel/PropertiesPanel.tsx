import {
  EFFECT_PRESETS,
  TRANSITION_KINDS,
  useProjectStore,
  type EffectKind,
} from "../../state/projectStore";
import {
  describeFilterGraph,
  RESOLUTION_PRESETS,
  resolveExportFps,
  resolveExportSize,
  sourceCapabilities,
  suggestVideoBitrate,
} from "../../utils/ffmpegHelpers";
import { TITLE_STYLES, fontCss } from "../../utils/fonts";
import { FontPicker } from "../shared/FontPicker";

export function PropertiesPanel() {
  const project = useProjectStore((s) => s.project);
  const selection = useProjectStore((s) => s.selection);
  const exportPrefs = useProjectStore((s) => s.exportPrefs);
  const updateClip = useProjectStore((s) => s.updateClip);
  const updateTitle = useProjectStore((s) => s.updateTitle);
  const updateTransition = useProjectStore((s) => s.updateTransition);
  const removeClip = useProjectStore((s) => s.removeClip);
  const removeTitle = useProjectStore((s) => s.removeTitle);
  const removeTransition = useProjectStore((s) => s.removeTransition);
  const removeEffect = useProjectStore((s) => s.removeEffect);
  const addEffectToSelected = useProjectStore((s) => s.addEffectToSelected);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const setExportPrefs = useProjectStore((s) => s.setExportPrefs);
  const sliceClipAtPlayhead = useProjectStore((s) => s.sliceClipAtPlayhead);

  const clip =
    selection?.kind === "clip"
      ? project.clips.find((c) => c.id === selection.id)
      : undefined;
  const title =
    selection?.kind === "title"
      ? project.titles.find((t) => t.id === selection.id)
      : undefined;
  const transition =
    selection?.kind === "transition"
      ? project.transitions.find((t) => t.id === selection.id)
      : undefined;
  const media =
    selection?.kind === "media"
      ? project.media.find((m) => m.id === selection.id)
      : undefined;

  const exportSize = resolveExportSize(exportPrefs.resolution, project.media);
  const exportFps = resolveExportFps(exportPrefs.fps, project.media);
  const source = sourceCapabilities(project.media);

  return (
    <section className="panel properties-panel">
      <div className="panel-header">
        <h2>Inspector</h2>
      </div>
      <div className="properties-body">
        {!selection && (
          <div className="prop-block">
            <label>
              Project name
              <input value={project.name} onChange={(e) => setProjectName(e.target.value)} />
            </label>

            <h3>Export</h3>
            <label>
              Resolution
              <select
                value={exportPrefs.resolution}
                onChange={(e) =>
                  setExportPrefs({
                    resolution: e.target.value as typeof exportPrefs.resolution,
                  })
                }
              >
                <option value="4k">4K UHD (3840×2160)</option>
                <option value="1440p">QHD 1440p</option>
                <option value="1080p">Full HD 1080p</option>
                <option value="720p">HD 720p</option>
                <option value="source">
                  Match source ({source.width}×{source.height})
                </option>
              </select>
            </label>
            <label>
              Frame rate
              <select
                value={exportPrefs.fps}
                onChange={(e) =>
                  setExportPrefs({ fps: e.target.value as typeof exportPrefs.fps })
                }
              >
                <option value="24">24 fps</option>
                <option value="30">30 fps</option>
                <option value="60">60 fps</option>
                <option value="120">120 fps</option>
                <option value="source">Match source ({source.fps} fps)</option>
              </select>
            </label>
            <p className="hint">
              Output {exportSize.width}×{exportSize.height} @ {exportFps} fps · ~
              {suggestVideoBitrate(exportSize.width, exportSize.height, exportFps)} H.264
              {exportPrefs.resolution !== "source"
                ? ` · ${RESOLUTION_PRESETS[exportPrefs.resolution].label}`
                : ""}
            </p>
            <p className="hint">
              Select a clip and drag the orange edge handles to trim · S slice · Del · Ctrl+X/C/V
            </p>
            <pre className="filter-preview">{describeFilterGraph(project) || "No graph yet"}</pre>
          </div>
        )}

        {media && (
          <div className="prop-block">
            <h3>Media</h3>
            <p className="prop-row">
              <span>Name</span>
              <strong>{media.name}</strong>
            </p>
            <p className="prop-row">
              <span>Type</span>
              <strong>{media.type}</strong>
            </p>
            <p className="prop-row">
              <span>Duration</span>
              <strong>{media.duration.toFixed(2)}s</strong>
            </p>
            <p className="prop-row">
              <span>Resolution</span>
              <strong>
                {media.width && media.height ? `${media.width}×${media.height}` : "—"}
              </strong>
            </p>
            <p className="prop-row">
              <span>Frame rate</span>
              <strong>{media.fps ? `${media.fps} fps` : "—"}</strong>
            </p>
            <p className="path-line">{media.path}</p>
          </div>
        )}

        {clip && (
          <div className="prop-block">
            <h3>Clip</h3>
            <div className="inline-actions">
              <button type="button" className="tool-btn compact" onClick={sliceClipAtPlayhead}>
                Slice
              </button>
            </div>

            <p className="hint">Drag the orange handles on either end of the clip in the timeline to trim.</p>

            <label>
              Start (source)
              <input
                type="number"
                step="0.01"
                value={clip.start}
                onChange={(e) => updateClip(clip.id, { start: Number(e.target.value) })}
              />
            </label>
            <label>
              End (source)
              <input
                type="number"
                step="0.01"
                value={clip.end}
                onChange={(e) => updateClip(clip.id, { end: Number(e.target.value) })}
              />
            </label>
            <label>
              Position
              <input
                type="number"
                step="0.01"
                value={clip.position}
                onChange={(e) => updateClip(clip.id, { position: Number(e.target.value) })}
              />
            </label>
            <label>
              Speed
              <input
                type="number"
                step="0.05"
                min="0.25"
                max="4"
                value={clip.speed}
                onChange={(e) => updateClip(clip.id, { speed: Number(e.target.value) })}
              />
            </label>
            <label>
              Opacity
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={clip.opacity}
                onChange={(e) => updateClip(clip.id, { opacity: Number(e.target.value) })}
              />
            </label>
            <label>
              Track
              <select
                value={clip.track}
                onChange={(e) =>
                  updateClip(clip.id, {
                    track: e.target.value as "video" | "audio" | "overlay",
                  })
                }
              >
                <option value="video">Video</option>
                <option value="overlay">Overlay</option>
                <option value="audio">Audio</option>
              </select>
            </label>

            <h3>Crop</h3>
            <div className="inline-fields">
              <label>
                X
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={clip.crop.x}
                  onChange={(e) =>
                    updateClip(clip.id, {
                      crop: { ...clip.crop, x: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label>
                Y
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={clip.crop.y}
                  onChange={(e) =>
                    updateClip(clip.id, {
                      crop: { ...clip.crop, y: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label>
                W
                <input
                  type="number"
                  min={0.05}
                  max={1}
                  step={0.01}
                  value={clip.crop.w}
                  onChange={(e) =>
                    updateClip(clip.id, {
                      crop: { ...clip.crop, w: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label>
                H
                <input
                  type="number"
                  min={0.05}
                  max={1}
                  step={0.01}
                  value={clip.crop.h}
                  onChange={(e) =>
                    updateClip(clip.id, {
                      crop: { ...clip.crop, h: Number(e.target.value) },
                    })
                  }
                />
              </label>
            </div>
            <button
              type="button"
              className="tool-btn compact"
              onClick={() =>
                updateClip(clip.id, { crop: { x: 0, y: 0, w: 1, h: 1 } })
              }
            >
              Reset crop
            </button>

            <h3>Zoom &amp; pan</h3>
            <label>
              Zoom {clip.transform.scale.toFixed(2)}×
              <input
                type="range"
                min={1}
                max={4}
                step={0.01}
                value={clip.transform.scale}
                onChange={(e) =>
                  updateClip(clip.id, {
                    transform: { ...clip.transform, scale: Number(e.target.value) },
                  })
                }
              />
            </label>
            <label>
              Pan X
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={clip.transform.panX}
                onChange={(e) =>
                  updateClip(clip.id, {
                    transform: { ...clip.transform, panX: Number(e.target.value) },
                  })
                }
              />
            </label>
            <label>
              Pan Y
              <input
                type="range"
                min={-1}
                max={1}
                step={0.01}
                value={clip.transform.panY}
                onChange={(e) =>
                  updateClip(clip.id, {
                    transform: { ...clip.transform, panY: Number(e.target.value) },
                  })
                }
              />
            </label>

            <h3>Adjust</h3>
            <label>
              Brightness
              <input
                type="range"
                min={-0.5}
                max={0.5}
                step={0.01}
                value={clip.adjustments.brightness}
                onChange={(e) =>
                  updateClip(clip.id, {
                    adjustments: {
                      ...clip.adjustments,
                      brightness: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label>
              Contrast
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.01}
                value={clip.adjustments.contrast}
                onChange={(e) =>
                  updateClip(clip.id, {
                    adjustments: {
                      ...clip.adjustments,
                      contrast: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label>
              Saturation
              <input
                type="range"
                min={0}
                max={3}
                step={0.01}
                value={clip.adjustments.saturation}
                onChange={(e) =>
                  updateClip(clip.id, {
                    adjustments: {
                      ...clip.adjustments,
                      saturation: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <button
              type="button"
              className="tool-btn compact"
              onClick={() =>
                updateClip(clip.id, {
                  adjustments: { brightness: 0, contrast: 1, saturation: 1 },
                  transform: { scale: 1, panX: 0, panY: 0 },
                })
              }
            >
              Reset adjust / zoom
            </button>

            <h3>Effects</h3>
            <div className="effect-grid">
              {EFFECT_PRESETS.map((p) => (
                <button
                  key={p.kind}
                  type="button"
                  className="tool-btn compact"
                  onClick={() => addEffectToSelected(p.kind as EffectKind)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {clip.effects.length > 0 && (
              <ul className="effect-list">
                {clip.effects.map((fx) => (
                  <li key={fx.id}>
                    <span>
                      {fx.kind} ({fx.amount})
                    </span>
                    <button
                      type="button"
                      className="tool-btn compact"
                      onClick={() => removeEffect(clip.id, fx.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              className="tool-btn danger"
              onClick={() => removeClip(clip.id)}
            >
              Delete clip
            </button>
          </div>
        )}

        {title && (
          <div className="prop-block title-editor">
            <h3>Title / Credits</h3>
            <p className="hint">
              Drag on the T1 track to move · drag orange ends to set duration · edit style below
            </p>

            <label>
              Text
              <textarea
                rows={3}
                value={title.text}
                onChange={(e) => updateTitle(title.id, { text: e.target.value })}
                placeholder="Enter title text…"
              />
            </label>

            <label>
              Style
              <select
                value={title.style}
                onChange={(e) =>
                  updateTitle(title.id, { style: e.target.value as typeof title.style })
                }
              >
                {TITLE_STYLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Placement
              <select
                value={title.mode}
                onChange={(e) =>
                  updateTitle(title.id, { mode: e.target.value as typeof title.mode })
                }
              >
                <option value="overlay">Superimposed over video</option>
                <option value="standalone">Own title card (no video behind)</option>
              </select>
            </label>

            <FontPicker
              value={title.font}
              onChange={(font) => updateTitle(title.id, { font })}
            />

            <label>
              Font size {title.fontSize}
              <input
                type="range"
                min={18}
                max={160}
                value={title.fontSize}
                onChange={(e) => updateTitle(title.id, { fontSize: Number(e.target.value) })}
              />
            </label>

            <div className="inline-fields">
              <label>
                Color
                <input
                  type="color"
                  value={title.color.startsWith("#") ? title.color : "#ffffff"}
                  onChange={(e) => updateTitle(title.id, { color: e.target.value })}
                />
              </label>
              <label>
                Gradient
                <input
                  type="color"
                  value={title.color2.startsWith("#") ? title.color2 : "#f5a623"}
                  onChange={(e) => updateTitle(title.id, { color2: e.target.value })}
                  disabled={!title.useGradient}
                />
              </label>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={title.useGradient}
                onChange={(e) => updateTitle(title.id, { useGradient: e.target.checked })}
              />
              Use gradient fill
            </label>

            <div className="inline-fields">
              <label>
                Stroke
                <input
                  type="color"
                  value={title.strokeColor.startsWith("#") ? title.strokeColor : "#000000"}
                  onChange={(e) => updateTitle(title.id, { strokeColor: e.target.value })}
                />
              </label>
              <label>
                Stroke W
                <input
                  type="number"
                  min={0}
                  max={12}
                  value={title.strokeWidth}
                  onChange={(e) => updateTitle(title.id, { strokeWidth: Number(e.target.value) })}
                />
              </label>
            </div>

            {title.mode === "standalone" && (
              <label>
                Card background
                <input
                  type="color"
                  value={
                    title.backgroundColor.startsWith("#") ? title.backgroundColor : "#000000"
                  }
                  onChange={(e) => updateTitle(title.id, { backgroundColor: e.target.value })}
                />
              </label>
            )}

            <label>
              Align
              <select
                value={title.align}
                onChange={(e) => updateTitle(title.id, { align: e.target.value })}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </label>

            <div className="inline-fields">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={title.bold}
                  onChange={(e) => updateTitle(title.id, { bold: e.target.checked })}
                />
                Bold
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={title.italic}
                  onChange={(e) => updateTitle(title.id, { italic: e.target.checked })}
                />
                Italic
              </label>
            </div>

            <div className="inline-fields">
              <label>
                X
                <input
                  type="number"
                  value={title.x}
                  onChange={(e) => updateTitle(title.id, { x: Number(e.target.value) })}
                />
              </label>
              <label>
                Y
                <input
                  type="number"
                  value={title.y}
                  onChange={(e) => updateTitle(title.id, { y: Number(e.target.value) })}
                />
              </label>
            </div>

            <div
              className={`title-live-preview style-${title.style} mode-${title.mode}`}
              style={{
                background:
                  title.mode === "standalone" ? title.backgroundColor : "rgba(0,0,0,0.35)",
              }}
            >
              <span
                className="title-live-text"
                style={{
                  fontFamily: fontCss(title.font),
                  fontSize: Math.min(42, Math.max(14, title.fontSize * 0.35)),
                  fontWeight: title.bold ? 700 : 500,
                  fontStyle: title.italic ? "italic" : "normal",
                  color: title.color,
                  textAlign: title.align as "left" | "center" | "right",
                  WebkitTextStroke:
                    title.strokeWidth > 0
                      ? `${Math.max(0.5, title.strokeWidth * 0.35)}px ${title.strokeColor}`
                      : undefined,
                  backgroundImage: title.useGradient
                    ? `linear-gradient(90deg, ${title.color}, ${title.color2})`
                    : undefined,
                  WebkitBackgroundClip: title.useGradient ? "text" : undefined,
                  WebkitTextFillColor: title.useGradient ? "transparent" : undefined,
                }}
              >
                {title.text || "Title"}
              </span>
            </div>

            <button
              type="button"
              className="tool-btn danger"
              onClick={() => removeTitle(title.id)}
            >
              Delete title
            </button>
          </div>
        )}

        {transition && (
          <div className="prop-block">
            <h3>Transition</h3>
            <label>
              Kind
              <select
                value={transition.kind}
                onChange={(e) => updateTransition(transition.id, { kind: e.target.value })}
              >
                {TRANSITION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Duration (s)
              <input
                type="number"
                step="0.05"
                min="0.05"
                value={transition.duration}
                onChange={(e) =>
                  updateTransition(transition.id, { duration: Number(e.target.value) })
                }
              />
            </label>
            <button
              type="button"
              className="tool-btn danger"
              onClick={() => removeTransition(transition.id)}
            >
              Delete transition
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
