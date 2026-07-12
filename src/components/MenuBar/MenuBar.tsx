import { useEffect, useRef, useState } from "react";
import { useProjectActions } from "../../hooks/useProjectActions";

type MenuItem =
  | { kind: "item"; label: string; shortcut?: string; action: () => void; danger?: boolean }
  | { kind: "sep" };

type MenuDef = {
  id: string;
  label: string;
  items: MenuItem[];
};

type Props = {
  onOpenGifMeme?: () => void;
  onShowAbout?: () => void;
  onShowDonations?: () => void;
  onFullscreenPreview?: () => void;
  onPopoutPreview?: () => void;
  onSecondaryPreview?: () => void;
};

export function MenuBar({
  onOpenGifMeme,
  onShowAbout,
  onShowDonations,
  onFullscreenPreview,
  onPopoutPreview,
  onSecondaryPreview,
}: Props) {
  const actions = useProjectActions({ onOpenGifMeme, onShowAbout, onShowDonations });
  const [openId, setOpenId] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);

  const menus: MenuDef[] = [
    {
      id: "file",
      label: "File",
      items: [
        { kind: "item", label: "New Project", shortcut: "Ctrl+N", action: actions.newProject },
        { kind: "item", label: "Open…", shortcut: "Ctrl+O", action: () => void actions.openProject() },
        { kind: "item", label: "Import Media…", shortcut: "Ctrl+I", action: () => void actions.importMedia() },
        { kind: "sep" },
        { kind: "item", label: "Save", shortcut: "Ctrl+S", action: () => void actions.saveProject() },
        {
          kind: "item",
          label: "Save As…",
          shortcut: "Ctrl+Shift+S",
          action: () => void actions.saveProject(true),
        },
        { kind: "sep" },
        {
          kind: "item",
          label: "Export Video…",
          shortcut: "Ctrl+E",
          action: () => void actions.exportVideo(),
        },
        { kind: "sep" },
        { kind: "item", label: "Quit", shortcut: "Alt+F4", action: () => void actions.quitApp(), danger: true },
      ],
    },
    {
      id: "edit",
      label: "Edit",
      items: [
        { kind: "item", label: "Cut", shortcut: "Ctrl+X", action: actions.cutSelection },
        { kind: "item", label: "Copy", shortcut: "Ctrl+C", action: actions.copySelection },
        { kind: "item", label: "Paste", shortcut: "Ctrl+V", action: actions.pasteClipboard },
        { kind: "item", label: "Delete", shortcut: "Del", action: actions.deleteSelection },
        { kind: "sep" },
        { kind: "item", label: "Slice at Playhead", shortcut: "S", action: actions.sliceClipAtPlayhead },
        { kind: "sep" },
        { kind: "item", label: "Mark In", shortcut: "I", action: actions.setMarkIn },
        { kind: "item", label: "Mark", shortcut: "M", action: actions.addMarker },
        { kind: "item", label: "Mark Out", shortcut: "O", action: actions.setMarkOut },
        { kind: "item", label: "Clear In/Out", action: actions.clearInOut },
        { kind: "sep" },
        {
          kind: "item",
          label: "Trim Start to Playhead",
          shortcut: "[",
          action: () => actions.trimClipToPlayhead("start"),
        },
        {
          kind: "item",
          label: "Trim End to Playhead",
          shortcut: "]",
          action: () => actions.trimClipToPlayhead("end"),
        },
      ],
    },
    {
      id: "view",
      label: "View",
      items: [
        { kind: "item", label: "Toggle Appearance", action: actions.toggleTheme },
        { kind: "sep" },
        { kind: "item", label: "Zoom Timeline In", shortcut: "Ctrl+=", action: () => actions.zoomTimeline(1.2) },
        { kind: "item", label: "Zoom Timeline Out", shortcut: "Ctrl+-", action: () => actions.zoomTimeline(1 / 1.2) },
        { kind: "sep" },
        {
          kind: "item",
          label: "Fullscreen Preview",
          action: () => onFullscreenPreview?.(),
        },
        {
          kind: "item",
          label: "Pop Out Preview",
          action: () => onPopoutPreview?.(),
        },
        {
          kind: "item",
          label: "Preview on Second Display",
          action: () => onSecondaryPreview?.(),
        },
      ],
    },
    {
      id: "tools",
      label: "Tools",
      items: [
        { kind: "item", label: "Add Title", action: () => actions.addTitle() },
        { kind: "item", label: "Add Transition", action: () => actions.addTransitionAtPlayhead() },
        { kind: "sep" },
        { kind: "item", label: "GIF / Meme Maker", action: actions.openGifMeme },
        {
          kind: "item",
          label: "Export Video…",
          action: () => void actions.exportVideo(),
        },
      ],
    },
    {
      id: "help",
      label: "Help",
      items: [
        { kind: "item", label: "Keyboard Shortcuts", action: actions.showShortcuts },
        { kind: "sep" },
        { kind: "item", label: "Donations appreciated…", action: actions.showDonations },
        { kind: "item", label: "About Felty's Movie Maker 2026", action: actions.showAbout },
      ],
    },
  ];

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenId(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <nav className="mac-menubar" ref={rootRef} aria-label="Application menu">
      <div className="mac-menubar-brand" title="Felty's Movie Maker 2026">
        <img src="/applogo.png" alt="" />
      </div>
      {menus.map((menu) => (
        <div
          key={menu.id}
          className={`mac-menu ${openId === menu.id ? "open" : ""}`}
          onMouseEnter={() => {
            if (openId) setOpenId(menu.id);
          }}
        >
          <button
            type="button"
            className="mac-menu-trigger"
            aria-expanded={openId === menu.id}
            aria-haspopup="menu"
            onClick={() => setOpenId((id) => (id === menu.id ? null : menu.id))}
          >
            {menu.label}
          </button>
          {openId === menu.id && (
            <div className="mac-menu-dropdown" role="menu">
              {menu.items.map((item, i) =>
                item.kind === "sep" ? (
                  <div key={`${menu.id}-sep-${i}`} className="mac-menu-sep" role="separator" />
                ) : (
                  <button
                    key={`${menu.id}-${item.label}`}
                    type="button"
                    role="menuitem"
                    className={`mac-menu-item ${item.danger ? "danger" : ""}`}
                    onClick={() => {
                      setOpenId(null);
                      item.action();
                    }}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && <kbd>{item.shortcut}</kbd>}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
