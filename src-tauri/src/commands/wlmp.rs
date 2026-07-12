use crate::models::{
    Clip, MediaItem, MediaType, Project, Title, TrackKind, Transition, WlmpProject,
};
use quick_xml::events::Event;
use quick_xml::Reader;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use uuid::Uuid;

/// Load a Windows Movie Maker / Live Movie Maker `.wlmp` project and map it
/// into our internal Project JSON shape.
#[tauri::command]
pub fn load_wlmp(path: String) -> Result<WlmpProject, String> {
    let contents = fs::read_to_string(&path).map_err(|e| format!("Failed to read WLMP: {e}"))?;
    parse_wlmp(&contents, &path)
}

pub fn parse_wlmp(xml: &str, source_path: &str) -> Result<Project, String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut media: Vec<MediaItem> = Vec::new();
    let mut clips: Vec<Clip> = Vec::new();
    let mut transitions: Vec<Transition> = Vec::new();
    let mut titles: Vec<Title> = Vec::new();

    // id (from file) -> our media id
    let mut media_id_map: HashMap<String, String> = HashMap::new();
    // extent/clip id -> our clip id
    let mut clip_id_map: HashMap<String, String> = HashMap::new();
    // ordered video clip ids for inventing transitions between neighbors
    let mut video_clip_order: Vec<String> = Vec::new();

    let project_name = Path::new(source_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Imported Project")
        .to_string();

    let mut buf = Vec::new();
    let mut in_media_item = false;
    let mut in_video_clip = false;
    let mut in_audio_clip = false;
    let mut in_title = false;
    let mut in_transition = false;

    let mut current_attrs: HashMap<String, String> = HashMap::new();
    let mut text_buf = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = local_name(&e.name().as_ref());
                let attrs = collect_attrs(&e);
                match name.as_str() {
                    "MediaItem" | "mediaItem" | "Media" => {
                        in_media_item = true;
                        current_attrs = attrs;
                    }
                    "VideoClip" | "videoClip" | "Extent" | "VideoExtent" => {
                        in_video_clip = true;
                        current_attrs = attrs;
                    }
                    "AudioClip" | "audioClip" | "AudioExtent" => {
                        in_audio_clip = true;
                        current_attrs = attrs;
                    }
                    "Title" | "title" | "TitleClip" | "TextOverlay" => {
                        in_title = true;
                        current_attrs = attrs;
                        text_buf.clear();
                    }
                    "Transition" | "transition" => {
                        in_transition = true;
                        current_attrs = attrs;
                    }
                    "Text" | "Caption" if in_title => {
                        text_buf.clear();
                    }
                    _ => {
                        // Merge useful nested attrs
                        for (k, v) in attrs {
                            current_attrs.entry(k).or_insert(v);
                        }
                    }
                }
            }
            Ok(Event::Empty(e)) => {
                let name = local_name(&e.name().as_ref());
                let attrs = collect_attrs(&e);
                match name.as_str() {
                    "MediaItem" | "mediaItem" | "Media" => {
                        if let Some(item) = media_from_attrs(&attrs, source_path) {
                            media_id_map.insert(
                                attrs
                                    .get("id")
                                    .cloned()
                                    .unwrap_or_else(|| item.id.clone()),
                                item.id.clone(),
                            );
                            media.push(item);
                        }
                    }
                    "VideoClip" | "videoClip" | "Extent" | "VideoExtent" => {
                        if let Some(clip) =
                            clip_from_attrs(&attrs, &media_id_map, TrackKind::Video)
                        {
                            let raw_id = attrs.get("id").cloned().unwrap_or_else(|| clip.id.clone());
                            clip_id_map.insert(raw_id, clip.id.clone());
                            video_clip_order.push(clip.id.clone());
                            clips.push(clip);
                        }
                    }
                    "AudioClip" | "audioClip" | "AudioExtent" => {
                        if let Some(clip) =
                            clip_from_attrs(&attrs, &media_id_map, TrackKind::Audio)
                        {
                            let raw_id = attrs.get("id").cloned().unwrap_or_else(|| clip.id.clone());
                            clip_id_map.insert(raw_id, clip.id.clone());
                            clips.push(clip);
                        }
                    }
                    "Transition" | "transition" => {
                        if let Some(t) = transition_from_attrs(&attrs, &clip_id_map) {
                            transitions.push(t);
                        }
                    }
                    "Title" | "title" | "TitleClip" | "TextOverlay" => {
                        titles.push(title_from_attrs(&attrs, ""));
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(t)) => {
                if in_title {
                    if let Ok(s) = t.unescape() {
                        text_buf.push_str(&s);
                    }
                }
            }
            Ok(Event::End(e)) => {
                let name = local_name(&e.name().as_ref());
                match name.as_str() {
                    "MediaItem" | "mediaItem" | "Media" if in_media_item => {
                        if let Some(item) = media_from_attrs(&current_attrs, source_path) {
                            media_id_map.insert(
                                current_attrs
                                    .get("id")
                                    .cloned()
                                    .unwrap_or_else(|| item.id.clone()),
                                item.id.clone(),
                            );
                            media.push(item);
                        }
                        in_media_item = false;
                        current_attrs.clear();
                    }
                    "VideoClip" | "videoClip" | "Extent" | "VideoExtent" if in_video_clip => {
                        if let Some(clip) =
                            clip_from_attrs(&current_attrs, &media_id_map, TrackKind::Video)
                        {
                            let raw_id = current_attrs
                                .get("id")
                                .cloned()
                                .unwrap_or_else(|| clip.id.clone());
                            clip_id_map.insert(raw_id, clip.id.clone());
                            video_clip_order.push(clip.id.clone());
                            clips.push(clip);
                        }
                        in_video_clip = false;
                        current_attrs.clear();
                    }
                    "AudioClip" | "audioClip" | "AudioExtent" if in_audio_clip => {
                        if let Some(clip) =
                            clip_from_attrs(&current_attrs, &media_id_map, TrackKind::Audio)
                        {
                            let raw_id = current_attrs
                                .get("id")
                                .cloned()
                                .unwrap_or_else(|| clip.id.clone());
                            clip_id_map.insert(raw_id, clip.id.clone());
                            clips.push(clip);
                        }
                        in_audio_clip = false;
                        current_attrs.clear();
                    }
                    "Title" | "title" | "TitleClip" | "TextOverlay" if in_title => {
                        titles.push(title_from_attrs(&current_attrs, &text_buf));
                        in_title = false;
                        current_attrs.clear();
                        text_buf.clear();
                    }
                    "Transition" | "transition" if in_transition => {
                        if let Some(t) = transition_from_attrs(&current_attrs, &clip_id_map) {
                            transitions.push(t);
                        }
                        in_transition = false;
                        current_attrs.clear();
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(format!("XML parse error: {e}")),
            _ => {}
        }
        buf.clear();
    }

    // If no explicit transitions, create fade between consecutive video clips that abut.
    if transitions.is_empty() && video_clip_order.len() > 1 {
        for window in video_clip_order.windows(2) {
            transitions.push(Transition {
                id: Uuid::new_v4().to_string(),
                from_clip_id: window[0].clone(),
                to_clip_id: window[1].clone(),
                duration: 0.5,
                kind: "fade".into(),
            });
        }
    }

    // Fallback: if XML had almost nothing, try a looser path scrape for media files.
    if media.is_empty() {
        media.extend(scrape_media_paths(xml, source_path));
    }

    Ok(Project {
        name: project_name,
        media,
        clips,
        transitions,
        titles,
    })
}

fn local_name(name: &[u8]) -> String {
    let s = String::from_utf8_lossy(name);
    s.rsplit('}').next().unwrap_or(&s).to_string()
}

fn collect_attrs(e: &quick_xml::events::BytesStart<'_>) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for attr in e.attributes().flatten() {
        let key = local_name(attr.key.as_ref()).to_lowercase();
        let val = attr
            .unescape_value()
            .map(|v| v.to_string())
            .unwrap_or_default();
        map.insert(key, val.clone());
        // Also keep camelCase-ish aliases without lowercasing for known keys
        let raw_key = local_name(attr.key.as_ref());
        map.insert(raw_key, val);
    }
    map
}

fn attr(attrs: &HashMap<String, String>, keys: &[&str]) -> Option<String> {
    for k in keys {
        if let Some(v) = attrs.get(*k) {
            if !v.is_empty() {
                return Some(v.clone());
            }
        }
        let lower = k.to_lowercase();
        if let Some(v) = attrs.get(&lower) {
            if !v.is_empty() {
                return Some(v.clone());
            }
        }
    }
    None
}

fn parse_f64(attrs: &HashMap<String, String>, keys: &[&str], default: f64) -> f64 {
    attr(attrs, keys)
        .and_then(|s| {
            // WLMP sometimes stores 100-nanosecond units
            if let Ok(v) = s.parse::<f64>() {
                if v > 10_000_000.0 {
                    Some(v / 10_000_000.0)
                } else {
                    Some(v)
                }
            } else {
                None
            }
        })
        .unwrap_or(default)
}

fn resolve_media_path(raw: &str, source_path: &str) -> String {
    let p = Path::new(raw);
    if p.is_absolute() {
        return raw.to_string();
    }
    if let Some(parent) = Path::new(source_path).parent() {
        return parent.join(raw).to_string_lossy().to_string();
    }
    raw.to_string()
}

fn guess_media_type(path: &str) -> MediaType {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "mp3" | "wav" | "aac" | "m4a" | "flac" | "ogg" | "wma" => MediaType::Audio,
        "jpg" | "jpeg" | "png" | "gif" | "bmp" | "webp" | "tiff" => MediaType::Image,
        _ => MediaType::Video,
    }
}

