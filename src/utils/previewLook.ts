import type { Adjustments, Clip, Effect, Transition } from "../state/projectStore";
import { clipDuration } from "./ffmpegHelpers";

export type ClipVisual = {
  filter: string;
  transform: string;
  opacity: number;
  /** Extra overlay for vignette / fade-to-color transitions */
  overlayColor: string | null;
  overlayOpacity: number;
};

export type TransitionBlend = {
  transition: Transition;
  /** 0 = fully outgoing, 1 = fully incoming */
  progress: number;
  fromClip: Clip;
  toClip: Clip;
  /** Local media time on the outgoing clip */
  fromMediaTime: number;
  /** Local media time on the incoming clip */
  toMediaTime: number;
};

/** CSS look for a clip at a given time along the clip (0…clipDuration). */
export function clipVisualAt(
  clip: Clip,
  timeInClip: number,
  extras?: { transitionFade?: number }
): ClipVisual {
  const filters: string[] = [];
  const transforms: string[] = [];
  let opacity = clip.opacity;

  const adj: Adjustments = clip.adjustments ?? {
    brightness: 0,
    contrast: 1,
    saturation: 1,
  };

  // CSS filter: brightness(1) is neutral; store uses -1…1 offset
  const b = 1 + adj.brightness;
  filters.push(`brightness(${clamp(b, 0.2, 2.5)})`);
  filters.push(`contrast(${clamp(adj.contrast, 0.2, 3)})`);
  filters.push(`saturate(${clamp(adj.saturation, 0, 3)})`);

  for (const fx of clip.effects ?? []) {
    applyEffect(fx, clip, timeInClip, filters, transforms, (o) => {
      opacity *= o;
    });
  }

  const scale = clip.transform?.scale ?? 1;
  const panX = clip.transform?.panX ?? 0;
  const panY = clip.transform?.panY ?? 0;
  if (Math.abs(scale - 1) > 0.001 || Math.abs(panX) > 0.001 || Math.abs(panY) > 0.001) {
    transforms.push(`translate(${panX * 12}%, ${panY * 12}%) scale(${clamp(scale, 0.1, 8)})`);
  }

  // Optional extra fade from an active transition (outgoing side)
  if (extras?.transitionFade != null) {
    opacity *= extras.transitionFade;
  }

  let overlayColor: string | null = null;
  let overlayOpacity = 0;
  const vignette = (clip.effects ?? []).find((e) => e.kind === "vignette");
  if (vignette) {
    overlayColor = "#000";
    overlayOpacity = clamp(vignette.amount, 0, 1) * 0.55;
  }

  return {
    filter: filters.join(" ") || "none",
    transform: transforms.join(" ") || "none",
    opacity: clamp(opacity, 0, 1),
    overlayColor,
    overlayOpacity,
  };
}

function applyEffect(
  fx: Effect,
  clip: Clip,
  timeInClip: number,
  filters: string[],
  transforms: string[],
  mulOpacity: (o: number) => void
) {
  const amount = fx.amount;
  const dur = clipDuration(clip);
  switch (fx.kind) {
    case "blur":
      filters.push(`blur(${clamp(amount, 0, 20)}px)`);
      break;
    case "sharpen":
      // Approximate sharpen with contrast bump
      filters.push(`contrast(${1 + clamp(amount, 0, 2) * 0.15})`);
      break;
    case "grayscale":
      filters.push(`grayscale(${clamp(amount, 0, 1)})`);
      break;
    case "sepia":
      filters.push(`sepia(${clamp(amount, 0, 1)})`);
      break;
    case "mirror":
      transforms.push("scaleX(-1)");
      break;
    case "fadeIn": {
      const d = clamp(amount, 0.05, dur * 0.5);
      mulOpacity(timeInClip <= 0 ? 0 : clamp(timeInClip / d, 0, 1));
      break;
    }
    case "fadeOut": {
      const d = clamp(amount, 0.05, dur * 0.5);
      const start = Math.max(0, dur - d);
      if (timeInClip >= start) {
        mulOpacity(1 - clamp((timeInClip - start) / d, 0, 1));
      }
      break;
    }
    case "vignette":
      // handled as overlay in clipVisualAt
      break;
    default:
      break;
  }
}

/**
 * If playhead sits in a transition window between two clips, return blend info.
 * Transition straddles the cut: [aEnd - duration, aEnd + duration] mapped to 0…1
 * with the cut at 0.5 — matches typical NLE feel while clips stay abutting.
 */
