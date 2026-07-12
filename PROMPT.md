You are to generate a complete, production‑ready cross‑platform desktop application built with Tauri + React + Rust + FFmpeg. The application is a modern replacement for Windows Movie Maker, capable of loading WLMP project files, displaying a timeline editor, previewing frames, and exporting final videos.

Your output must include:

1. Project Structure
Generate a full folder structure for a Tauri + React project:

Code
modern-movie-maker/
  src-tauri/
    src/
      main.rs
      commands/
        wlmp.rs
        ffmpeg.rs
        project.rs
    tauri.conf.json

  src/
    components/
      Timeline/
        Timeline.tsx
        Track.tsx
        ClipItem.tsx
      Preview/
        Preview.tsx
      MediaLibrary/
        MediaLibrary.tsx
      PropertiesPanel/
        PropertiesPanel.tsx
      Toolbar/
        Toolbar.tsx

    state/
      projectStore.ts

    utils/
      time.ts
      ffmpegHelpers.ts

    App.tsx
    index.tsx
Provide all files with complete, working code.

2. WLMP Parsing (Rust)
Implement:

WLMP XML parsing using quick-xml or serde-xml-rs

Rust structs for:

Project

MediaItem

Clip

Transition

Title

A Tauri command:

rust
#[tauri::command]
fn load_wlmp(path: String) -> Result<WlmpProject, String>
Return JSON to React.

3. React Project State
Implement a global project store using Zustand or Redux:

ts
type MediaItem = { id: string; path: string; type: 'video'|'audio'|'image' };
type Clip = { id: string; mediaId: string; start: number; end: number; position: number; track: 'video'|'audio'|'overlay' };
type Transition = { ... };
type Title = { ... };

type Project = {
  media: MediaItem[];
  clips: Clip[];
  transitions: Transition[];
  titles: Title[];
};
Include actions for:

loadProject

updateClip

moveClip

resizeClip

addMedia

setPlayheadPosition

4. Timeline UI (React)
Generate complete React components:

Timeline.tsx
Renders tracks

Renders clips

Shows playhead

Track.tsx
Represents a single track (video/audio/overlay)

ClipItem.tsx
Draggable

Resizable

Selectable

Updates projectStore

Use absolute positioning and time→pixel conversion.

5. Preview System (React + Rust + FFmpeg)
Implement:

Rust command:
rust
#[tauri::command]
fn get_frame_at(path: String, time: f32) -> Result<Vec<u8>, String>
Use FFmpeg to extract a PNG frame.

React Preview.tsx
Calls get_frame_at

Displays frame in <img>

Updates when playhead moves

6. Export System (Rust + FFmpeg)
Implement:

rust
#[tauri::command]
fn render_project(project: WlmpProject, settings: RenderSettings) -> Result<(), String>
Build an FFmpeg filter graph:

Concatenate clips

Apply transitions (xfade)

Overlay titles (drawtext)

Mix audio

Export MP4 (H.264 + AAC)

Provide complete Rust code.

7. Modern UI/UX (React)
Implement:

Fluent-style icons

Light/dark theme

Segoe UI / system fonts

Smooth transitions

Toolbar with:

Import

Export

Play/Pause

Save Project

8. Media Library (React)
Implement:

Import button

List of media items

Click to select

Drag into timeline

9. Properties Panel (React)
Implement:

Clip properties (start, end, speed)

Title properties (text, font, color)

Transition properties

10. Utilities
Implement:

time.ts
seconds↔pixels conversion

formatting

ffmpegHelpers.ts
build filter graphs

validate media

11. Final Output Requirements
Your output must include:

Every file listed above

Complete code for each file

No placeholders

No pseudocode

Fully working Rust + React + Tauri code

FFmpeg commands fully implemented

Timeline drag/resize logic fully implemented

WLMP parsing fully implemented

Export pipeline fully implemented

This must be a complete, soup‑to‑nuts application.