fn media_from_attrs(attrs: &HashMap<String, String>, source_path: &str) -> Option<MediaItem> {
    let path = attr(
        attrs,
        &[
            "filePath",
            "filepath",
            "path",
            "FilePath",
            "mediaPath",
            "src",
            "Source",
        ],
    )?;
    let resolved = resolve_media_path(&path, source_path);
    let name = attr(attrs, &["name", "Name", "fileName", "FileName"])
        .unwrap_or_else(|| {
            Path::new(&resolved)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("media")
                .to_string()
        });
    let duration = parse_f64(attrs, &["duration", "Duration", "length", "Length"], 5.0);
    let id = Uuid::new_v4().to_string();
    Some(MediaItem {
        id,
        path: resolved,
        name,
        media_type: guess_media_type(&path),
        duration,
        width: attr(attrs, &["width", "Width"]).and_then(|s| s.parse().ok()),
        height: attr(attrs, &["height", "Height"]).and_then(|s| s.parse().ok()),
        fps: attr(attrs, &["fps", "frameRate", "FrameRate"]).and_then(|s| s.parse().ok()),
    })
}

fn clip_from_attrs(
    attrs: &HashMap<String, String>,
    media_id_map: &HashMap<String, String>,
    track: TrackKind,
) -> Option<Clip> {
    let raw_media = attr(
        attrs,
        &[
            "mediaItemID",
            "mediaItemId",
            "mediaId",
            "MediaId",
            "mediaID",
            "ref",
        ],
    );
    let media_id = raw_media
        .as_ref()
        .and_then(|id| media_id_map.get(id).cloned())
        .or_else(|| raw_media.clone())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let start = parse_f64(attrs, &["start", "Start", "in", "InPoint", "mediaStart"], 0.0);
    let end = parse_f64(
        attrs,
        &["end", "End", "out", "OutPoint", "mediaEnd"],
        start + 5.0,
    );
    let position = parse_f64(
        attrs,
        &["position", "Position", "timelineStart", "time", "Time"],
        0.0,
    );
    let speed = parse_f64(attrs, &["speed", "Speed", "playbackRate"], 1.0).max(0.01);

    Some(Clip {
        id: Uuid::new_v4().to_string(),
        media_id,
        start,
        end: end.max(start + 0.1),
        position,
        track,
        speed,
        crop: Default::default(),
        transform: Default::default(),
        adjustments: Default::default(),
        opacity: 1.0,
        effects: Vec::new(),
    })
}

