import { useEffect, useMemo, useRef } from "react";
import {
  AddRegular,
  CutRegular,
  DeleteRegular,
  FlashRegular,
  SplitVerticalRegular,
  TextFieldRegular,
} from "@fluentui/react-icons";
import { useProjectStore, type TrackKind } from "../../state/projectStore";
import { projectDuration } from "../../utils/ffmpegHelpers";
import {
  TRACK_LABEL_WIDTH,
  clientXToSeconds,
  formatTimecode,
  secondsToPixels,
} from "../../utils/time";
import {
  findTrackLaneAtPoint,
  setMediaDragUiListeners,
} from "../../utils/mediaDrag";
import { Track } from "./Track";
import { TitleItem } from "./TitleItem";

export function Timeline() {
  const project = useProjectStore((s) => s.project);
  const playhead = useProjectStore((s) => s.playhead);
  const pxPerSec = useProjectStore((s) => s.pxPerSec);
  const selection = useProjectStore((s) => s.selection);
  const markInPoint = useProjectStore((s) => s.markInPoint);
  const markOutPoint = useProjectStore((s) => s.markOutPoint);
  const markers = useProjectStore((s) => s.markers);
  const setPlayheadPosition = useProjectStore((s) => s.setPlayheadPosition);
  const setPxPerSec = useProjectStore((s) => s.setPxPerSec);
  const setSelection = useProjectStore((s) => s.setSelection);
  const sliceClipAtPlayhead = useProjectStore((s) => s.sliceClipAtPlayhead);
  const trimClipToPlayhead = useProjectStore((s) => s.trimClipToPlayhead);
  const setMarkIn = useProjectStore((s) => s.setMarkIn);
  const setMarkOut = useProjectStore((s) => s.setMarkOut);
  const addMarker = useProjectStore((s) => s.addMarker);
  const clearInOut = useProjectStore((s) => s.clearInOut);
  const deleteSelection = useProjectStore((s) => s.deleteSelection);
  const cutSelection = useProjectStore((s) => s.cutSelection);
  const copySelection = useProjectStore((s) => s.copySelection);
  const pasteClipboard = useProjectStore((s) => s.pasteClipboard);
  const duplicateSelection = useProjectStore((s) => s.duplicateSelection);
  const addTitle = useProjectStore((s) => s.addTitle);
  const addTransitionAtPlayhead = useProjectStore((s) => s.addTransitionAtPlayhead);
  const addClipFromMedia = useProjectStore((s) => s.addClipFromMedia);
  const setStatusMessage = useProjectStore((s) => s.setStatusMessage);
  const setPlaying = useProjectStore((s) => s.setPlaying);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const titles = project.titles;
  const transitions = project.transitions;

  const scrollRef = useRef<HTMLDivElement>(null);
  const duration = useMemo(() => Math.max(projectDuration(project), 30), [project]);
  const width = TRACK_LABEL_WIDTH + Math.max(secondsToPixels(duration, pxPerSec), 800);

  const ticks = useMemo(() => {
    const step = pxPerSec >= 120 ? 1 : pxPerSec >= 60 ? 2 : 5;
    const out: number[] = [];
    for (let t = 0; t <= duration; t += step) out.push(t);
    return out;
  }, [duration, pxPerSec]);

  const inOutRange =
    markInPoint != null && markOutPoint != null && markOutPoint > markInPoint
      ? { left: markInPoint, width: markOutPoint - markInPoint }
      : null;

  useEffect(() => {
    setMediaDragUiListeners({
      onDrop: (x, y, payload) => {
        const hit = findTrackLaneAtPoint(x, y);
        if (!hit) {
          setStatusMessage("Drop onto a timeline track (Video / Overlay / Audio)");
          return;
        }
        const track: TrackKind =
          payload.track === "audio" ? "audio" : hit.kind === "audio" ? "video" : hit.kind;
        const rect = hit.el.getBoundingClientRect();
        const position = Math.max(0, (x - rect.left) / pxPerSec);
        addClipFromMedia(payload.mediaId, track, position);
        setStatusMessage(`Clip on ${track} @ ${position.toFixed(2)}s`);
        requestAnimationFrame(() => {
          document.querySelector(".timeline")?.scrollIntoView({ block: "nearest" });
          document.querySelector(".clip-item.selected")?.scrollIntoView({
            behavior: "smooth",
            inline: "center",
            block: "nearest",
          });
        });
      },
    });
  }, [addClipFromMedia, pxPerSec, setStatusMessage]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelection();
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        sliceClipAtPlayhead();
      } else if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        setMarkIn();
      } else if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        setMarkOut();
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        addMarker();
      } else if (e.key === "[") {
        e.preventDefault();
        trimClipToPlayhead("start");
      } else if (e.key === "]") {
        e.preventDefault();
        trimClipToPlayhead("end");
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x") {
        e.preventDefault();
        cutSelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        copySelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        pasteClipboard();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelection();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setPxPerSec(pxPerSec + 10);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "-") {
        e.preventDefault();
        setPxPerSec(pxPerSec - 10);
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        addTitle();
      } else if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        setPlaying(!isPlaying);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 1 / 30;
        setPlayheadPosition(Math.max(0, playhead - step));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 1 / 30;
        setPlayheadPosition(playhead + step);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    addMarker,
    addTitle,
    copySelection,
    cutSelection,
    deleteSelection,
    duplicateSelection,
    isPlaying,
    pasteClipboard,
    playhead,
    pxPerSec,
    setMarkIn,
    setMarkOut,
    setPlayheadPosition,
    setPlaying,
    setPxPerSec,
    sliceClipAtPlayhead,
    trimClipToPlayhead,
  ]);

  function scrubTo(clientX: number) {
    const lane = scrollRef.current;
    if (!lane) return;
    setPlayheadPosition(clientXToSeconds(clientX, lane, pxPerSec));
  }

  const clipCount = project.clips.length;
  const timeLeft = (t: number) => TRACK_LABEL_WIDTH + secondsToPixels(t, pxPerSec);

  return (
    <section className="timeline">
      <div className="timeline-toolbar">
        <h2>Timeline {clipCount > 0 ? `(${clipCount})` : ""}</h2>
        <div className="edit-tools">
          <button type="button" className="tool-btn compact" onClick={sliceClipAtPlayhead} title="Slice (S)">
            <SplitVerticalRegular fontSize={16} /> Slice
          </button>
          <button type="button" className="tool-btn compact" onClick={setMarkIn} title="Mark In (I)">
            Mark In
          </button>
          <button type="button" className="tool-btn compact" onClick={addMarker} title="Mark (M)">
            Mark
          </button>
          <button type="button" className="tool-btn compact" onClick={setMarkOut} title="Mark Out (O)">
            Mark Out
          </button>
          <button type="button" className="tool-btn compact" onClick={clearInOut} title="Clear In/Out">
            Clear I/O
          </button>
          <span className="tool-sep" />
          <button type="button" className="tool-btn compact" onClick={cutSelection} title="Cut (Ctrl+X)">
            <CutRegular fontSize={16} /> Cut
          </button>
          <button type="button" className="tool-btn compact" onClick={deleteSelection} title="Delete">
            <DeleteRegular fontSize={16} /> Delete
          </button>
          <span className="tool-sep" />
          <button type="button" className="tool-btn compact" onClick={() => addTitle()} title="Add title (T)">
            <TextFieldRegular fontSize={16} /> Title
          </button>
          <button
            type="button"
            className="tool-btn compact"
            onClick={() => addTransitionAtPlayhead("fade")}
            title="Add transition between clips"
          >
            <FlashRegular fontSize={16} /> Transition
          </button>
          <div className="transition-menu">
            <AddRegular fontSize={14} />
            <select
              aria-label="Transition type"
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                addTransitionAtPlayhead(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="" disabled>
                Fx…
              </option>
              <option value="fade">Fade</option>
              <option value="dissolve">Dissolve</option>
              <option value="wipeleft">Wipe left</option>
              <option value="wiperight">Wipe right</option>
              <option value="slideleft">Slide left</option>
              <option value="fadeblack">Fade black</option>
              <option value="circleopen">Circle open</option>
              <option value="pixelize">Pixelize</option>
            </select>
          </div>
        </div>
        <label className="zoom">
          Zoom
          <input
            type="range"
            min={20}
            max={300}
            value={pxPerSec}
            onChange={(e) => setPxPerSec(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="timeline-scroll" ref={scrollRef}>
        <div
          className="timeline-inner"
          style={{
            width,
            ["--px" as string]: pxPerSec,
            ["--label-w" as string]: `${TRACK_LABEL_WIDTH}px`,
          }}
        >
          <div
            className="ruler"
            onPointerDown={(e) => {
              scrubTo(e.clientX);
              const move = (ev: PointerEvent) => scrubTo(ev.clientX);
              const up = () => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
              };
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
            }}
          >
            <div className="ruler-gutter" />
            <div className="ruler-scale">
              {ticks.map((t) => (
                <span key={t} className="tick" style={{ left: secondsToPixels(t, pxPerSec) }}>
                  {formatTimecode(t)}
                </span>
              ))}
              {inOutRange && (
                <div
                  className="mark-range"
                  style={{
                    left: secondsToPixels(inOutRange.left, pxPerSec),
                    width: secondsToPixels(inOutRange.width, pxPerSec),
                  }}
                />
              )}
              {markInPoint != null && (
                <div className="mark-flag in" style={{ left: secondsToPixels(markInPoint, pxPerSec) }} title="Mark In">
                  I
                </div>
              )}
              {markOutPoint != null && (
                <div
                  className="mark-flag out"
                  style={{ left: secondsToPixels(markOutPoint, pxPerSec) }}
                  title="Mark Out"
                >
                  O
                </div>
              )}
              {markers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="cue-marker"
                  style={{ left: secondsToPixels(m.time, pxPerSec) }}
                  title={`Marker ${m.label} @ ${formatTimecode(m.time)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPlayheadPosition(m.time);
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="tracks" onClick={() => setSelection(null)}>
            <Track kind="video" label="V1" pxPerSec={pxPerSec} />
            <Track kind="overlay" label="V2" pxPerSec={pxPerSec} />
            <Track kind="audio" label="A1" pxPerSec={pxPerSec} />

            <div className="track-row titles-track">
              <div className="track-label">T1</div>
              <div className="track-lane" data-track="titles">
                {titles.length === 0 && (
                  <span className="track-drop-hint">Press T or Title to add text</span>
                )}
                {titles.map((title) => (
                  <TitleItem key={title.id} title={title} pxPerSec={pxPerSec} />
                ))}
              </div>
            </div>

            <div className="track-row transitions-track">
              <div className="track-label">FX</div>
              <div className="track-lane" data-track="fx">
                {transitions.map((tr) => {
                  const from = project.clips.find((c) => c.id === tr.fromClipId);
                  const left = from
                    ? secondsToPixels(from.position + clipDur(from), pxPerSec) -
                      secondsToPixels(tr.duration / 2, pxPerSec)
                    : 0;
                  return (
                    <button
                      key={tr.id}
                      type="button"
                      className={`transition-chip ${
                        selection?.kind === "transition" && selection.id === tr.id
                          ? "selected"
                          : ""
                      }`}
                      style={{
                        left: Math.max(0, left),
                        width: Math.max(16, secondsToPixels(tr.duration, pxPerSec)),
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelection({ kind: "transition", id: tr.id });
                      }}
                      title={tr.kind}
                    >
                      {tr.kind}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="playhead" style={{ left: timeLeft(playhead) }} />
        </div>
      </div>
    </section>
  );
}

function clipDur(clip: { start: number; end: number; speed: number }) {
  const speed = clip.speed > 0 ? clip.speed : 1;
  return Math.max(0.1, (clip.end - clip.start) / speed);
}
