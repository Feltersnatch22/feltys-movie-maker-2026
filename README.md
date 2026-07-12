# Felty's Movie Maker 2026

Cross-platform desktop video editor built with **Tauri 2**, **React**, **Rust**, and a bundled **FFmpeg** sidecar. Opens Windows Movie Maker `.wlmp` projects, edits on a timeline, previews frames, and exports H.264/AAC MP4.

## Prerequisites

- Node.js 20+
- Rust (stable) + Visual Studio Build Tools (Windows)
- FFmpeg / ffprobe **sidecar binaries** (see below)

## FFmpeg sidecar setup

Tauri expects platform-named binaries under `src-tauri/binaries/`:

| Platform | Files |
|----------|--------|
| Windows x64 | `ffmpeg-x86_64-pc-windows-msvc.exe`, `ffprobe-x86_64-pc-windows-msvc.exe` |
| macOS Apple Silicon | `ffmpeg-aarch64-apple-darwin`, `ffprobe-aarch64-apple-darwin` |
| macOS Intel | `ffmpeg-x86_64-apple-darwin`, `ffprobe-x86_64-apple-darwin` |
| Linux x64 | `ffmpeg-x86_64-unknown-linux-gnu`, `ffprobe-x86_64-unknown-linux-gnu` |

Download a static FFmpeg build (e.g. from [https://www.gyan.dev/ffmpeg/builds/](https://www.gyan.dev/ffmpeg/builds/) on Windows or [https://evermeet.cx/ffmpeg/](https://evermeet.cx/ffmpeg/) on macOS), then copy/rename `ffmpeg` and `ffprobe` into `src-tauri/binaries/` with the names above.

If sidecars are missing during development, the app falls back to `ffmpeg` / `ffprobe` on your system `PATH`.

## Develop

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

## Features

- Import media (video / audio / image) via ffprobe — reads resolution and frame rate
- Open `.wlmp` (Movie Maker) and native `.json` projects
- Timeline editing: slice, trim, cut/copy/paste, delete, zoom
- Crop, zoom/pan, color adjust, and clip effects
- Titles and transitions
- **GIF / meme maker** — captioned looping GIFs from imported video or timeline clips
- Export up to **4K UHD** and **high frame rates** (24 / 30 / 60 / 120, or match source)
- H.264 High profile with resolution-aware bitrate and levels
- Light / dark Fluent-inspired UI (Outfit + Manrope/Satoshi)