fn transition_from_attrs(
    attrs: &HashMap<String, String>,
    clip_id_map: &HashMap<String, String>,
) -> Option<Transition> {
    let from_raw = attr(attrs, &["from", "From", "fromClip", "leftExtentID"])?;
    let to_raw = attr(attrs, &["to", "To", "toClip", "rightExtentID"])?;
    let from_clip_id = clip_id_map
        .get(&from_raw)
        .cloned()
        .unwrap_or(from_raw);
    let to_clip_id = clip_id_map.get(&to_raw).cloned().unwrap_or(to_raw);
    let duration = parse_f64(attrs, &["duration", "Duration", "length"], 0.5);
    let kind = attr(attrs, &["type", "Type", "kind", "Name", "name"]).unwrap_or_else(|| "fade".into());
    Some(Transition {
        id: Uuid::new_v4().to_string(),
        from_clip_id,
        to_clip_id,
        duration,
        kind: normalize_transition_kind(&kind),
    })
}

fn normalize_transition_kind(kind: &str) -> String {
    let k = kind.to_lowercase();
    if k.contains("dissolve") || k.contains("cross") || k.contains("fade") {
        "fade".into()
    } else if k.contains("wipe") && k.contains("left") {
        "wipeleft".into()
    } else if k.contains("wipe") && k.contains("right") {
        "wiperight".into()
    } else if k.contains("wipe") && k.contains("up") {
        "wipeup".into()
    } else if k.contains("wipe") {
        "wipedown".into()
    } else {
        "fade".into()
    }
}

