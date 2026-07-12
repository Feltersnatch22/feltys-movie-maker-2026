import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  DesktopRegular,
  FullScreenMaximizeRegular,
  FullScreenMinimizeRegular,
  WindowNewRegular,
} from "@fluentui/react-icons";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { emitTo } from "@tauri-apps/api/event";
import { availableMonitors, currentMonitor } from "@tauri-apps/api/window";
import { WebviewWindow, getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useProjectStore, type Clip, type MediaItem, type Title } from "../../state/projectStore";
import { clipDuration, projectDuration, sourceCapabilities } from "../../utils/ffmpegHelpers";
import { fontCss } from "../../utils/fonts";
import {
  clipVisualAt,
  resolveTransitionAtPlayhead,
  transitionLayerStyles,
  type ClipVisual,
} from "../../utils/previewLook";
import {
  applyTransportCommand,
  TransportControls,
  type TransportCommand,
} from "../Transport/TransportControls";

const POPOUT_LABEL = "preview-popout";
const MAIN_LABEL = "main";

type PreviewSyncPayload = {
  frameUrl: string | null;
  playhead: number;
  isPlaying: boolean;
  duration: number;
  fps: number;
  title: string;
  mediaPath: string | null;
  mediaTime: number;
  mediaType: string | null;
  titles: Title[];
  volume: number;
  muted: boolean;
  look: ClipVisual | null;
  underlayPath: string | null;
  underlayTime: number;
  underlayType: string | null;
  underlayLook: ClipVisual | null;
  transitionKind: string | null;
  transitionProgress: number;
  fromLayer: { opacity: number; clipPath?: string; transform?: string } | null;
  toLayer: { opacity: number; clipPath?: string; transform?: string } | null;
  flashColor: string | null;
  flashOpacity: number;
};

/** Send an event to the main window (pop-out → main). */
async function emitToMain(event: string, payload?: unknown) {
  try {
    await emitTo(MAIN_LABEL, event, payload);
  } catch {
    /* main may be unavailable */
  }
}

/** Send preview sync to the pop-out window. */
async function emitToPopout(payload: PreviewSyncPayload) {
  try {
    await emitTo(POPOUT_LABEL, "preview-sync", payload);
  } catch {
    /* pop-out may not exist */
  }
}

type PopoutFeed = {
  frameUrl: string | null;
  mediaPath: string | null;
  mediaTime: number;
  mediaType: string | null;
  titles: Title[];
  look: ClipVisual | null;
  underlayPath: string | null;
  underlayTime: number;
  underlayType: string | null;
  underlayLook: ClipVisual | null;
  transitionKind: string | null;
  transitionProgress: number;
  fromLayer: { opacity: number; clipPath?: string; transform?: string } | null;
  toLayer: { opacity: number; clipPath?: string; transform?: string } | null;
  flashColor: string | null;
  flashOpacity: number;
};

type ActiveClip = {
  clip: Clip;
  media: MediaItem;
  mediaTime: number;
};

function resolveActiveClip(
  playhead: number,
  clips: Clip[],
  media: MediaItem[]
): ActiveClip | null {
  const ranked = [...clips]
    .filter((c) => c.track === "video" || c.track === "overlay")
    .sort((a, b) => {
      const trackRank = (t: string) => (t === "overlay" ? 0 : 1);
      const tr = trackRank(a.track) - trackRank(b.track);
      if (tr !== 0) return tr;
      return a.position - b.position;
    });

  for (const clip of ranked) {
    const dur = clipDuration(clip);
    if (playhead >= clip.position && playhead < clip.position + dur - 1e-4) {
      const item = media.find((m) => m.id === clip.mediaId);
      if (!item) continue;
      const local = (playhead - clip.position) * clip.speed;
      return { clip, media: item, mediaTime: clip.start + local };
    }
  }
  return null;
}

/** When playhead is in a gap, still show the nearest clip for pop-out sync. */
function resolveClipForPreview(
  playhead: number,
  clips: Clip[],
  media: MediaItem[]
): ActiveClip | null {
  const hit = resolveActiveClip(playhead, clips, media);
  if (hit) return hit;

  const visual = clips
    .filter((c) => c.track === "video" || c.track === "overlay")
    .map((clip) => {
      const item = media.find((m) => m.id === clip.mediaId);
      if (!item) return null;
      return { clip, media: item };
    })
    .filter((x): x is { clip: Clip; media: MediaItem } => x != null)
    .sort((a, b) => a.clip.position - b.clip.position);

  if (visual.length === 0) return null;

  let best = visual[0];
  let bestDist = Infinity;
  for (const entry of visual) {
    const end = entry.clip.position + clipDuration(entry.clip);
    let dist = 0;
    if (playhead < entry.clip.position) dist = entry.clip.position - playhead;
    else if (playhead >= end) dist = playhead - end;
    if (dist < bestDist) {
      bestDist = dist;
      best = entry;
    }
  }

  const end = best.clip.position + clipDuration(best.clip);
  const clamped = Math.min(Math.max(playhead, best.clip.position), end - 1e-3);
  const local = (clamped - best.clip.position) * best.clip.speed;
  return {
    clip: best.clip,
    media: best.media,
    mediaTime: best.clip.start + local,
  };
}

function titlesAtPlayhead(playhead: number, titles: Title[]): Title[] {
  return titles.filter((t) => playhead >= t.position && playhead < t.position + t.duration);
}

