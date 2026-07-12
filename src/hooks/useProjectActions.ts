import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  useProjectStore,
  type MediaItem,
  type Project,
  type RenderSettings,
} from "../state/projectStore";
import {
  resolveExportFps,
  resolveExportSize,
  suggestVideoBitrate,
} from "../utils/ffmpegHelpers";

export function useProjectActions(opts?: {
  onOpenGifMeme?: () => void;
  onShowAbout?: () => void;
  onShowDonations?: () => void;
}) {
  const project = useProjectStore((s) => s.project);
  const projectPath = useProjectStore((s) => s.projectPath);
  const exportPrefs = useProjectStore((s) => s.exportPrefs);
  const loadProject = useProjectStore((s) => s.loadProject);
  const addMedia = useProjectStore((s) => s.addMedia);
  const setProjectPath = useProjectStore((s) => s.setProjectPath);
  const setStatusMessage = useProjectStore((s) => s.setStatusMessage);
  const newProject = useProjectStore((s) => s.newProject);
  const addTitle = useProjectStore((s) => s.addTitle);
  const addTransitionAtPlayhead = useProjectStore((s) => s.addTransitionAtPlayhead);
  const cutSelection = useProjectStore((s) => s.cutSelection);
  const copySelection = useProjectStore((s) => s.copySelection);
  const pasteClipboard = useProjectStore((s) => s.pasteClipboard);
  const deleteSelection = useProjectStore((s) => s.deleteSelection);
  const sliceClipAtPlayhead = useProjectStore((s) => s.sliceClipAtPlayhead);
  const setMarkIn = useProjectStore((s) => s.setMarkIn);
  const setMarkOut = useProjectStore((s) => s.setMarkOut);
  const addMarker = useProjectStore((s) => s.addMarker);
  const clearInOut = useProjectStore((s) => s.clearInOut);
  const trimClipToPlayhead = useProjectStore((s) => s.trimClipToPlayhead);
  const toggleTheme = useProjectStore((s) => s.toggleTheme);
  const setPxPerSec = useProjectStore((s) => s.setPxPerSec);
  const pxPerSec = useProjectStore((s) => s.pxPerSec);

  async function importMedia() {
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
            "gif",
            "mp3",
            "wav",
            "aac",
            "m4a",
            "wma",
          ],
        },
      ],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    for (const path of paths) {
      try {
        const item = await invoke<MediaItem>("add_media", { path });
        addMedia(item);
      } catch (e) {
        setStatusMessage(String(e));
      }
    }
  }

  async function openProject() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Movie Maker Project", extensions: ["wlmp", "json"] }],
    });
    if (!selected || Array.isArray(selected)) return;
    try {
      if (selected.toLowerCase().endsWith(".json")) {
        const loaded = await invoke<Project>("load_project", { path: selected });
        loadProject(loaded, selected);
      } else {
        const loaded = await invoke<Project>("load_wlmp", { path: selected });
        loadProject(loaded, null);
        setStatusMessage(`Imported WLMP: ${loaded.name}`);
      }
    } catch (e) {
      setStatusMessage(String(e));
    }
  }

  async function saveProject(forceSaveAs = false) {
    let path = projectPath;
    if (forceSaveAs || !path || path.toLowerCase().endsWith(".wlmp")) {
      const dest = await save({
        filters: [{ name: "Felty's Movie Maker 2026", extensions: ["json"] }],
        defaultPath: `${project.name || "project"}.json`,
      });
      if (!dest) return;
      path = dest;
    }
    try {
      await invoke("save_project", { path, project });
      setProjectPath(path);
      setStatusMessage(`Saved ${path}`);
    } catch (e) {
      setStatusMessage(String(e));
    }
  }

  async function exportVideo() {
    const dest = await save({
      filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
      defaultPath: `${project.name || "export"}.mp4`,
    });
    if (!dest) return;
    const { width, height } = resolveExportSize(exportPrefs.resolution, project.media);
    const fps = resolveExportFps(exportPrefs.fps, project.media);
    const settings: RenderSettings = {
      outputPath: dest,
      width,
      height,
      fps,
      videoBitrate: suggestVideoBitrate(width, height, fps),
      audioBitrate: "320k",
    };
    setStatusMessage(`Exporting ${width}×${height} @ ${fps}fps…`);
    try {
      await invoke("render_project", { project, settings });
      setStatusMessage(`Exported ${width}×${height} @ ${fps}fps → ${dest}`);
    } catch (e) {
      setStatusMessage(String(e));
    }
  }

  async function quitApp() {
    try {
      await getCurrentWindow().close();
    } catch {
      window.close();
    }
  }

  function showAbout() {
    opts?.onShowAbout?.();
  }

  function showDonations() {
    opts?.onShowDonations?.();
  }

  function showShortcuts() {
    setStatusMessage(
      "Shortcuts: Space play/pause · I/O mark in/out · M mark · S slice · ←/→ scrub · Ctrl+X/C/V"
    );
  }

  function zoomTimeline(factor: number) {
    setPxPerSec(Math.min(240, Math.max(20, Math.round(pxPerSec * factor))));
  }

  return {
    newProject,
    openProject,
    importMedia,
    saveProject,
    exportVideo,
    quitApp,
    cutSelection,
    copySelection,
    pasteClipboard,
    deleteSelection,
    sliceClipAtPlayhead,
    setMarkIn,
    setMarkOut,
    addMarker,
    clearInOut,
    trimClipToPlayhead,
    addTitle,
    addTransitionAtPlayhead,
    toggleTheme,
    zoomTimeline,
    openGifMeme: () => opts?.onOpenGifMeme?.(),
    showAbout,
    showDonations,
    showShortcuts,
  };
}
