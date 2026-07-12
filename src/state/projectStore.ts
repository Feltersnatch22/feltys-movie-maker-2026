import { create } from "zustand";
import { clipDuration } from "../utils/ffmpegHelpers";

export type MediaType = "video" | "audio" | "image";
export type TrackKind = "video" | "audio" | "overlay";

export type MediaItem = {
  id: string;
  path: string;
  name: string;
  type: MediaType;
  duration: number;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
};

export type CropRect = { x: number; y: number; w: number; h: number };
export type Transform = { scale: number; panX: number; panY: number };
export type Adjustments = { brightness: number; contrast: number; saturation: number };
export type EffectKind =
  | "blur"
  | "sharpen"
  | "grayscale"
  | "sepia"
  | "vignette"
  | "mirror"
  | "fadeIn"
  | "fadeOut";

export type Effect = { id: string; kind: EffectKind | string; amount: number };

export type Clip = {
  id: string;
  mediaId: string;
  start: number;
  end: number;
  position: number;
  track: TrackKind;
  speed: number;
  crop: CropRect;
  transform: Transform;
  adjustments: Adjustments;
  opacity: number;
  effects: Effect[];
};

export type Transition = {
  id: string;
  fromClipId: string;
  toClipId: string;
  duration: number;
  kind: string;
};

export type TitleStyle =
  | "plain"
  | "fade"
  | "lowerThird"
  | "glitch"
  | "neon"
  | "outline"
  | "typewriter"
  | "credits"
  | "cinematic";

export type TitleMode = "overlay" | "standalone";

export type Title = {
  id: string;
  text: string;
  position: number;
  duration: number;
  font: string;
  fontSize: number;
  color: string;
  color2: string;
  useGradient: boolean;
  strokeColor: string;
  strokeWidth: number;
  x: number;
  y: number;
  align: string;
  bold: boolean;
  italic: boolean;
  style: TitleStyle;
  mode: TitleMode;
  backgroundColor: string;
};

export function normalizeTitle(t: Partial<Title> & Pick<Title, "id">): Title {
  return {
    id: t.id,
    text: t.text ?? "Title",
    position: t.position ?? 0,
    duration: Math.max(0.2, t.duration ?? 3),
    font: t.font ?? "arial",
    fontSize: t.fontSize ?? 64,
    color: t.color ?? "#FFFFFF",
    color2: t.color2 ?? "#F5A623",
    useGradient: t.useGradient ?? false,
    strokeColor: t.strokeColor ?? "#000000",
    strokeWidth: t.strokeWidth ?? 0,
    x: t.x ?? 120,
    y: t.y ?? 100,
    align: t.align ?? "center",
    bold: t.bold ?? true,
    italic: t.italic ?? false,
    style: t.style ?? "plain",
    mode: t.mode ?? "overlay",
    backgroundColor: t.backgroundColor ?? "#000000",
  };
}

export type Project = {
  name: string;
  media: MediaItem[];
  clips: Clip[];
  transitions: Transition[];
  titles: Title[];
};

export type RenderSettings = {
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  videoBitrate: string;
  audioBitrate: string;
};

export type Selection =
  | { kind: "clip"; id: string }
  | { kind: "title"; id: string }
  | { kind: "transition"; id: string }
  | { kind: "media"; id: string }
  | null;

type Theme = "light" | "dark";

export type ExportPrefs = {
  resolution: "720p" | "1080p" | "1440p" | "4k" | "source";
  fps: "24" | "30" | "60" | "120" | "source";
};

export const EFFECT_PRESETS: { kind: EffectKind; label: string; amount: number }[] = [
  { kind: "blur", label: "Blur", amount: 3 },
  { kind: "sharpen", label: "Sharpen", amount: 1 },
  { kind: "grayscale", label: "B&W", amount: 1 },
  { kind: "sepia", label: "Sepia", amount: 0.8 },
  { kind: "vignette", label: "Vignette", amount: 0.4 },
  { kind: "mirror", label: "Mirror", amount: 1 },
  { kind: "fadeIn", label: "Fade in", amount: 0.5 },
  { kind: "fadeOut", label: "Fade out", amount: 0.5 },
];

