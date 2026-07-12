import type { Clip, MediaItem, Project, Transition } from "../state/projectStore";

export type ResolutionPreset = "720p" | "1080p" | "1440p" | "4k" | "source";
export type FpsPreset = "24" | "30" | "60" | "120" | "source";

export const RESOLUTION_PRESETS: Record<
  Exclude<ResolutionPreset, "source">,
  { width: number; height: number; label: string }
> = {
  "720p": { width: 1280, height: 720, label: "HD 720p" },
  "1080p": { width: 1920, height: 1080, label: "Full HD 1080p" },
  "1440p": { width: 2560, height: 1440, label: "QHD 1440p" },
  "4k": { width: 3840, height: 2160, label: "4K UHD" },
};

export function validateMediaPath(path: string): boolean {
  if (!path || !path.trim()) return false;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const ok = [
    "mp4",
    "mov",
    "avi",
    "mkv",
    "wmv",
    "webm",
    "mpg",
    "mpeg",
    "jpg",
    "jpeg",
    "png",
    "gif",
    "bmp",
    "webp",
    "mp3",
    "wav",
    "aac",
    "m4a",
    "flac",
    "ogg",
    "wma",
  ];
  return ok.includes(ext);
}

export function clipDuration(clip: Clip): number {
  const speed = clip.speed > 0 ? clip.speed : 1;
  return Math.max(0.1, (clip.end - clip.start) / speed);
}

export function projectDuration(project: Project): number {
  let max = 0;
  for (const c of project.clips) {
    max = Math.max(max, c.position + clipDuration(c));
  }
  for (const t of project.titles) {
    max = Math.max(max, t.position + t.duration);
  }
  return Math.max(max, 10);
}

/** Highest resolution / fps found in project media (supports 4K + high frame rates). */
export function sourceCapabilities(media: MediaItem[]): {
  width: number;
  height: number;
  fps: number;
} {
  let width = 1920;
  let height = 1080;
  let fps = 30;
  for (const m of media) {
    if (m.width && m.height) {
      if (m.width * m.height > width * height) {
        width = m.width;
        height = m.height;
      }
    }
    if (m.fps && m.fps > fps) {
      fps = m.fps;
    }
  }
  width = Math.min(7680, width - (width % 2));
  height = Math.min(4320, height - (height % 2));
  fps = Math.min(240, Math.max(1, Math.round(fps * 1000) / 1000));
  return { width, height, fps };
}

export function resolveExportSize(
  preset: ResolutionPreset,
  media: MediaItem[]
): { width: number; height: number } {
  if (preset === "source") {
    const src = sourceCapabilities(media);
    return { width: src.width, height: src.height };
  }
  const p = RESOLUTION_PRESETS[preset];
  return { width: p.width, height: p.height };
}

export function resolveExportFps(preset: FpsPreset, media: MediaItem[]): number {
  if (preset === "source") {
    return sourceCapabilities(media).fps;
  }
  return Number(preset);
}

/** Bitrate tuned for resolution × frame rate (4K60 / 4K120 friendly). */
export function suggestVideoBitrate(width: number, height: number, fps: number): string {
  const megapixels = (width * height) / 1_000_000;
  const fpsFactor = Math.max(1, fps / 30);
  const mbps = Math.max(4, megapixels * 3.2 * fpsFactor);
  if (mbps >= 100) return `${Math.round(mbps)}M`;
  if (mbps >= 10) return `${mbps.toFixed(0)}M`;
  return `${mbps.toFixed(1)}M`;
}

/** Client-side sketch of the filter graph for debugging / Properties panel. */
export function describeFilterGraph(project: Project): string {
  const video = project.clips.filter((c) => c.track === "video" || c.track === "overlay");
  const lines: string[] = [];
  video.forEach((c, i) => {
    lines.push(`[v${i}] trim ${c.start.toFixed(2)}-${c.end.toFixed(2)} @ ${c.position.toFixed(2)}s`);
  });
  for (const t of project.transitions) {
    lines.push(`xfade ${t.kind} ${t.duration}s (${t.fromClipId} → ${t.toClipId})`);
  }
  for (const title of project.titles) {
    lines.push(`drawtext "${title.text}" @ ${title.position.toFixed(2)}s`);
  }
  return lines.join("\n");
}

export function mediaById(media: MediaItem[], id: string): MediaItem | undefined {
  return media.find((m) => m.id === id);
}

export function transitionForEdge(
  transitions: Transition[],
  fromClipId: string
): Transition | undefined {
  return transitions.find((t) => t.fromClipId === fromClipId);
}
