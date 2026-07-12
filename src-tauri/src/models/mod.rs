use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaItem {
    pub id: String,
    pub path: String,
    pub name: String,
    #[serde(rename = "type")]
    pub media_type: MediaType,
    pub duration: f64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    #[serde(default)]
    pub fps: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MediaType {
    Video,
    Audio,
    Image,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TrackKind {
    Video,
    Audio,
    Overlay,
}

/// Normalized crop rectangle (0–1 relative to source frame).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CropRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Default for CropRect {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            w: 1.0,
            h: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transform {
    /// Zoom / scale (>1 zooms in)
    pub scale: f64,
    pub pan_x: f64,
    pub pan_y: f64,
}

impl Default for Transform {
    fn default() -> Self {
        Self {
            scale: 1.0,
            pan_x: 0.0,
            pan_y: 0.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Adjustments {
    pub brightness: f64,
    pub contrast: f64,
    pub saturation: f64,
}

impl Default for Adjustments {
    fn default() -> Self {
        Self {
            brightness: 0.0,
            contrast: 1.0,
            saturation: 1.0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Effect {
    pub id: String,
    /// blur | sharpen | grayscale | sepia | vignette | mirror | fadeIn | fadeOut
    pub kind: String,
    pub amount: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Clip {
    pub id: String,
    pub media_id: String,
    pub start: f64,
    pub end: f64,
    pub position: f64,
    pub track: TrackKind,
    pub speed: f64,
    #[serde(default)]
    pub crop: CropRect,
    #[serde(default)]
    pub transform: Transform,
    #[serde(default)]
    pub adjustments: Adjustments,
    #[serde(default = "default_opacity")]
    pub opacity: f64,
    #[serde(default)]
    pub effects: Vec<Effect>,
}

fn default_opacity() -> f64 {
    1.0
}

impl Default for Clip {
    fn default() -> Self {
        Self {
            id: String::new(),
            media_id: String::new(),
            start: 0.0,
            end: 5.0,
            position: 0.0,
            track: TrackKind::Video,
            speed: 1.0,
            crop: CropRect::default(),
            transform: Transform::default(),
            adjustments: Adjustments::default(),
            opacity: 1.0,
            effects: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transition {
    pub id: String,
    pub from_clip_id: String,
    pub to_clip_id: String,
    pub duration: f64,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Title {
    pub id: String,
    pub text: String,
    pub position: f64,
    pub duration: f64,
    pub font: String,
    pub font_size: u32,
    pub color: String,
    pub x: i32,
    pub y: i32,
    #[serde(default = "default_title_align")]
    pub align: String,
    #[serde(default)]
    pub bold: bool,
    #[serde(default)]
    pub italic: bool,
    #[serde(default = "default_title_style")]
    pub style: String,
    #[serde(default = "default_title_mode")]
    pub mode: String,
    #[serde(default = "default_color2")]
    pub color2: String,
    #[serde(default)]
    pub use_gradient: bool,
    #[serde(default = "default_stroke_color")]
    pub stroke_color: String,
    #[serde(default)]
    pub stroke_width: u32,
    #[serde(default = "default_bg")]
    pub background_color: String,
}

fn default_title_align() -> String {
    "center".into()
}
fn default_title_style() -> String {
    "plain".into()
}
fn default_title_mode() -> String {
    "overlay".into()
}
fn default_color2() -> String {
    "#F5A623".into()
}
fn default_stroke_color() -> String {
    "#000000".into()
}
fn default_bg() -> String {
    "#000000".into()
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub name: String,
    pub media: Vec<MediaItem>,
    pub clips: Vec<Clip>,
    pub transitions: Vec<Transition>,
    pub titles: Vec<Title>,
}

pub type WlmpProject = Project;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderSettings {
    pub output_path: String,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub video_bitrate: String,
    pub audio_bitrate: String,
}

impl Default for RenderSettings {
    fn default() -> Self {
        Self {
            output_path: String::new(),
            width: 3840,
            height: 2160,
            fps: 60.0,
            video_bitrate: "45M".into(),
            audio_bitrate: "320k".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaProbe {
    pub media_type: MediaType,
    pub duration: f64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<f64>,
}

/// Settings for GIF / meme export from a media file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GifExportSettings {
    pub input_path: String,
    pub output_path: String,
    /// Source in-point (seconds)
    pub start: f64,
    /// Source out-point (seconds)
    pub end: f64,
    pub width: u32,
    pub fps: f64,
    pub top_text: String,
    pub bottom_text: String,
    pub font_size: u32,
    #[serde(default = "default_gif_font")]
    pub font: String,
    pub text_color: String,
    pub stroke_color: String,
    pub stroke_width: u32,
    /// Optional normalized crop before scaling
    #[serde(default)]
    pub crop_x: f64,
    #[serde(default)]
    pub crop_y: f64,
    #[serde(default = "default_one")]
    pub crop_w: f64,
    #[serde(default = "default_one")]
    pub crop_h: f64,
    #[serde(default = "default_one")]
    pub speed: f64,
}

fn default_one() -> f64 {
    1.0
}

fn default_gif_font() -> String {
    "impact".into()
}