function nextClipStart(playhead: number, clips: Clip[]): number | null {
  const starts = clips
    .filter((c) => c.track === "video" || c.track === "overlay")
    .map((c) => c.position)
    .filter((p) => p > playhead + 1e-3)
    .sort((a, b) => a - b);
  return starts[0] ?? null;
}

export function Preview({ popoutMode = false }: { popoutMode?: boolean }) {
  const project = useProjectStore((s) => s.project);
  const playhead = useProjectStore((s) => s.playhead);
  const isPlaying = useProjectStore((s) => s.isPlaying);
  const setPlayheadPosition = useProjectStore((s) => s.setPlayheadPosition);
  const setPlaying = useProjectStore((s) => s.setPlaying);
  const setStatusMessage = useProjectStore((s) => s.setStatusMessage);
  const previewVolume = useProjectStore((s) => s.previewVolume);
  const previewMuted = useProjectStore((s) => s.previewMuted);

  const [stillUrl, setStillUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [remote, setRemote] = useState({
    playhead: 0,
    isPlaying: false,
    duration: 10,
    fps: 30,
    volume: 0.85,
    muted: false,
  });
  const [popoutFeed, setPopoutFeed] = useState<PopoutFeed>({
    frameUrl: null,
    mediaPath: null,
    mediaTime: 0,
    mediaType: null,
    titles: [],
    look: null,
    underlayPath: null,
    underlayTime: 0,
    underlayType: null,
    underlayLook: null,
    transitionKind: null,
    transitionProgress: 0,
    fromLayer: null,
    toLayer: null,
    flashColor: null,
    flashOpacity: 0,
  });

  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const underlayVideoRef = useRef<HTMLVideoElement>(null);
  const popoutVideoRef = useRef<HTMLVideoElement>(null);
  const popoutUnderlayRef = useRef<HTMLVideoElement>(null);
  const requestId = useRef(0);
  const lastSrcRef = useRef<string | null>(null);
  const underlaySrcRef = useRef<string | null>(null);
  const popoutSrcRef = useRef<string | null>(null);
  const popoutUnderlaySrcRef = useRef<string | null>(null);
  const seekingRef = useRef(false);
  const underlaySeekingRef = useRef(false);
  const popoutSeekingRef = useRef(false);

  const blend = resolveTransitionAtPlayhead(
    playhead,
    project.clips,
    project.transitions
  );
  const active = (() => {
    if (blend) {
      const preferTo = blend.progress >= 0.5;
      const clip = preferTo ? blend.toClip : blend.fromClip;
      const media = project.media.find((m) => m.id === clip.mediaId);
      if (!media) return resolveActiveClip(playhead, project.clips, project.media);
      return {
        clip,
        media,
        mediaTime: preferTo ? blend.toMediaTime : blend.fromMediaTime,
      };
    }
    return resolveActiveClip(playhead, project.clips, project.media);
  })();

  const underlayActive = (() => {
    if (!blend) return null;
    const clip = blend.toClip;
    const media = project.media.find((m) => m.id === clip.mediaId);
    if (!media) return null;
    return { clip, media, mediaTime: blend.toMediaTime };
  })();

  // During transition, primary layer is always the outgoing clip
  const primaryClip = blend
    ? (() => {
        const media = project.media.find((m) => m.id === blend.fromClip.mediaId);
        return media
          ? { clip: blend.fromClip, media, mediaTime: blend.fromMediaTime }
          : active;
      })()
    : active;

  const activeTitles = titlesAtPlayhead(playhead, project.titles);
  const standaloneTitle = activeTitles.find((t) => t.mode === "standalone");
  const isVideo = primaryClip?.media.type === "video" && !standaloneTitle;
  const isImage = primaryClip?.media.type === "image" && !standaloneTitle;
  const assetUrl =
    primaryClip && !standaloneTitle ? convertFileSrc(primaryClip.media.path) : null;

  const timeInPrimary = primaryClip
    ? Math.max(0, playhead - primaryClip.clip.position)
    : 0;
  const timeInUnderlay = underlayActive
    ? Math.max(0, playhead - underlayActive.clip.position)
    : 0;

  const layerStyles = blend
    ? transitionLayerStyles(blend.transition.kind, blend.progress)
    : null;
  const primaryLook = primaryClip
    ? clipVisualAt(primaryClip.clip, timeInPrimary)
    : null;
  const underlayLook = underlayActive
    ? clipVisualAt(underlayActive.clip, timeInUnderlay)
    : null;

  function buildSyncPayload(url: string | null): PreviewSyncPayload {
    const state = useProjectStore.getState();
    const tr = resolveTransitionAtPlayhead(
      state.playhead,
      state.project.clips,
      state.project.transitions
    );
    const hit = tr
      ? (() => {
          const clip = tr.fromClip;
          const media = state.project.media.find((m) => m.id === clip.mediaId);
          return media
            ? { clip, media, mediaTime: tr.fromMediaTime }
            : resolveClipForPreview(
                state.playhead,
                state.project.clips,
                state.project.media
              );
        })()
      : resolveClipForPreview(state.playhead, state.project.clips, state.project.media);

    const under = tr
      ? (() => {
          const media = state.project.media.find((m) => m.id === tr.toClip.mediaId);
          return media
            ? { clip: tr.toClip, media, mediaTime: tr.toMediaTime }
            : null;
        })()
      : null;

    const layers = tr ? transitionLayerStyles(tr.transition.kind, tr.progress) : null;
    const look = hit
      ? clipVisualAt(hit.clip, Math.max(0, state.playhead - hit.clip.position))
      : null;
    const uLook = under
      ? clipVisualAt(under.clip, Math.max(0, state.playhead - under.clip.position))
      : null;

    const useLiveMedia = Boolean(hit?.media.path);
    return {
      frameUrl: useLiveMedia && hit?.media.type === "video" ? null : url,
      playhead: state.playhead,
      isPlaying: state.isPlaying,
      duration: projectDuration(state.project),
      fps: sourceCapabilities(state.project.media).fps || 30,
      title: "Felty's Preview",
      mediaPath: hit?.media.path ?? null,
      mediaTime: hit?.mediaTime ?? 0,
      mediaType: hit?.media.type ?? null,
      titles: titlesAtPlayhead(state.playhead, state.project.titles),
      volume: state.previewVolume,
      muted: state.previewMuted,
      look,
      underlayPath: under?.media.path ?? null,
      underlayTime: under?.mediaTime ?? 0,
      underlayType: under?.media.type ?? null,
      underlayLook: uLook,
      transitionKind: tr?.transition.kind ?? null,
      transitionProgress: tr?.progress ?? 0,
      fromLayer: layers?.from ?? null,
      toLayer: layers?.to ?? null,
      flashColor: layers?.flashColor ?? null,
      flashOpacity: layers?.flashOpacity ?? 0,
    };
  }

  async function pushPopoutSync(preferredFrame: string | null = stillUrl) {
    const state = useProjectStore.getState();
    const hit = resolveClipForPreview(
      state.playhead,
      state.project.clips,
      state.project.media
    );
    let frameUrl = preferredFrame;
    // Video: path + time is enough. Image / fallback: grab a still if needed.
    if (hit?.media.type === "video") {
      frameUrl = null;
    } else if (hit && !frameUrl) {
      try {
        frameUrl = await invoke<string>("get_frame_data_url", {
          path: hit.media.path,
          time: hit.mediaTime,
          maxWidth: 1920,
        });
        setStillUrl(frameUrl);
      } catch {
        /* popout can still use mediaPath for images */
      }
    }
    await emitToPopout(buildSyncPayload(frameUrl));
  }

  // Apply preview volume to the main video element
  useEffect(() => {
    if (popoutMode) return;
    const video = videoRef.current;
    if (!video) return;
    video.volume = Math.min(1, Math.max(0, previewVolume));
    video.muted = previewMuted || previewVolume <= 0.001;
  }, [previewVolume, previewMuted, popoutMode, primaryClip?.media.path]);

  // Apply volume to the pop-out video element
  useEffect(() => {
    if (!popoutMode) return;
    const video = popoutVideoRef.current;
    if (!video) return;
    video.volume = Math.min(1, Math.max(0, remote.volume));
    video.muted = remote.muted || remote.volume <= 0.001;
  }, [popoutMode, remote.volume, remote.muted, popoutFeed.mediaPath]);

  useEffect(() => {
    if (popoutMode || isPlaying) return;

    if (!primaryClip) {
      setStillUrl(null);
      void emitToPopout(buildSyncPayload(null));
      return;
    }

    // Prefer native decode for video scrub when possible
    if (primaryClip.media.type === "video") {
      const video = videoRef.current;
      if (video && lastSrcRef.current === primaryClip.media.path) {
        const t = Math.max(0, primaryClip.mediaTime);
        if (Math.abs(video.currentTime - t) > 0.04 && !seekingRef.current) {
          seekingRef.current = true;
          video.currentTime = t;
        }
        void emitToPopout(buildSyncPayload(stillUrl));
        return;
      }
    }

    if (primaryClip.media.type === "image") {
      try {
        const url = convertFileSrc(primaryClip.media.path);
        setStillUrl(url);
        void emitToPopout(buildSyncPayload(url));
      } catch {
        setStillUrl(null);
      }
      return;
    }

    // Fallback still extract (audio-only / scrub before video ready)
    const id = ++requestId.current;
    const handle = window.setTimeout(async () => {
      setLoading(true);
      try {
        const dataUrl = await invoke<string>("get_frame_data_url", {
          path: primaryClip.media.path,
          time: primaryClip.mediaTime,
          maxWidth: 1280,
        });
        if (id !== requestId.current) return;
        setStillUrl(dataUrl);
        void emitToPopout(buildSyncPayload(dataUrl));
      } catch (e) {
        if (id === requestId.current) setStatusMessage(`Preview: ${String(e)}`);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 60);

    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    playhead,
    project.clips,
    project.media,
    project.transitions,
    popoutMode,
    isPlaying,
    primaryClip?.media.path,
    primaryClip?.mediaTime,
  ]);

  // Load / swap video source
  useEffect(() => {
    if (popoutMode) return;
    const video = videoRef.current;
    if (!video || !primaryClip || primaryClip.media.type !== "video") {
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      lastSrcRef.current = null;
      return;
    }

    if (lastSrcRef.current !== primaryClip.media.path) {
      lastSrcRef.current = primaryClip.media.path;
      video.src = convertFileSrc(primaryClip.media.path);
      video.load();
      const onLoaded = () => {
        seekingRef.current = true;
        video.currentTime = Math.max(0, primaryClip.mediaTime);
      };
      video.addEventListener("loadeddata", onLoaded, { once: true });
      return () => video.removeEventListener("loadeddata", onLoaded);
    }
  }, [primaryClip?.media.path, primaryClip?.mediaTime, primaryClip?.media.type, popoutMode]);

  // Transition underlay (incoming clip)
  useEffect(() => {
    if (popoutMode) return;
    const video = underlayVideoRef.current;
    if (!video || !underlayActive || underlayActive.media.type !== "video") {
      if (video && !underlayActive) {
        video.pause();
        video.removeAttribute("src");
        video.load();
        underlaySrcRef.current = null;
      }
      return;
    }
    if (underlaySrcRef.current !== underlayActive.media.path) {
      underlaySrcRef.current = underlayActive.media.path;
      video.src = convertFileSrc(underlayActive.media.path);
      video.muted = true;
      video.load();
      const onLoaded = () => {
        underlaySeekingRef.current = true;
        video.currentTime = Math.max(0, underlayActive.mediaTime);
        if (isPlaying) void video.play().catch(() => undefined);
      };
      video.addEventListener("loadeddata", onLoaded, { once: true });
      return () => video.removeEventListener("loadeddata", onLoaded);
    }
    const t = Math.max(0, underlayActive.mediaTime);
    if (Math.abs(video.currentTime - t) > 0.05 && !underlaySeekingRef.current) {
      underlaySeekingRef.current = true;
      video.currentTime = t;
    }
    if (isPlaying && video.paused) void video.play().catch(() => undefined);
    if (!isPlaying) video.pause();
  }, [
    popoutMode,
    underlayActive?.media.path,
    underlayActive?.mediaTime,
    underlayActive?.media.type,
    isPlaying,
  ]);

  // Play / pause the video element and drive the playhead from it
  useEffect(() => {
    if (popoutMode) return;
    const video = videoRef.current;

    if (!isPlaying) {
      video?.pause();
      return;
    }

    let raf = 0;
    let last = performance.now();
    const total = projectDuration(project);

    const tick = (now: number) => {
      const state = useProjectStore.getState();
      if (!state.isPlaying) return;

      const current = state.playhead;
      const tr = resolveTransitionAtPlayhead(
        current,
        state.project.clips,
        state.project.transitions
      );

      // During transitions, drive by wall-clock so both layers stay in sync
      if (tr) {
        const dt = Math.max(1 / 120, (now - last) / 1000);
        last = now;
        setPlayheadPosition(Math.min(total, current + dt));
        const v = videoRef.current;
        const u = underlayVideoRef.current;
        const fromMedia = state.project.media.find((m) => m.id === tr.fromClip.mediaId);
        if (v && fromMedia && lastSrcRef.current === fromMedia.path) {
          if (Math.abs(v.currentTime - tr.fromMediaTime) > 0.08 && !seekingRef.current) {
            seekingRef.current = true;
            v.currentTime = Math.max(0, tr.fromMediaTime);
          }
          if (v.paused) void v.play().catch(() => undefined);
        }
        if (u && underlaySrcRef.current) {
          if (Math.abs(u.currentTime - tr.toMediaTime) > 0.08 && !underlaySeekingRef.current) {
            underlaySeekingRef.current = true;
            u.currentTime = Math.max(0, tr.toMediaTime);
          }
          if (u.paused) void u.play().catch(() => undefined);
        }
        raf = requestAnimationFrame(tick);
        return;
      }

      const hit = resolveActiveClip(current, state.project.clips, state.project.media);

      if (!hit) {
        const jump = nextClipStart(current, state.project.clips);
        if (jump != null) {
          setPlayheadPosition(jump);
        } else {
          const dt = (now - last) / 1000;
          last = now;
          const next = current + dt;
          if (next >= total) {
            setPlayheadPosition(total);
            setPlaying(false);
            return;
          }
          setPlayheadPosition(next);
        }
        raf = requestAnimationFrame(tick);
        return;
      }

      const v = videoRef.current;

      if (hit.media.type === "video" && v) {
        const speed = hit.clip.speed > 0 ? hit.clip.speed : 1;
        if (Math.abs(v.playbackRate - speed) > 0.01) v.playbackRate = speed;

        if (lastSrcRef.current === hit.media.path) {
          const mediaEnd = hit.clip.end - 0.02;
          if (!v.paused && v.currentTime >= mediaEnd) {
            const clipEnd = hit.clip.position + clipDuration(hit.clip);
            const jump = nextClipStart(clipEnd - 1e-3, state.project.clips);
            if (jump != null) setPlayheadPosition(jump);
            else {
              setPlayheadPosition(Math.min(total, clipEnd));
              setPlaying(false);
              v.pause();
              return;
            }
          } else if (!seekingRef.current && !v.paused) {
            const timelineFromVideo =
              hit.clip.position + (v.currentTime - hit.clip.start) / speed;
            if (Number.isFinite(timelineFromVideo)) {
              setPlayheadPosition(Math.max(hit.clip.position, timelineFromVideo));
            }
          }

          if (v.paused) {
            const target = hit.clip.start + (current - hit.clip.position) * speed;
            if (Math.abs(v.currentTime - target) > 0.08) {
              seekingRef.current = true;
              v.currentTime = Math.max(0, target);
            }
            void v.play().catch((err) => {
              setStatusMessage(`Playback: ${String(err)}`);
              setPlaying(false);
            });
          }
        }
        last = now;
      } else {
        const dt = Math.max(1 / 120, (now - last) / 1000);
        last = now;
        const clipEnd = hit.clip.position + clipDuration(hit.clip);
        const next = current + dt;
        if (next >= clipEnd) {
          const jump = nextClipStart(clipEnd - 1e-3, state.project.clips);
          if (jump != null) setPlayheadPosition(jump);
          else {
            setPlayheadPosition(Math.min(total, clipEnd));
            setPlaying(false);
            return;
          }
        } else {
          setPlayheadPosition(next);
        }
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    void emitToPopout(buildSyncPayload(stillUrl));

    return () => {
      cancelAnimationFrame(raf);
      video?.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, popoutMode, project.clips, project.media]);

  useEffect(() => {
    if (popoutMode) return;
    void emitToPopout(buildSyncPayload(stillUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, popoutMode, playhead]);

  // Re-sync look when effects / transitions change
  useEffect(() => {
    if (popoutMode) return;
    void emitToPopout(buildSyncPayload(stillUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.clips, project.transitions, popoutMode]);

  // Main: answer pop-out sync requests
  useEffect(() => {
    if (popoutMode) return;
    const win = getCurrentWebviewWindow();
    let unlisten: (() => void) | undefined;
    void win.listen("preview-request-sync", () => {
      void pushPopoutSync();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popoutMode]);

  useEffect(() => {
    if (!popoutMode) return;
    const win = getCurrentWebviewWindow();
    let unlisten: (() => void) | undefined;
    void win.listen<PreviewSyncPayload>("preview-sync", (event) => {
      const p = event.payload;
      setStillUrl(p.frameUrl);
      setPopoutFeed({
        frameUrl: p.frameUrl ?? null,
        mediaPath: p.mediaPath ?? null,
        mediaTime: p.mediaTime ?? 0,
        mediaType: p.mediaType ?? null,
        titles: p.titles ?? [],
        look: p.look ?? null,
        underlayPath: p.underlayPath ?? null,
        underlayTime: p.underlayTime ?? 0,
        underlayType: p.underlayType ?? null,
        underlayLook: p.underlayLook ?? null,
        transitionKind: p.transitionKind ?? null,
        transitionProgress: p.transitionProgress ?? 0,
        fromLayer: p.fromLayer ?? null,
        toLayer: p.toLayer ?? null,
        flashColor: p.flashColor ?? null,
        flashOpacity: p.flashOpacity ?? 0,
      });
      setRemote({
        playhead: p.playhead,
        isPlaying: p.isPlaying,
        duration: p.duration,
        fps: p.fps || 30,
        volume: p.volume ?? 0.85,
        muted: p.muted ?? false,
      });
    }).then((fn) => {
      unlisten = fn;
      // Ask main for the current frame / media as soon as we're ready
      void emitToMain("preview-request-sync");
    });
    return () => unlisten?.();
  }, [popoutMode]);

  // Pop-out: load / seek / play video from synced media path
  useEffect(() => {
    if (!popoutMode) return;
    const video = popoutVideoRef.current;
    if (!video || !popoutFeed.mediaPath || popoutFeed.mediaType !== "video") {
      if (video && !popoutFeed.mediaPath) {
        video.pause();
        video.removeAttribute("src");
        video.load();
        popoutSrcRef.current = null;
      }
      return;
    }

    const path = popoutFeed.mediaPath;
    if (popoutSrcRef.current !== path) {
      popoutSrcRef.current = path;
      try {
        video.src = convertFileSrc(path);
        video.load();
        const onLoaded = () => {
          popoutSeekingRef.current = true;
          video.currentTime = Math.max(0, popoutFeed.mediaTime);
          if (remote.isPlaying) void video.play().catch(() => undefined);
        };
        video.addEventListener("loadeddata", onLoaded, { once: true });
        return () => video.removeEventListener("loadeddata", onLoaded);
      } catch {
        popoutSrcRef.current = null;
      }
      return;
    }

    if (!remote.isPlaying) {
      video.pause();
      if (Math.abs(video.currentTime - popoutFeed.mediaTime) > 0.05 && !popoutSeekingRef.current) {
        popoutSeekingRef.current = true;
        video.currentTime = Math.max(0, popoutFeed.mediaTime);
      }
    } else if (video.paused) {
      void video.play().catch(() => undefined);
    }
  }, [
    popoutMode,
    popoutFeed.mediaPath,
    popoutFeed.mediaTime,
    popoutFeed.mediaType,
    remote.isPlaying,
  ]);

  // Pop-out transition underlay
  useEffect(() => {
    if (!popoutMode) return;
    const video = popoutUnderlayRef.current;
    if (!video || !popoutFeed.underlayPath || popoutFeed.underlayType !== "video") {
      if (video && !popoutFeed.underlayPath) {
        video.pause();
        video.removeAttribute("src");
        video.load();
        popoutUnderlaySrcRef.current = null;
      }
      return;
    }
    const path = popoutFeed.underlayPath;
    if (popoutUnderlaySrcRef.current !== path) {
      popoutUnderlaySrcRef.current = path;
      try {
        video.src = convertFileSrc(path);
        video.muted = true;
        video.load();
        const onLoaded = () => {
          video.currentTime = Math.max(0, popoutFeed.underlayTime);
          if (remote.isPlaying) void video.play().catch(() => undefined);
        };
        video.addEventListener("loadeddata", onLoaded, { once: true });
        return () => video.removeEventListener("loadeddata", onLoaded);
      } catch {
        popoutUnderlaySrcRef.current = null;
      }
      return;
    }
    if (Math.abs(video.currentTime - popoutFeed.underlayTime) > 0.05) {
      video.currentTime = Math.max(0, popoutFeed.underlayTime);
    }
    if (remote.isPlaying && video.paused) void video.play().catch(() => undefined);
    if (!remote.isPlaying) video.pause();
  }, [
    popoutMode,
    popoutFeed.underlayPath,
    popoutFeed.underlayTime,
    popoutFeed.underlayType,
    remote.isPlaying,
  ]);

  useEffect(() => {
    if (popoutMode) return;
    const win = getCurrentWebviewWindow();
    let unlisten: (() => void) | undefined;
    void win.listen<TransportCommand>("preview-command", (event) => {
      const state = useProjectStore.getState();
      applyTransportCommand(event.payload, {
        playhead: state.playhead,
        isPlaying: state.isPlaying,
        duration: projectDuration(state.project),
        fps: sourceCapabilities(state.project.media).fps || 30,
        setPlaying: state.setPlaying,
        setPlayheadPosition: state.setPlayheadPosition,
        setPreviewVolume: state.setPreviewVolume,
        togglePreviewMute: state.togglePreviewMute,
      });
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [popoutMode]);

  function handlePopoutCommand(cmd: TransportCommand) {
    // Optimistic local UI so buttons feel instant
    setRemote((r) => {
      switch (cmd.type) {
        case "togglePlay":
          return { ...r, isPlaying: !r.isPlaying };
        case "skip":
          return {
            ...r,
            playhead: Math.min(r.duration, Math.max(0, r.playhead + cmd.seconds)),
          };
        case "stepFrames": {
          const delta = (cmd.frames * cmd.direction) / (r.fps || 30);
          return {
            ...r,
            isPlaying: false,
            playhead: Math.min(r.duration, Math.max(0, r.playhead + delta)),
          };
        }
        case "seek":
          return { ...r, playhead: Math.min(r.duration, Math.max(0, cmd.time)) };
        case "setVolume":
          return {
            ...r,
            volume: cmd.volume,
            muted: cmd.volume <= 0.001,
          };
        case "toggleMute":
          return { ...r, muted: !r.muted };
        default:
          return r;
      }
    });
    void emitToMain("preview-command", cmd);
  }

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  async function toggleFullscreen() {
    const el = stageRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await el.requestFullscreen();
      else await document.exitFullscreen();
    } catch (e) {
      setStatusMessage(`Fullscreen: ${String(e)}`);
    }
  }

  async function moveToSecondary(win: WebviewWindow) {
    try {
      const monitors = await availableMonitors();
      if (monitors.length < 2) {
        setStatusMessage("No secondary monitor detected");
        return;
      }
      const current = await currentMonitor();
      const secondary =
        monitors.find((m) => m.name !== current?.name) ?? monitors[1] ?? monitors[0];
      const pos = secondary.position;
      const size = secondary.size;
      const w = Math.min(1280, Math.floor(size.width * 0.5));
      const h = Math.min(720, Math.floor(size.height * 0.5));
      // Use physical coords — LogicalPosition often lands on the primary display
      await win.setSize(new PhysicalSize(w, h));
      await win.setPosition(
        new PhysicalPosition(
          pos.x + Math.floor((size.width - w) / 2),
          pos.y + Math.floor((size.height - h) / 2)
        )
      );
      await win.setFocus();
      setStatusMessage(`Preview moved to ${secondary.name || "secondary display"}`);
    } catch (e) {
      setStatusMessage(`Monitor move: ${String(e)}`);
    }
  }

  async function openPopout(onSecondary = false) {
    try {
      const existing = await WebviewWindow.getByLabel(POPOUT_LABEL);
      if (existing) {
        await existing.setFocus();
        if (onSecondary) await moveToSecondary(existing);
        void pushPopoutSync();
        return;
      }

      const pop = new WebviewWindow(POPOUT_LABEL, {
        title: "Felty's Preview",
        url: "?mode=preview",
        width: 960,
        height: 600,
        minWidth: 420,
        minHeight: 320,
        resizable: true,
        focus: true,
      });

      pop.once("tauri://created", () => {
        setStatusMessage(onSecondary ? "Preview on secondary monitor" : "Preview pop-out opened");
        if (onSecondary) void moveToSecondary(pop);
        // Retry a few times — pop-out listener may not be ready on first emit
        void pushPopoutSync();
        window.setTimeout(() => void pushPopoutSync(), 200);
        window.setTimeout(() => void pushPopoutSync(), 600);
        window.setTimeout(() => void pushPopoutSync(), 1200);
      });
      pop.once("tauri://error", (e) => {
        setStatusMessage(`Pop-out failed: ${JSON.stringify(e)}`);
      });
    } catch (e) {
      setStatusMessage(`Pop-out: ${String(e)}`);
    }
  }

  useEffect(() => {
    if (popoutMode) return;
    const onMenu = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      if (detail === "fullscreen") void toggleFullscreen();
      if (detail === "popout") void openPopout(false);
      if (detail === "secondary") void openPopout(true);
    };
    window.addEventListener("mmm-preview-action", onMenu);
    return () => window.removeEventListener("mmm-preview-action", onMenu);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [popoutMode, stillUrl, playhead]);

  const showVideo = Boolean(isVideo && assetUrl && !popoutMode);
  const showStill = Boolean((isImage || (!showVideo && stillUrl)) && (stillUrl || isImage) && !popoutMode);
  const showUnderlay = Boolean(!popoutMode && underlayActive && layerStyles);
  const toOnTop =
    blend &&
    ["circleopen", "slideleft", "slideright"].includes(
      blend.transition.kind.toLowerCase()
    );
  const underlayIsVideo = underlayActive?.media.type === "video";
  const underlayAssetUrl = underlayActive
    ? (() => {
        try {
          return convertFileSrc(underlayActive.media.path);
        } catch {
          return null;
        }
      })()
    : null;

  const primaryStyle: CSSProperties = {
    filter: primaryLook?.filter,
    transform: [primaryLook?.transform, layerStyles?.from.transform]
      .filter(Boolean)
      .join(" ") || undefined,
    opacity: (primaryLook?.opacity ?? 1) * (layerStyles?.from.opacity ?? 1),
    clipPath: layerStyles?.from.clipPath,
  };
  const underlayStyle: CSSProperties = {
    filter: underlayLook?.filter,
    transform: [underlayLook?.transform, layerStyles?.to.transform]
      .filter(Boolean)
      .join(" ") || undefined,
    opacity: (underlayLook?.opacity ?? 1) * (layerStyles?.to.opacity ?? 1),
    clipPath: layerStyles?.to.clipPath,
  };

  const popoutAssetUrl = popoutFeed.mediaPath
    ? (() => {
        try {
          return convertFileSrc(popoutFeed.mediaPath);
        } catch {
          return null;
        }
      })()
    : null;
  const popoutShowVideo = Boolean(
    popoutMode && popoutFeed.mediaType === "video" && popoutFeed.mediaPath
  );
  const popoutShowStill = Boolean(
    popoutMode &&
      !popoutShowVideo &&
      (popoutFeed.frameUrl || (popoutFeed.mediaType === "image" && popoutAssetUrl))
  );
  const popoutShowUnderlay = Boolean(popoutMode && popoutFeed.underlayPath && popoutFeed.toLayer);
  const popoutTitles = popoutMode ? popoutFeed.titles : activeTitles;
  const popoutStandalone = popoutTitles.find((t) => t.mode === "standalone");

  const popoutPrimaryStyle: CSSProperties = {
    filter: popoutFeed.look?.filter,
    transform: [popoutFeed.look?.transform, popoutFeed.fromLayer?.transform]
      .filter(Boolean)
      .join(" ") || undefined,
    opacity: (popoutFeed.look?.opacity ?? 1) * (popoutFeed.fromLayer?.opacity ?? 1),
    clipPath: popoutFeed.fromLayer?.clipPath,
  };
  const popoutUnderlayStyle: CSSProperties = {
    filter: popoutFeed.underlayLook?.filter,
    transform: [popoutFeed.underlayLook?.transform, popoutFeed.toLayer?.transform]
      .filter(Boolean)
      .join(" ") || undefined,
    opacity: (popoutFeed.underlayLook?.opacity ?? 1) * (popoutFeed.toLayer?.opacity ?? 1),
    clipPath: popoutFeed.toLayer?.clipPath,
  };

  return (
    <section className={`panel preview-panel ${popoutMode ? "preview-popout" : ""}`}>
      <div className="panel-header">
        <h2>{popoutMode ? "Viewer pop-out" : "Viewer"}</h2>
        <div className="preview-actions">
          {loading && !isPlaying && <span className="badge">Updating</span>}
          {(isPlaying || (popoutMode && remote.isPlaying)) && <span className="badge">Playing</span>}
          {!popoutMode && (
            <>
              <button
                type="button"
                className="icon-btn"
                title="Fullscreen preview"
                onClick={() => void toggleFullscreen()}
              >
                {isFullscreen ? (
                  <FullScreenMinimizeRegular fontSize={16} />
                ) : (
                  <FullScreenMaximizeRegular fontSize={16} />
                )}
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Pop-out adjustable viewer"
                onClick={() => void openPopout(false)}
              >
                <WindowNewRegular fontSize={16} />
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Open / move preview to secondary monitor"
                onClick={() => void openPopout(true)}
              >
                <DesktopRegular fontSize={16} />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="preview-stage" ref={stageRef}>
        {(standaloneTitle || popoutStandalone) && (
          <div
            className="title-stage-backdrop"
            style={{
              background:
                (popoutMode ? popoutStandalone : standaloneTitle)?.backgroundColor || "#000",
            }}
          />
        )}

        {/* Transition underlay (incoming) */}
        {!popoutMode && showUnderlay && underlayIsVideo && (
          <video
            ref={underlayVideoRef}
            className="preview-frame preview-video preview-underlay visible"
            playsInline
            preload="auto"
            muted
            style={{ ...underlayStyle, zIndex: toOnTop ? 3 : 1 }}
            onSeeked={() => {
              underlaySeekingRef.current = false;
            }}
          />
        )}
        {!popoutMode && showUnderlay && !underlayIsVideo && underlayAssetUrl && (
          <img
            src={underlayAssetUrl}
            alt=""
            className="preview-frame preview-underlay"
            style={{ ...underlayStyle, zIndex: toOnTop ? 3 : 1 }}
          />
        )}

        {/* Main window video */}
        {!popoutMode && (
          <video
            ref={videoRef}
            className={`preview-frame preview-video ${showVideo ? "visible" : "hidden"}`}
            playsInline
            preload="auto"
            muted={false}
            style={{ ...primaryStyle, zIndex: toOnTop ? 2 : 2 }}
            onSeeked={() => {
              seekingRef.current = false;
            }}
            onError={() => {
              if (primaryClip?.media.type === "video") {
                setStatusMessage("Viewer could not decode this file — try scrubbing for stills");
              }
            }}
          />
        )}

        {/* Pop-out underlay */}
        {popoutMode && popoutShowUnderlay && popoutFeed.underlayType === "video" && (
          <video
            ref={popoutUnderlayRef}
            className="preview-frame preview-video preview-underlay visible"
            playsInline
            preload="auto"
            muted
            style={popoutUnderlayStyle}
          />
        )}
        {popoutMode &&
          popoutShowUnderlay &&
          popoutFeed.underlayType === "image" &&
          popoutFeed.underlayPath && (
            <img
              src={convertFileSrc(popoutFeed.underlayPath)}
              alt=""
              className="preview-frame preview-underlay"
              style={popoutUnderlayStyle}
            />
          )}

        {/* Pop-out video — synced from main */}
        {popoutMode && (
          <video
            ref={popoutVideoRef}
            className={`preview-frame preview-video ${popoutShowVideo ? "visible" : "hidden"}`}
            playsInline
            preload="auto"
            muted={false}
            style={popoutPrimaryStyle}
            onSeeked={() => {
              popoutSeekingRef.current = false;
            }}
          />
        )}

        {showStill && !showVideo && !standaloneTitle && (
          <img
            src={stillUrl || (isImage && assetUrl ? assetUrl : "")}
            alt="Preview frame"
            className="preview-frame"
            style={primaryStyle}
          />
        )}

        {popoutShowStill && !popoutStandalone && (
          <img
            src={popoutFeed.frameUrl || popoutAssetUrl || ""}
            alt="Preview frame"
            className="preview-frame"
            style={popoutPrimaryStyle}
          />
        )}

        {/* Vignette / fade flash overlays */}
        {!popoutMode && primaryLook && primaryLook.overlayOpacity > 0.01 && (
          <div
            className="preview-fx-overlay"
            style={{
              background: `radial-gradient(circle, transparent 40%, ${primaryLook.overlayColor} 100%)`,
              opacity: primaryLook.overlayOpacity,
            }}
          />
        )}
        {!popoutMode && layerStyles?.flashColor && (layerStyles.flashOpacity ?? 0) > 0.01 && (
          <div
            className="preview-fx-overlay"
            style={{
              background: layerStyles.flashColor,
              opacity: layerStyles.flashOpacity,
            }}
          />
        )}
        {popoutMode && popoutFeed.look && popoutFeed.look.overlayOpacity > 0.01 && (
          <div
            className="preview-fx-overlay"
            style={{
              background: `radial-gradient(circle, transparent 40%, ${popoutFeed.look.overlayColor} 100%)`,
              opacity: popoutFeed.look.overlayOpacity,
            }}
          />
        )}
        {popoutMode && popoutFeed.flashColor && popoutFeed.flashOpacity > 0.01 && (
          <div
            className="preview-fx-overlay"
            style={{
              background: popoutFeed.flashColor,
              opacity: popoutFeed.flashOpacity,
            }}
          />
        )}

        {!popoutMode && !showVideo && !showStill && !standaloneTitle && (
          <div className="preview-empty">
            <p>No frame</p>
            <span>Add media to the timeline and press Play</span>
          </div>
        )}

        {popoutMode && !popoutShowVideo && !popoutShowStill && !popoutStandalone && (
          <div className="preview-empty">
            <p>Waiting for preview…</p>
            <span>Scrub or play on the main timeline — this window syncs automatically</span>
          </div>
        )}

        {(popoutMode ? popoutTitles : activeTitles).map((t) => (
          <div
            key={t.id}
            className={`viewer-title style-${t.style} align-${t.align}`}
            style={{
              top: t.style === "lowerThird" ? undefined : `${Math.max(4, t.y / 10)}%`,
              bottom: t.style === "lowerThird" ? "12%" : undefined,
              left: t.align === "left" ? `${Math.max(2, t.x / 20)}%` : undefined,
              right: t.align === "right" ? `${Math.max(2, t.x / 20)}%` : undefined,
            }}
          >
            <span
              className="viewer-title-text"
              style={{
                fontFamily: fontCss(t.font),
                fontSize: `clamp(18px, ${t.fontSize * 0.55}px, 72px)`,
                fontWeight: t.bold ? 700 : 500,
                fontStyle: t.italic ? "italic" : "normal",
                color: t.useGradient ? undefined : t.color,
                WebkitTextStroke:
                  t.strokeWidth > 0 || t.style === "outline" || t.style === "neon"
                    ? `${Math.max(1, t.strokeWidth || 2)}px ${t.strokeColor}`
                    : undefined,
                backgroundImage: t.useGradient
                  ? `linear-gradient(90deg, ${t.color}, ${t.color2})`
                  : undefined,
                WebkitBackgroundClip: t.useGradient ? "text" : undefined,
                WebkitTextFillColor: t.useGradient ? "transparent" : undefined,
                textShadow:
                  t.style === "neon"
                    ? `0 0 8px ${t.color}, 0 0 18px ${t.color2}`
                    : t.style === "cinematic"
                      ? "0 4px 24px rgba(0,0,0,0.75)"
                      : undefined,
              }}
            >
              {t.text}
            </span>
          </div>
        ))}
      </div>
      <TransportControls
        className="preview-transport"
        compact
        remote={popoutMode ? remote : undefined}
        onCommand={popoutMode ? handlePopoutCommand : undefined}
      />
    </section>
  );
}
