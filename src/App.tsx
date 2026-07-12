import { useEffect, useRef, useState } from "react";
import { AboutDialog } from "./components/About/AboutDialog";
import { DonationsDialog } from "./components/Donations/DonationsDialog";
import { SplashScreen } from "./components/Splash/SplashScreen";
import { MenuBar } from "./components/MenuBar/MenuBar";
import { Toolbar } from "./components/Toolbar/Toolbar";
import { MediaLibrary } from "./components/MediaLibrary/MediaLibrary";
import { Preview } from "./components/Preview/Preview";
import { PropertiesPanel } from "./components/PropertiesPanel/PropertiesPanel";
import { GifMemeMaker } from "./components/GifMeme/GifMemeMaker";
import { Timeline } from "./components/Timeline/Timeline";
import { useProjectStore } from "./state/projectStore";

function dispatchPreviewAction(action: "fullscreen" | "popout" | "secondary") {
  window.dispatchEvent(new CustomEvent("mmm-preview-action", { detail: action }));
}

function loadLayout(): { left: number; right: number; timeline: number } {
  try {
    const raw = localStorage.getItem("mmm-layout");
    if (!raw) return { left: 280, right: 320, timeline: 380 };
    return { left: 280, right: 320, timeline: 380, ...JSON.parse(raw) };
  } catch {
    return { left: 280, right: 320, timeline: 380 };
  }
}

type InspectorTab = "inspector" | "tools";

export default function App() {
  const theme = useProjectStore((s) => s.theme);
  const statusMessage = useProjectStore((s) => s.statusMessage);
  const selection = useProjectStore((s) => s.selection);
  const [layout, setLayout] = useState(loadLayout);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("inspector");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [donationsOpen, setDonationsOpen] = useState(false);
  const dragging = useRef<"left" | "right" | "timeline" | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (selection?.kind === "title") setInspectorTab("inspector");
  }, [selection]);

  useEffect(() => {
    localStorage.setItem("mmm-layout", JSON.stringify(layout));
  }, [layout]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      if (dragging.current === "left") {
        setLayout((l) => ({ ...l, left: Math.min(420, Math.max(180, e.clientX)) }));
      } else if (dragging.current === "right") {
        const fromRight = window.innerWidth - e.clientX;
        setLayout((l) => ({ ...l, right: Math.min(480, Math.max(240, fromRight)) }));
      } else if (dragging.current === "timeline") {
        const fromBottom = window.innerHeight - e.clientY - 22;
        setLayout((l) => ({ ...l, timeline: Math.min(580, Math.max(200, fromBottom)) }));
      }
    };
    const onUp = () => {
      dragging.current = null;
      document.body.classList.remove("is-resizing");
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  function startResize(which: "left" | "right" | "timeline") {
    dragging.current = which;
    document.body.classList.add("is-resizing");
  }

  return (
    <div
      className="app-shell nle-shell"
      style={
        {
          "--left-w": `${layout.left}px`,
          "--right-w": `${layout.right}px`,
          "--timeline-h": `${layout.timeline}px`,
        } as React.CSSProperties
      }
    >
      <MenuBar
        onOpenGifMeme={() => {
          setInspectorTab("tools");
          requestAnimationFrame(() => {
            document.getElementById("gif-meme-section")?.scrollIntoView({ behavior: "smooth" });
          });
        }}
        onShowAbout={() => setAboutOpen(true)}
        onShowDonations={() => setDonationsOpen(true)}
        onFullscreenPreview={() => dispatchPreviewAction("fullscreen")}
        onPopoutPreview={() => dispatchPreviewAction("popout")}
        onSecondaryPreview={() => dispatchPreviewAction("secondary")}
      />
      <Toolbar
        onFullscreenPreview={() => dispatchPreviewAction("fullscreen")}
        onPopoutPreview={() => dispatchPreviewAction("popout")}
        onSecondaryPreview={() => dispatchPreviewAction("secondary")}
      />
      <main className="workspace">
        <MediaLibrary />
        <div
          className="resize-handle vertical"
          title="Drag to resize media pool"
          onPointerDown={() => startResize("left")}
        />
        <Preview />
        <div
          className="resize-handle vertical"
          title="Drag to resize inspector"
          onPointerDown={() => startResize("right")}
        />
        <aside className="right-panel inspector-panel">
          <div className="inspector-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              className={inspectorTab === "inspector" ? "active" : ""}
              aria-selected={inspectorTab === "inspector"}
              onClick={() => setInspectorTab("inspector")}
            >
              Inspector
            </button>
            <button
              type="button"
              role="tab"
              className={inspectorTab === "tools" ? "active" : ""}
              aria-selected={inspectorTab === "tools"}
              onClick={() => setInspectorTab("tools")}
            >
              Tools
            </button>
          </div>
          <div className="right-stack">
            {inspectorTab === "inspector" ? (
              <section className="right-section" id="edit-section">
                <PropertiesPanel />
              </section>
            ) : (
              <section className="right-section" id="gif-meme-section">
                <h2 className="right-section-title">GIF / Meme</h2>
                <GifMemeMaker />
              </section>
            )}
          </div>
        </aside>
      </main>
      <div
        className="resize-handle horizontal"
        title="Drag to resize timeline"
        onPointerDown={() => startResize("timeline")}
      />
      <Timeline />
      <footer className="status-bar">{statusMessage}</footer>
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <DonationsDialog open={donationsOpen} onClose={() => setDonationsOpen(false)} />
      <SplashScreen />
    </div>
  );
}