fn title_from_attrs(attrs: &HashMap<String, String>, text_fallback: &str) -> Title {
    let text = attr(attrs, &["text", "Text", "caption", "Caption", "content"])
        .unwrap_or_else(|| {
            if text_fallback.trim().is_empty() {
                "Title".into()
            } else {
                text_fallback.trim().to_string()
            }
        });
    Title {
        id: Uuid::new_v4().to_string(),
        text,
        position: parse_f64(attrs, &["position", "Position", "start", "Start"], 0.0),
        duration: parse_f64(attrs, &["duration", "Duration", "length"], 3.0),
        font: attr(attrs, &["font", "Font", "fontFamily"]).unwrap_or_else(|| "segoe".into()),
        font_size: attr(attrs, &["fontSize", "FontSize", "size"])
            .and_then(|s| s.parse().ok())
            .unwrap_or(48),
        color: attr(attrs, &["color", "Color", "foreground"])
            .unwrap_or_else(|| "#FFFFFF".into()),
        x: attr(attrs, &["x", "X"])
            .and_then(|s| s.parse().ok())
            .unwrap_or(100),
        y: attr(attrs, &["y", "Y"])
            .and_then(|s| s.parse().ok())
            .unwrap_or(100),
        align: "center".into(),
        bold: false,
        italic: false,
        style: "plain".into(),
        mode: "overlay".into(),
        color2: "#F5A623".into(),
        use_gradient: false,
        stroke_color: "#000000".into(),
        stroke_width: 0,
        background_color: "#000000".into(),
    }
}

fn scrape_media_paths(xml: &str, source_path: &str) -> Vec<MediaItem> {
    let mut items = Vec::new();
    let patterns = [
        ".mp4", ".avi", ".wmv", ".mov", ".mkv", ".mpg", ".mpeg", ".jpg", ".jpeg", ".png", ".bmp",
        ".wav", ".mp3", ".wma",
    ];
    for token in xml.split(|c: char| c == '"' || c == '\'' || c == '<' || c == '>') {
        let lower = token.to_lowercase();
        if patterns.iter().any(|p| lower.ends_with(p)) && (token.contains('\\') || token.contains('/'))
        {
            let resolved = resolve_media_path(token, source_path);
            let name = Path::new(&resolved)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("media")
                .to_string();
            items.push(MediaItem {
                id: Uuid::new_v4().to_string(),
                path: resolved.clone(),
                name,
                media_type: guess_media_type(&resolved),
                duration: 5.0,
                width: None,
                height: None,
                fps: None,
            });
        }
    }
    items
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_sample_wlmp() {
        let xml = r#"<?xml version="1.0"?>
        <Project>
          <MediaItem id="m1" filePath="C:\media\a.mp4" name="a.mp4" duration="10" />
          <VideoClip id="c1" mediaItemID="m1" start="0" end="5" position="0" />
          <Title text="Hi" position="1" duration="2" />
        </Project>"#;
        let project = parse_wlmp(xml, r"C:\projects\test.wlmp").unwrap();
        assert_eq!(project.media.len(), 1);
        assert_eq!(project.clips.len(), 1);
        assert_eq!(project.titles.len(), 1);
        assert_eq!(project.titles[0].text, "Hi");
    }
}