export function resolveTransitionAtPlayhead(
  playhead: number,
  clips: Clip[],
  transitions: Transition[]
): TransitionBlend | null {
  if (!transitions.length) return null;

  const byId = new Map(clips.map((c) => [c.id, c]));

  for (const tr of transitions) {
    const from = byId.get(tr.fromClipId);
    const to = byId.get(tr.toClipId);
    if (!from || !to) continue;

    const aEnd = from.position + clipDuration(from);
    const td = Math.max(0.05, tr.duration);
    // Center the transition on the cut between from→to
    const cut = (aEnd + to.position) / 2;
    const start = cut - td / 2;
    const end = cut + td / 2;
    if (playhead < start || playhead > end) continue;

    const progress = clamp((playhead - start) / td, 0, 1);
    const fromLocal = Math.min(
      clipDuration(from) - 1e-3,
      Math.max(0, playhead - from.position)
    );
    const toLocal = Math.min(
      clipDuration(to) - 1e-3,
      Math.max(0, playhead - to.position)
    );

    return {
      transition: tr,
      progress,
      fromClip: from,
      toClip: to,
      fromMediaTime: from.start + fromLocal * from.speed,
      toMediaTime: to.start + toLocal * to.speed,
    };
  }
  return null;
}

/** Opacity / clip-path for outgoing (A) and incoming (B) layers. */
export function transitionLayerStyles(
  kind: string,
  progress: number
): {
  from: { opacity: number; clipPath?: string; transform?: string };
  to: { opacity: number; clipPath?: string; transform?: string };
  flashColor?: string;
  flashOpacity?: number;
} {
  const p = clamp(progress, 0, 1);
  const k = kind.toLowerCase();

  if (k === "fade" || k === "dissolve") {
    return {
      from: { opacity: 1 - p },
      to: { opacity: p },
    };
  }
  if (k === "fadeblack") {
    const flash = p < 0.5 ? p * 2 : (1 - p) * 2;
    return {
      from: { opacity: p < 0.5 ? 1 - p * 2 : 0 },
      to: { opacity: p < 0.5 ? 0 : (p - 0.5) * 2 },
      flashColor: "#000",
      flashOpacity: flash,
    };
  }
  if (k === "fadewhite") {
    const flash = p < 0.5 ? p * 2 : (1 - p) * 2;
    return {
      from: { opacity: p < 0.5 ? 1 - p * 2 : 0 },
      to: { opacity: p < 0.5 ? 0 : (p - 0.5) * 2 },
      flashColor: "#fff",
      flashOpacity: flash,
    };
  }
  if (k === "wipeleft") {
    return {
      from: { opacity: 1, clipPath: `inset(0 0 0 ${p * 100}%)` },
      to: { opacity: 1 },
    };
  }
  if (k === "wiperight") {
    return {
      from: { opacity: 1, clipPath: `inset(0 ${p * 100}% 0 0)` },
      to: { opacity: 1 },
    };
  }
  if (k === "wipeup") {
    return {
      from: { opacity: 1, clipPath: `inset(${p * 100}% 0 0 0)` },
      to: { opacity: 1 },
    };
  }
  if (k === "wipedown") {
    return {
      from: { opacity: 1, clipPath: `inset(0 0 ${p * 100}% 0)` },
      to: { opacity: 1 },
    };
  }
  if (k === "slideleft") {
    return {
      from: { opacity: 1, transform: `translateX(${-p * 100}%)` },
      to: { opacity: 1, transform: `translateX(${(1 - p) * 100}%)` },
    };
  }
  if (k === "slideright") {
    return {
      from: { opacity: 1, transform: `translateX(${p * 100}%)` },
      to: { opacity: 1, transform: `translateX(${(p - 1) * 100}%)` },
    };
  }
  if (k === "circleopen") {
    const r = p * 75;
    return {
      from: { opacity: 1 },
      to: {
        opacity: 1,
        clipPath: `circle(${r}% at 50% 50%)`,
      },
    };
  }
  if (k === "circleclose") {
    const r = (1 - p) * 75;
    return {
      from: {
        opacity: 1,
        clipPath: `circle(${r}% at 50% 50%)`,
      },
      to: { opacity: 1 },
    };
  }
  if (k === "pixelize") {
    // Approximate with increasing blur then snap
    return {
      from: { opacity: 1 - p },
      to: { opacity: p },
    };
  }

  // Default: crossfade
  return {
    from: { opacity: 1 - p },
    to: { opacity: p },
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