export const TRANSITION_KINDS = [
  "fade",
  "dissolve",
  "wipeleft",
  "wiperight",
  "wipeup",
  "wipedown",
  "slideleft",
  "slideright",
  "fadeblack",
  "fadewhite",
  "circleopen",
  "circleclose",
  "pixelize",
] as const;

function defaultCrop(): CropRect {
  return { x: 0, y: 0, w: 1, h: 1 };
}
function defaultTransform(): Transform {
  return { scale: 1, panX: 0, panY: 0 };
}
function defaultAdjustments(): Adjustments {
  return { brightness: 0, contrast: 1, saturation: 1 };
}

export function normalizeClip(c: Partial<Clip> & Pick<Clip, "id" | "mediaId">): Clip {
  return {
    id: c.id,
    mediaId: c.mediaId,
    start: c.start ?? 0,
    end: c.end ?? 5,
    position: c.position ?? 0,
    track: c.track ?? "video",
    speed: c.speed && c.speed > 0 ? c.speed : 1,
    crop: c.crop ?? defaultCrop(),
    transform: c.transform ?? defaultTransform(),
    adjustments: c.adjustments ?? defaultAdjustments(),
    opacity: c.opacity ?? 1,
    effects: c.effects ?? [],
  };
}

type ClipboardPayload =
  | { kind: "clip"; clip: Clip }
  | { kind: "title"; title: Title }
  | null;

export type TimelineMarker = { id: string; time: number; label: string };

type ProjectState = {
  project: Project;
  playhead: number;
  isPlaying: boolean;
  selection: Selection;
  theme: Theme;
  pxPerSec: number;
  projectPath: string | null;
  statusMessage: string;
  exportPrefs: ExportPrefs;
  clipboard: ClipboardPayload;
  markInPoint: number | null;
  markOutPoint: number | null;
  markers: TimelineMarker[];

  loadProject: (project: Project, path?: string | null) => void;
  setProjectName: (name: string) => void;
  updateClip: (id: string, patch: Partial<Clip>) => void;
  moveClip: (id: string, position: number) => void;
  resizeClip: (id: string, edge: "start" | "end", deltaSeconds: number) => void;
  addMedia: (item: MediaItem) => void;
  addClipFromMedia: (mediaId: string, track: TrackKind, position: number) => void;
  removeClip: (id: string) => void;
  sliceClipAtPlayhead: () => void;
  setMarkIn: () => void;
  setMarkOut: () => void;
  addMarker: () => void;
  clearInOut: () => void;
  clearMarkers: () => void;
  goToMarkIn: () => void;
  goToMarkOut: () => void;
  trimClipToPlayhead: (edge: "start" | "end") => void;
  deleteSelection: () => void;
  cutSelection: () => void;
  copySelection: () => void;
  pasteClipboard: () => void;
  duplicateSelection: () => void;
  updateTitle: (id: string, patch: Partial<Title>) => void;
  addTitle: (title?: Partial<Title>) => void;
  removeTitle: (id: string) => void;
  moveTitle: (id: string, position: number) => void;
  resizeTitle: (id: string, edge: "start" | "end", deltaSeconds: number) => void;
  updateTransition: (id: string, patch: Partial<Transition>) => void;
  addTransitionAtPlayhead: (kind?: string) => void;
  removeTransition: (id: string) => void;
  addEffectToSelected: (kind: EffectKind | string, amount?: number) => void;
  removeEffect: (clipId: string, effectId: string) => void;
  setPlayheadPosition: (t: number) => void;
  setPlaying: (playing: boolean) => void;
  setSelection: (selection: Selection) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  previewVolume: number;
  previewMuted: boolean;
  setPreviewVolume: (v: number) => void;
  setPreviewMuted: (muted: boolean) => void;
  togglePreviewMute: () => void;
  setPxPerSec: (n: number) => void;
  setProjectPath: (path: string | null) => void;
  setStatusMessage: (msg: string) => void;
  setExportPrefs: (prefs: Partial<ExportPrefs>) => void;
  newProject: () => void;
};

