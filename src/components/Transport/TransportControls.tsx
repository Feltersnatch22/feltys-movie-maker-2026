import { useMemo, useState } from "react";
import {
  PauseRegular,
  PlayRegular,
  NextRegular,
  PreviousRegular,
  ArrowStepInLeftRegular,
  ArrowStepInRightRegular,
  Speaker2Regular,
  SpeakerMuteRegular,
} from "@fluentui/react-icons";
import { formatTimecode } from "../../utils/time";
import { clamp } from "../../utils/time";
import { projectDuration, sourceCapabilities } from "../../utils/ffmpegHelpers";
import { useProjectStore } from "../../state/projectStore";

export type TransportCommand =
  | { type: "togglePlay" }
  | { type: "skip"; seconds: number }
  | { type: "stepFrames"; frames: number; direction: 1 | -1 }
  | { type: "seek"; time: number }
  | { type: "setVolume"; volume: number }
  | { type: "toggleMute" };

type Props = {
  /** When set, controls emit commands instead of touching the local store (pop-out window). */
  onCommand?: (cmd: TransportCommand) => void;
  /** Remote state for pop-out (separate JS context). */
  remote?: {
    playhead: number;
    isPlaying: boolean;
    duration: number;
    fps: number;
    volume?: number;
    muted?: boolean;
  };
  compact?: boolean;
  className?: string;
  showVolume?: boolean;
};

const SKIP_SECONDS = 5;

export function TransportControls({
  onCommand,
  remote,
  compact,
  className,
  showVolume = true,
}: Props) {
  const storePlayhead = useProjectStore((s) => s.playhead);
  const storePlaying = useProjectStore((s) => s.isPlaying);
  const project = useProjectStore((s) => s.project);
  const setPlaying = useProjectStore((s) => s.setPlaying);
  const setPlayheadPosition = useProjectStore((s) => s.setPlayheadPosition);
  const previewVolume = useProjectStore((s) => s.previewVolume);
  const previewMuted = useProjectStore((s) => s.previewMuted);
  const setPreviewVolume = useProjectStore((s) => s.setPreviewVolume);
  const togglePreviewMute = useProjectStore((s) => s.togglePreviewMute);

  const [frameStep, setFrameStep] = useState(1);

  const playhead = remote?.playhead ?? storePlayhead;
  const isPlaying = remote?.isPlaying ?? storePlaying;
  const fps = remote?.fps ?? (sourceCapabilities(project.media).fps || 30);
  const duration = remote?.duration ?? projectDuration(project);
  const volume = remote?.volume ?? previewVolume;
  const muted = remote?.muted ?? previewMuted;

  const frameLabel = useMemo(() => Math.round(playhead * fps), [playhead, fps]);
  const effectiveVol = muted ? 0 : volume;

  function dispatch(cmd: TransportCommand) {
    if (onCommand) {
      onCommand(cmd);
      return;
    }
    applyTransportCommand(cmd, {
      playhead,
      isPlaying,
      duration,
      fps,
      setPlaying,
      setPlayheadPosition,
      setPreviewVolume,
      togglePreviewMute,
    });
  }

  return (
    <div className={`transport-controls ${compact ? "compact" : ""} ${className ?? ""}`}>
      <div className="transport-cluster">
        <button
          type="button"
          className="transport-btn"
          title={`Rewind ${SKIP_SECONDS}s`}
          onClick={() => dispatch({ type: "skip", seconds: -SKIP_SECONDS })}
        >
          <PreviousRegular fontSize={compact ? 16 : 18} />
        </button>
        <button
          type="button"
          className="transport-btn"
          title={`Back ${frameStep} frame${frameStep > 1 ? "s" : ""}`}
          onClick={() => dispatch({ type: "stepFrames", frames: frameStep, direction: -1 })}
        >
          <ArrowStepInLeftRegular fontSize={compact ? 16 : 18} />
        </button>
        <button
          type="button"
          className="transport-btn primary"
          title={isPlaying ? "Pause" : "Play"}
          onClick={() => dispatch({ type: "togglePlay" })}
        >
          {isPlaying ? (
            <PauseRegular fontSize={compact ? 18 : 20} />
          ) : (
            <PlayRegular fontSize={compact ? 18 : 20} />
          )}
        </button>
        <button
          type="button"
          className="transport-btn"
          title={`Forward ${frameStep} frame${frameStep > 1 ? "s" : ""}`}
          onClick={() => dispatch({ type: "stepFrames", frames: frameStep, direction: 1 })}
        >
          <ArrowStepInRightRegular fontSize={compact ? 16 : 18} />
        </button>
        <button
          type="button"
          className="transport-btn"
          title={`Fast forward ${SKIP_SECONDS}s`}
          onClick={() => dispatch({ type: "skip", seconds: SKIP_SECONDS })}
        >
          <NextRegular fontSize={compact ? 16 : 18} />
        </button>
      </div>

      <label className="frame-step" title="Frames to step">
        <span>±</span>
        <select
          value={frameStep}
          onChange={(e) => setFrameStep(Number(e.target.value))}
          aria-label="Frame step size"
        >
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span>fr</span>
      </label>

      {showVolume && (
        <div className="volume-control" title={`Volume ${Math.round(effectiveVol * 100)}%`}>
          <button
            type="button"
            className="transport-btn"
            title={muted || volume <= 0 ? "Unmute" : "Mute"}
            onClick={() => dispatch({ type: "toggleMute" })}
          >
            {muted || volume <= 0 ? (
              <SpeakerMuteRegular fontSize={compact ? 16 : 18} />
            ) : (
              <Speaker2Regular fontSize={compact ? 16 : 18} />
            )}
          </button>
          <input
            type="range"
            className="volume-slider"
            min={0}
            max={100}
            step={1}
            value={Math.round(effectiveVol * 100)}
            aria-label="Preview volume"
            onChange={(e) => dispatch({ type: "setVolume", volume: Number(e.target.value) / 100 })}
          />
          <span className="volume-pct">{Math.round(effectiveVol * 100)}</span>
        </div>
      )}

      <div className="transport-meta">
        <span className="timecode">{formatTimecode(playhead)}</span>
        {!compact && <span className="frame-readout">f {frameLabel}</span>}
      </div>
    </div>
  );
}

export function applyTransportCommand(
  cmd: TransportCommand,
  ctx: {
    playhead: number;
    isPlaying: boolean;
    duration: number;
    fps: number;
    setPlaying: (v: boolean) => void;
    setPlayheadPosition: (t: number) => void;
    setPreviewVolume?: (v: number) => void;
    togglePreviewMute?: () => void;
  }
) {
  switch (cmd.type) {
    case "togglePlay":
      ctx.setPlaying(!ctx.isPlaying);
      break;
    case "skip":
      ctx.setPlayheadPosition(clamp(ctx.playhead + cmd.seconds, 0, ctx.duration));
      break;
    case "stepFrames": {
      ctx.setPlaying(false);
      const delta = (cmd.frames * cmd.direction) / ctx.fps;
      ctx.setPlayheadPosition(clamp(ctx.playhead + delta, 0, ctx.duration));
      break;
    }
    case "seek":
      ctx.setPlayheadPosition(clamp(cmd.time, 0, ctx.duration));
      break;
    case "setVolume":
      ctx.setPreviewVolume?.(cmd.volume);
      break;
    case "toggleMute":
      ctx.togglePreviewMute?.();
      break;
  }
}