const emptyProject = (): Project => ({
  name: "Untitled Project",
  media: [],
  clips: [],
  transitions: [],
  titles: [],
});

function uid(): string {
  return crypto.randomUUID();
}

function normalizeIncoming(raw: Project): Project {
  return {
    name: raw.name || "Untitled Project",
    media: (raw.media ?? []).map((m) => ({
      ...m,
      type: (m.type as MediaType) || "video",
      duration: m.duration ?? 5,
      fps: m.fps ?? null,
    })),
    clips: (raw.clips ?? []).map((c) =>
      normalizeClip({
        ...c,
        mediaId: c.mediaId,
        id: c.id,
      })
    ),
    transitions: raw.transitions ?? [],
    titles: (raw.titles ?? []).map((t) =>
      normalizeTitle({
        ...t,
        id: t.id || crypto.randomUUID(),
      })
    ),
  };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: emptyProject(),
  playhead: 0,
  isPlaying: false,
  selection: null,
  theme: (localStorage.getItem("mmm-theme") as Theme) || "dark",
  previewVolume: (() => {
    const raw = Number(localStorage.getItem("mmm-preview-volume"));
    return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0.85;
  })(),
  previewMuted: localStorage.getItem("mmm-preview-muted") === "1",
  pxPerSec: 80,
  projectPath: null,
  statusMessage: "Ready",
  exportPrefs: { resolution: "4k", fps: "60" },
  clipboard: null,
  markInPoint: null,
  markOutPoint: null,
  markers: [],

  loadProject: (project, path = null) =>
    set({
      project: normalizeIncoming(project),
      projectPath: path ?? null,
      playhead: 0,
      isPlaying: false,
      selection: null,
      markInPoint: null,
      markOutPoint: null,
      markers: [],
      statusMessage: `Loaded ${project.name}`,
    }),

  setProjectName: (name) => set((s) => ({ project: { ...s.project, name } })),

  updateClip: (id, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        clips: s.project.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      },
    })),

  moveClip: (id, position) =>
    set((s) => ({
      project: {
        ...s.project,
        clips: s.project.clips.map((c) =>
          c.id === id ? { ...c, position: Math.max(0, position) } : c
        ),
      },
    })),

  resizeClip: (id, edge, deltaSeconds) =>
    set((s) => {
      const mediaById = new Map(s.project.media.map((m) => [m.id, m]));
      return {
        project: {
          ...s.project,
          clips: s.project.clips.map((c) => {
            if (c.id !== id) return c;
            const media = mediaById.get(c.mediaId);
            const mediaDur = Math.max(0.1, media?.duration ?? c.end);
            const speed = c.speed > 0 ? c.speed : 1;
            // Drag delta is in timeline seconds; map to source time via speed
            const mediaDelta = deltaSeconds * speed;
            const minLen = 0.1;

            if (edge === "start") {
              const nextStart = Math.max(0, Math.min(c.end - minLen * speed, c.start + mediaDelta));
              const appliedMedia = nextStart - c.start;
              const appliedTimeline = appliedMedia / speed;
              return {
                ...c,
                start: nextStart,
                position: Math.max(0, c.position + appliedTimeline),
              };
            }

            const nextEnd = Math.max(c.start + minLen * speed, Math.min(mediaDur, c.end + mediaDelta));
            return { ...c, end: nextEnd };
          }),
        },
      };
    }),

  addMedia: (item) =>
    set((s) => ({
      project: { ...s.project, media: [...s.project.media, item] },
      selection: { kind: "media", id: item.id },
      statusMessage: `Imported ${item.name}`,
    })),

  addClipFromMedia: (mediaId, track, position) => {
    const media = get().project.media.find((m) => m.id === mediaId);
    if (!media) return;
    const clip = normalizeClip({
      id: uid(),
      mediaId,
      start: 0,
      end: media.duration || 5,
      position: Math.max(0, position),
      track,
      speed: 1,
    });
    set((s) => ({
      project: { ...s.project, clips: [...s.project.clips, clip] },
      selection: { kind: "clip", id: clip.id },
      statusMessage: `Added ${media.name} to timeline`,
    }));
  },

  removeClip: (id) =>
    set((s) => ({
      project: {
        ...s.project,
        clips: s.project.clips.filter((c) => c.id !== id),
        transitions: s.project.transitions.filter(
          (t) => t.fromClipId !== id && t.toClipId !== id
        ),
      },
      selection: s.selection?.kind === "clip" && s.selection.id === id ? null : s.selection,
      statusMessage: "Clip deleted",
    })),

  sliceClipAtPlayhead: () => {
    const { playhead, selection, project } = get();
    const EPS = 0.001;

    const underPlayhead = project.clips.filter((c) => {
      const dur = clipDuration(c);
      return playhead >= c.position - EPS && playhead <= c.position + dur + EPS;
    });

    const trackRank = (t: TrackKind) => (t === "video" ? 0 : t === "overlay" ? 1 : 2);

    let clip =
      selection?.kind === "clip"
        ? underPlayhead.find((c) => c.id === selection.id)
        : undefined;

    if (!clip) {
      clip = [...underPlayhead].sort((a, b) => trackRank(a.track) - trackRank(b.track))[0];
    }

    if (!clip) {
      set({
        statusMessage: "Nothing to slice — place the playhead inside a clip",
      });
      return;
    }

    const dur = clipDuration(clip);
    const tip = Math.min(Math.max(playhead, clip.position + EPS), clip.position + dur - EPS);
    const local = (tip - clip.position) * clip.speed;
    const cut = clip.start + local;

    if (cut <= clip.start + EPS || cut >= clip.end - EPS) {
      set({ statusMessage: "Playhead must be inside the clip to slice" });
      return;
    }

    const left = normalizeClip({
      ...clip,
      id: clip.id,
      end: cut,
    });
    const right = normalizeClip({
      ...clip,
      id: uid(),
      start: cut,
      position: tip,
      effects: clip.effects.map((e) => ({ ...e, id: uid() })),
    });

    set((s) => ({
      project: {
        ...s.project,
        clips: s.project.clips.flatMap((c) => (c.id === clip!.id ? [left, right] : [c])),
        transitions: s.project.transitions.map((t) =>
          t.fromClipId === clip!.id ? { ...t, fromClipId: right.id } : t
        ),
      },
      selection: { kind: "clip", id: right.id },
      statusMessage: `Sliced at ${tip.toFixed(2)}s`,
    }));
  },

  setMarkIn: () => {
    const { playhead, markOutPoint } = get();
    const nextOut = markOutPoint != null && markOutPoint < playhead ? null : markOutPoint;
    set({
      markInPoint: playhead,
      markOutPoint: nextOut,
      statusMessage: `Mark In ${playhead.toFixed(2)}s`,
    });
  },

  setMarkOut: () => {
    const { playhead, markInPoint } = get();
    const nextIn = markInPoint != null && markInPoint > playhead ? null : markInPoint;
    set({
      markOutPoint: playhead,
      markInPoint: nextIn,
      statusMessage: `Mark Out ${playhead.toFixed(2)}s`,
    });
  },

  addMarker: () => {
    const { playhead, markers } = get();
    const near = markers.find((m) => Math.abs(m.time - playhead) < 0.05);
    if (near) {
      set({
        markers: markers.filter((m) => m.id !== near.id),
        statusMessage: `Removed marker at ${near.time.toFixed(2)}s`,
      });
      return;
    }
    const marker = { id: uid(), time: playhead, label: `${markers.length + 1}` };
    set({
      markers: [...markers, marker].sort((a, b) => a.time - b.time),
      statusMessage: `Marked ${playhead.toFixed(2)}s`,
    });
  },

  clearInOut: () =>
    set({ markInPoint: null, markOutPoint: null, statusMessage: "Cleared In/Out" }),

  clearMarkers: () => set({ markers: [], statusMessage: "Cleared markers" }),

  goToMarkIn: () => {
    const { markInPoint } = get();
    if (markInPoint == null) {
      set({ statusMessage: "No Mark In set" });
      return;
    }
    set({ playhead: markInPoint, isPlaying: false });
  },

  goToMarkOut: () => {
    const { markOutPoint } = get();
    if (markOutPoint == null) {
      set({ statusMessage: "No Mark Out set" });
      return;
    }
    set({ playhead: markOutPoint, isPlaying: false });
  },

  trimClipToPlayhead: (edge) => {
    const { playhead, selection, project } = get();
    const EPS = 0.001;
    const underPlayhead = project.clips.filter((c) => {
      const dur = clipDuration(c);
      return playhead >= c.position - EPS && playhead <= c.position + dur + EPS;
    });
    const clip =
      (selection?.kind === "clip"
        ? underPlayhead.find((c) => c.id === selection.id) ??
          project.clips.find((c) => c.id === selection.id)
        : undefined) ?? underPlayhead[0];

    if (!clip) {
      set({ statusMessage: "Place the playhead on a clip to trim" });
      return;
    }
    const local = clip.start + (playhead - clip.position) * clip.speed;
    if (edge === "start") {
      const start = Math.min(clip.end - 0.1, Math.max(0, local));
      const position = Math.max(0, playhead);
      get().updateClip(clip.id, { start, position });
      set({ statusMessage: "Trimmed start to playhead" });
    } else {
      const end = Math.max(clip.start + 0.1, local);
      get().updateClip(clip.id, { end });
      set({ statusMessage: "Trimmed end to playhead" });
    }
  },

  deleteSelection: () => {
    const { selection } = get();
    if (!selection) return;
    if (selection.kind === "clip") get().removeClip(selection.id);
    else if (selection.kind === "title") get().removeTitle(selection.id);
    else if (selection.kind === "transition") get().removeTransition(selection.id);
  },

  cutSelection: () => {
    get().copySelection();
    get().deleteSelection();
    set({ statusMessage: "Cut to clipboard" });
  },

  copySelection: () => {
    const { selection, project } = get();
    if (selection?.kind === "clip") {
      const clip = project.clips.find((c) => c.id === selection.id);
      if (clip) set({ clipboard: { kind: "clip", clip: { ...clip } }, statusMessage: "Copied clip" });
    } else if (selection?.kind === "title") {
      const title = project.titles.find((t) => t.id === selection.id);
      if (title)
        set({ clipboard: { kind: "title", title: { ...title } }, statusMessage: "Copied title" });
    }
  },

  pasteClipboard: () => {
    const { clipboard, playhead } = get();
    if (!clipboard) {
      set({ statusMessage: "Clipboard empty" });
      return;
    }
    if (clipboard.kind === "clip") {
      const clip = normalizeClip({
        ...clipboard.clip,
        id: uid(),
        position: playhead,
        effects: clipboard.clip.effects.map((e) => ({ ...e, id: uid() })),
      });
      set((s) => ({
        project: { ...s.project, clips: [...s.project.clips, clip] },
        selection: { kind: "clip", id: clip.id },
        statusMessage: "Pasted clip",
      }));
    } else {
      const title = normalizeTitle({
        ...clipboard.title,
        id: uid(),
        position: playhead,
      });
      set((s) => ({
        project: { ...s.project, titles: [...s.project.titles, title] },
        selection: { kind: "title", id: title.id },
        statusMessage: "Pasted title",
      }));
    }
  },

  duplicateSelection: () => {
    const { selection, project } = get();
    if (selection?.kind === "clip") {
      const src = project.clips.find((c) => c.id === selection.id);
      if (!src) return;
      const clip = normalizeClip({
        ...src,
        id: uid(),
        position: src.position + 0.05,
        effects: src.effects.map((e) => ({ ...e, id: uid() })),
      });
      set((s) => ({
        project: { ...s.project, clips: [...s.project.clips, clip] },
        selection: { kind: "clip", id: clip.id },
        statusMessage: "Duplicated clip",
      }));
      return;
    }
    if (selection?.kind === "title") {
      const src = project.titles.find((t) => t.id === selection.id);
      if (!src) return;
      const title = normalizeTitle({
        ...src,
        id: uid(),
        position: src.position + 0.05,
      });
      set((s) => ({
        project: { ...s.project, titles: [...s.project.titles, title] },
        selection: { kind: "title", id: title.id },
        statusMessage: "Duplicated title",
      }));
    }
  },

  updateTitle: (id, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        titles: s.project.titles.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      },
    })),

  moveTitle: (id, position) =>
    set((s) => ({
      project: {
        ...s.project,
        titles: s.project.titles.map((t) =>
          t.id === id ? { ...t, position: Math.max(0, position) } : t
        ),
      },
    })),

  resizeTitle: (id, edge, deltaSeconds) =>
    set((s) => ({
      project: {
        ...s.project,
        titles: s.project.titles.map((t) => {
          if (t.id !== id) return t;
          const minDur = 0.2;
          if (edge === "start") {
            const maxShrink = t.duration - minDur;
            const applied = Math.max(-t.position, Math.min(maxShrink, deltaSeconds));
            return {
              ...t,
              position: t.position + applied,
              duration: t.duration - applied,
            };
          }
          return { ...t, duration: Math.max(minDur, t.duration + deltaSeconds) };
        }),
      },
    })),

  addTitle: (partial) => {
    const title = normalizeTitle({
      id: uid(),
      text: partial?.text ?? "Title",
      position: partial?.position ?? get().playhead,
      duration: partial?.duration ?? 3,
      font: partial?.font ?? "arial",
      fontSize: partial?.fontSize ?? 64,
      color: partial?.color ?? "#FFFFFF",
      color2: partial?.color2,
      useGradient: partial?.useGradient,
      strokeColor: partial?.strokeColor,
      strokeWidth: partial?.strokeWidth,
      x: partial?.x ?? 80,
      y: partial?.y ?? 120,
      align: partial?.align ?? "center",
      bold: partial?.bold ?? true,
      italic: partial?.italic,
      style: partial?.style ?? "cinematic",
      mode: partial?.mode ?? "overlay",
      backgroundColor: partial?.backgroundColor,
    });
    set((s) => ({
      project: { ...s.project, titles: [...s.project.titles, title] },
      selection: { kind: "title", id: title.id },
      statusMessage: "Title added — edit style in the Inspector",
    }));
  },

  removeTitle: (id) =>
    set((s) => ({
      project: { ...s.project, titles: s.project.titles.filter((t) => t.id !== id) },
      selection: s.selection?.kind === "title" && s.selection.id === id ? null : s.selection,
      statusMessage: "Title deleted",
    })),

  updateTransition: (id, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        transitions: s.project.transitions.map((t) =>
          t.id === id ? { ...t, ...patch } : t
        ),
      },
    })),

  addTransitionAtPlayhead: (kind = "fade") => {
    const { project, playhead } = get();
    const video = [...project.clips]
      .filter((c) => c.track === "video")
      .sort((a, b) => a.position - b.position);

    if (video.length < 2) {
      set({ statusMessage: "Need at least two V1 clips to add a transition" });
      return;
    }

    // Pick consecutive pair whose cut is nearest the playhead
    let bestI = 0;
    let bestDist = Infinity;
    for (let i = 0; i < video.length - 1; i++) {
      const aEnd = video[i].position + clipDuration(video[i]);
      const cut = (aEnd + video[i + 1].position) / 2;
      const dist = Math.abs(playhead - cut);
      if (dist < bestDist) {
        bestDist = dist;
        bestI = i;
      }
    }
    const from = video[bestI];
    const to = video[bestI + 1];

    const existing = project.transitions.find(
      (t) => t.fromClipId === from.id && t.toClipId === to.id
    );
    if (existing) {
      get().updateTransition(existing.id, { kind, duration: existing.duration || 0.5 });
      set({
        selection: { kind: "transition", id: existing.id },
        statusMessage: `Updated transition → ${kind}`,
      });
      return;
    }
    const tr: Transition = {
      id: uid(),
      fromClipId: from.id,
      toClipId: to.id,
      duration: 0.5,
      kind,
    };
    set((s) => ({
      project: { ...s.project, transitions: [...s.project.transitions, tr] },
      selection: { kind: "transition", id: tr.id },
      statusMessage: `Added ${kind} transition (${from.id.slice(0, 4)}→${to.id.slice(0, 4)})`,
    }));
  },

  removeTransition: (id) =>
    set((s) => ({
      project: {
        ...s.project,
        transitions: s.project.transitions.filter((t) => t.id !== id),
      },
      selection:
        s.selection?.kind === "transition" && s.selection.id === id ? null : s.selection,
      statusMessage: "Transition deleted",
    })),

  addEffectToSelected: (kind, amount) => {
    const { selection, project } = get();
    if (selection?.kind !== "clip") {
      set({ statusMessage: "Select a clip to add an effect" });
      return;
    }
    const preset = EFFECT_PRESETS.find((p) => p.kind === kind);
    const effect: Effect = {
      id: uid(),
      kind,
      amount: amount ?? preset?.amount ?? 1,
    };
    const clip = project.clips.find((c) => c.id === selection.id);
    if (!clip) return;
    get().updateClip(clip.id, { effects: [...clip.effects, effect] });
    set({ statusMessage: `Added ${kind} effect` });
  },

  removeEffect: (clipId, effectId) =>
    set((s) => ({
      project: {
        ...s.project,
        clips: s.project.clips.map((c) =>
          c.id === clipId
            ? { ...c, effects: c.effects.filter((e) => e.id !== effectId) }
            : c
        ),
      },
    })),

  setPlayheadPosition: (t) => set({ playhead: Math.max(0, t) }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setSelection: (selection) => set({ selection }),
  setTheme: (theme) => {
    localStorage.setItem("mmm-theme", theme);
    document.documentElement.dataset.theme = theme;
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === "light" ? "dark" : "light";
    get().setTheme(next);
  },
  setPreviewVolume: (v) => {
    const volume = Math.min(1, Math.max(0, v));
    localStorage.setItem("mmm-preview-volume", String(volume));
    set({
      previewVolume: volume,
      previewMuted: volume <= 0.001 ? true : false,
    });
    if (volume > 0.001) localStorage.setItem("mmm-preview-muted", "0");
  },
  setPreviewMuted: (muted) => {
    localStorage.setItem("mmm-preview-muted", muted ? "1" : "0");
    set({ previewMuted: muted });
  },
  togglePreviewMute: () => {
    const next = !get().previewMuted;
    localStorage.setItem("mmm-preview-muted", next ? "1" : "0");
    set({ previewMuted: next });
  },
  setPxPerSec: (n) => set({ pxPerSec: Math.min(400, Math.max(20, n)) }),
  setProjectPath: (path) => set({ projectPath: path }),
  setStatusMessage: (msg) => set({ statusMessage: msg }),
  setExportPrefs: (prefs) =>
    set((s) => ({ exportPrefs: { ...s.exportPrefs, ...prefs } })),
  newProject: () =>
    set({
      project: emptyProject(),
      playhead: 0,
      isPlaying: false,
      selection: null,
      projectPath: null,
      clipboard: null,
      markInPoint: null,
      markOutPoint: null,
      markers: [],
      statusMessage: "New project",
    }),
}));
