use crate::models::{
    Clip, GifExportSettings, MediaItem, MediaType, Project, RenderSettings, TrackKind,
    Transition, WlmpProject,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command as StdCommand, Stdio};
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use tempfile::Builder as TempBuilder;

/// Extract a single PNG frame at `time` seconds from a media file.
/// Optional `max_width` downscales for responsive preview (full-res when omitted).
#[tauri::command]
pub async fn get_frame_at(
    app: AppHandle,
    path: String,
    time: f32,
    max_width: Option<u32>,
) -> Result<Vec<u8>, String> {
    let tmp = TempBuilder::new()
        .suffix(".png")
        .tempfile()
        .map_err(|e| format!("temp file: {e}"))?;
    let out_path = tmp.path().to_path_buf();

    let mut args = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-ss".into(),
        format!("{:.3}", time.max(0.0)),
        "-i".into(),
        path,
        "-frames:v".into(),
        "1".into(),
        "-update".into(),
        "1".into(),
    ];
    if let Some(w) = max_width.filter(|w| *w > 0) {
        args.push("-vf".into());
        args.push(format!("scale='min({w},iw)':-2:flags=lanczos"));
    }
    args.extend([
        "-f".into(),
        "image2".into(),
        "-y".into(),
        out_path.to_string_lossy().to_string(),
    ]);

    run_ffmpeg(&app, args).await?;

    let bytes = fs::read(&out_path).map_err(|e| format!("read frame: {e}"))?;
    Ok(bytes)
}

/// Same as get_frame_at but returns a data URL for convenience.
#[tauri::command]
pub async fn get_frame_data_url(
    app: AppHandle,
    path: String,
    time: f32,
    max_width: Option<u32>,
) -> Result<String, String> {
    let bytes = get_frame_at(app, path, time, max_width).await?;
    Ok(format!("data:image/png;base64,{}", B64.encode(bytes)))
}

/// Export a GIF (optional meme captions) from a media file range.
#[tauri::command]
pub async fn export_gif(app: AppHandle, settings: GifExportSettings) -> Result<(), String> {
    if settings.input_path.is_empty() || settings.output_path.is_empty() {
        return Err("inputPath and outputPath are required".into());
    }
    let start = settings.start.max(0.0);
    let end = settings.end.max(start + 0.1);
    let duration = (end - start).min(30.0); // keep GIFs practical
    let width = even_dim(settings.width.clamp(120, 1280));
    let fps = settings.fps.clamp(4.0, 30.0);
    let speed = if settings.speed <= 0.0 {
        1.0
    } else {
        settings.speed.clamp(0.25, 4.0)
    };

    let mut vf: Vec<String> = Vec::new();

    let cw = settings.crop_w.clamp(0.05, 1.0);
    let ch = settings.crop_h.clamp(0.05, 1.0);
    let cx = settings.crop_x.clamp(0.0, 1.0 - cw);
    let cy = settings.crop_y.clamp(0.0, 1.0 - ch);
    if (cw - 1.0).abs() > 0.001 || (ch - 1.0).abs() > 0.001 || cx > 0.001 || cy > 0.001 {
        vf.push(format!(
            "crop=iw*{cw:.4}:ih*{ch:.4}:iw*{cx:.4}:ih*{cy:.4}",
            cw = cw,
            ch = ch,
            cx = cx,
            cy = cy
        ));
    }

    if (speed - 1.0).abs() > 0.001 {
        vf.push(format!("setpts=PTS/{speed}"));
    }

    vf.push(format!(
        "fps={fps},scale={width}:-1:flags=lanczos:force_original_aspect_ratio=decrease"
    ));

    let text_color = normalize_color(&settings.text_color);
    let stroke_color = normalize_color(&settings.stroke_color);
    let stroke = settings.stroke_width.min(12);
    let font_size = settings.font_size.clamp(12, 128);
    let font_arg = resolve_fontfile(&settings.font);

    if !settings.top_text.trim().is_empty() {
        let text = escape_drawtext(&settings.top_text.trim().to_uppercase());
        vf.push(format!(
            "drawtext=text='{text}'{font}:fontsize={font_size}:fontcolor={text_color}:borderw={stroke}:bordercolor={stroke_color}:x=(w-text_w)/2:y=h*0.04",
            font = font_arg
        ));
    }
    if !settings.bottom_text.trim().is_empty() {
        let text = escape_drawtext(&settings.bottom_text.trim().to_uppercase());
        vf.push(format!(
            "drawtext=text='{text}'{font}:fontsize={font_size}:fontcolor={text_color}:borderw={stroke}:bordercolor={stroke_color}:x=(w-text_w)/2:y=h-text_h-h*0.04",
            font = font_arg
        ));
    }

    // High-quality GIF via palette
    let filter = format!(
        "{},split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle",
        vf.join(",")
    );

    let args = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-y".into(),
        "-ss".into(),
        format!("{:.3}", start),
        "-t".into(),
        format!("{:.3}", duration / speed),
        "-i".into(),
        settings.input_path.clone(),
        "-filter_complex".into(),
        filter,
        "-loop".into(),
        "0".into(),
        settings.output_path.clone(),
    ];

    run_ffmpeg(&app, args).await
}

fn normalize_color(c: &str) -> String {
    let t = c.trim_start_matches('#');
    if t.len() == 6 || t.len() == 8 {
        format!("0x{t}")
    } else if c.is_empty() {
        "white".into()
    } else {
        c.to_string()
    }
}

/// Render the full project to an MP4 using an FFmpeg filter graph.
#[tauri::command]
pub async fn render_project(
    app: AppHandle,
    project: WlmpProject,
    settings: RenderSettings,
) -> Result<(), String> {
    if project.clips.is_empty() {
        return Err("Project has no clips to render".into());
    }
    if settings.output_path.is_empty() {
        return Err("outputPath is required".into());
    }

    let media_map: HashMap<String, &MediaItem> =
        project.media.iter().map(|m| (m.id.clone(), m)).collect();

    let mut video_clips: Vec<&Clip> = project
        .clips
        .iter()
        .filter(|c| matches!(c.track, TrackKind::Video | TrackKind::Overlay))
        .collect();
    video_clips.sort_by(|a, b| {
        a.position
            .partial_cmp(&b.position)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    if video_clips.is_empty() {
        return Err("Project has no video/overlay clips to render".into());
    }

    let mut audio_clips: Vec<&Clip> = project
        .clips
        .iter()
        .filter(|c| matches!(c.track, TrackKind::Audio))
        .collect();
    audio_clips.sort_by(|a, b| {
        a.position
            .partial_cmp(&b.position)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // If no dedicated audio track, pull audio from video clips.
    let audio_from_video = audio_clips.is_empty();

    let mut inputs: Vec<String> = Vec::new();
    let mut input_index: HashMap<String, usize> = HashMap::new();

    for clip in video_clips.iter().chain(audio_clips.iter()) {
        let media = media_map
            .get(&clip.media_id)
            .ok_or_else(|| format!("Missing media for clip {}", clip.id))?;
        if !input_index.contains_key(&media.path) {
            let idx = inputs.len() / 2; // each input adds -i path
            input_index.insert(media.path.clone(), idx);
            inputs.push("-i".into());
            inputs.push(media.path.clone());
        }
    }

    // Also ensure title-only projects still have a blank base if needed — skipped here.

    let (filter, video_label, audio_label) = build_filter_graph(
        &project,
        &video_clips,
        &audio_clips,
        &media_map,
        &input_index,
        &settings,
        audio_from_video,
    )?;

    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-y".into(),
    ];
    args.extend(inputs);
    args.push("-filter_complex".into());
    args.push(filter);
    args.push("-map".into());
    args.push(format!("[{video_label}]"));
    if let Some(ref al) = audio_label {
        args.push("-map".into());
        args.push(format!("[{al}]"));
    }
    args.push("-c:v".into());
    args.push("libx264".into());
    args.push("-preset".into());
    args.push(encode_preset(settings.width, settings.height, settings.fps).into());
    args.push("-profile:v".into());
    args.push("high".into());
    args.push("-level".into());
    args.push(h264_level(settings.width, settings.height, settings.fps).into());
    args.push("-pix_fmt".into());
    args.push("yuv420p".into());
    args.push("-r".into());
    args.push(format_fps(settings.fps));
    args.push("-g".into());
    args.push(format!("{}", (settings.fps * 2.0).round().max(1.0) as u32));
    args.push("-b:v".into());
    args.push(settings.video_bitrate.clone());
    let (maxrate, bufsize) = bitrate_caps(&settings.video_bitrate);
    args.push("-maxrate".into());
    args.push(maxrate);
    args.push("-bufsize".into());
    args.push(bufsize);
    if audio_label.is_some() {
        args.push("-c:a".into());
        args.push("aac".into());
        args.push("-b:a".into());
        args.push(settings.audio_bitrate.clone());
        args.push("-ar".into());
        args.push("48000".into());
    }
    args.push("-movflags".into());
    args.push("+faststart".into());
    args.push(settings.output_path.clone());

    run_ffmpeg(&app, args).await
}

fn build_filter_graph(
    project: &Project,
    video_clips: &[&Clip],
    audio_clips: &[&Clip],
    media_map: &HashMap<String, &MediaItem>,
    input_index: &HashMap<String, usize>,
    settings: &RenderSettings,
    audio_from_video: bool,
) -> Result<(String, String, Option<String>), String> {
    let mut parts: Vec<String> = Vec::new();
    let w = even_dim(settings.width);
    let h = even_dim(settings.height);
    let fps = settings.fps.max(1.0);

    // Per-clip trimmed & scaled video streams
    let mut v_labels: Vec<String> = Vec::new();
    let mut clip_durs: Vec<(String, f64)> = Vec::new(); // clip id -> timeline duration

    for (i, clip) in video_clips.iter().enumerate() {
        let media = media_map
            .get(&clip.media_id)
            .ok_or_else(|| format!("Missing media {}", clip.media_id))?;
        let idx = *input_index
            .get(&media.path)
            .ok_or_else(|| format!("No input index for {}", media.path))?;
        let speed = if clip.speed <= 0.0 { 1.0 } else { clip.speed };
        let src_dur = (clip.end - clip.start).max(0.1);
        let out_dur = src_dur / speed;
        let label = format!("v{i}");
        let fx = clip_video_filters(clip, w, h, fps);

        match media.media_type {
            MediaType::Image => {
                parts.push(format!(
                    "[{idx}:v]{fx},trim=duration={out_dur},setpts=PTS-STARTPTS[{label}]",
                    idx = idx,
                    fx = fx,
                    out_dur = out_dur,
                    label = label
                ));
            }
            _ => {
                parts.push(format!(
                    "[{idx}:v]trim=start={start}:end={end},setpts=(PTS-STARTPTS)/{speed},{fx}[{label}]",
                    idx = idx,
                    start = clip.start,
                    end = clip.end,
                    speed = speed,
                    fx = fx,
                    label = label
                ));
            }
        }
        v_labels.push(label.clone());
        clip_durs.push((clip.id.clone(), out_dur));
    }

    // Build transition map keyed by from_clip_id
    let mut trans_by_from: HashMap<String, &Transition> = HashMap::new();
    for t in &project.transitions {
        trans_by_from.insert(t.from_clip_id.clone(), t);
    }

    // Chain with xfade or concat
    let mut current = v_labels[0].clone();
    let mut current_len = clip_durs[0].1;

    if v_labels.len() == 1 {
        // nothing to chain
    } else {
        for i in 1..v_labels.len() {
            let prev_clip_id = &clip_durs[i - 1].0;
            let next_label = &v_labels[i];
            let next_dur = clip_durs[i].1;
            let out_label = format!("vx{i}");

            if let Some(t) = trans_by_from.get(prev_clip_id) {
                let td = t.duration.clamp(0.05, current_len.min(next_dur) * 0.49);
                let offset = (current_len - td).max(0.0);
                let kind = sanitize_xfade(&t.kind);
                parts.push(format!(
                    "[{current}][{next}]xfade=transition={kind}:duration={td}:offset={offset}[{out}]",
                    current = current,
                    next = next_label,
                    kind = kind,
                    td = td,
                    offset = offset,
                    out = out_label
                ));
                current_len = current_len + next_dur - td;
            } else {
                // Hard cut via concat
                parts.push(format!(
                    "[{current}][{next}]concat=n=2:v=1:a=0[{out}]",
                    current = current,
                    next = next_label,
                    out = out_label
                ));
                current_len += next_dur;
            }
            current = out_label;
        }
    }

    // Apply titles with drawtext
    let mut video_out = current;
    for (ti, title) in project.titles.iter().enumerate() {
        let escaped = escape_drawtext(&title.text);
        let fontcolor = title.color.trim_start_matches('#');
        let fontcolor = if fontcolor.len() == 6 {
            format!("0x{fontcolor}")
        } else {
            "white".into()
        };
        let enable_start = title.position;
        let enable_end = title.position + title.duration;
        let enable = format!("between(t,{enable_start},{enable_end})");
        let font_arg = resolve_fontfile(&title.font);
        let border = if title.stroke_width > 0 || title.style == "outline" || title.style == "neon" {
            let w = if title.stroke_width > 0 {
                title.stroke_width
            } else {
                2
            };
            let sc = normalize_color(&title.stroke_color);
            format!(":borderw={w}:bordercolor={sc}")
        } else {
            String::new()
        };
        let shadow = if title.style == "neon" || title.style == "cinematic" {
            ":shadowx=2:shadowy=2:shadowcolor=black@0.6"
        } else {
            ""
        };
        let x_expr = match title.align.as_str() {
            "center" => "(w-text_w)/2".into(),
            "right" => format!("w-text_w-{}", title.x.max(0)),
            _ => title.x.to_string(),
        };
        let y_expr = if title.style == "lowerThird" {
            "(h*0.78)".into()
        } else if title.style == "credits" {
            format!(
                "h-((t-{start})/{dur})*(h+text_h)",
                start = title.position,
                dur = title.duration.max(0.1)
            )
        } else {
            title.y.to_string()
        };

        let mut vin = video_out.clone();
        if title.mode == "standalone" {
            let bg = normalize_color(&title.background_color);
            let box_out = format!("vb{ti}");
            parts.push(format!(
                "[{vin}]drawbox=x=0:y=0:w=iw:h=ih:color={bg}:t=fill:enable='{enable}'[{vout}]",
                vin = vin,
                bg = bg,
                enable = enable,
                vout = box_out
            ));
            vin = box_out;
        }

        let out = format!("vt{ti}");
        parts.push(format!(
            "[{vin}]drawtext=text='{text}'{font}:fontsize={size}:fontcolor={color}:x={x}:y={y}{border}{shadow}:enable='{enable}'[{vout}]",
            vin = vin,
            text = escaped,
            font = font_arg,
            size = title.font_size,
            color = fontcolor,
            x = x_expr,
            y = y_expr,
            border = border,
            shadow = shadow,
            enable = enable,
            vout = out
        ));
        video_out = out;
    }

    // Audio
    let mut a_labels: Vec<String> = Vec::new();

    if audio_from_video {
        for (i, clip) in video_clips.iter().enumerate() {
            let media = media_map.get(&clip.media_id).unwrap();
            if matches!(media.media_type, MediaType::Image | MediaType::Audio) {
                continue;
            }
            let idx = *input_index.get(&media.path).unwrap();
            let speed = if clip.speed <= 0.0 { 1.0 } else { clip.speed };
            let label = format!("a{i}");
            // Delay to timeline position
            let delay_ms = (clip.position * 1000.0).round() as i64;
            parts.push(format!(
                "[{idx}:a]atrim=start={start}:end={end},asetpts=PTS-STARTPTS,atempo={tempo},adelay={delay}|{delay}[{label}]",
                idx = idx,
                start = clip.start,
                end = clip.end,
                tempo = clamp_atempo(speed),
                delay = delay_ms,
                label = label
            ));
            a_labels.push(label);
        }
    }

    for (i, clip) in audio_clips.iter().enumerate() {
        let media = media_map
            .get(&clip.media_id)
            .ok_or_else(|| format!("Missing media {}", clip.media_id))?;
        let idx = *input_index
            .get(&media.path)
            .ok_or_else(|| format!("No input for {}", media.path))?;
        let speed = if clip.speed <= 0.0 { 1.0 } else { clip.speed };
        let label = format!("aa{i}");
        let delay_ms = (clip.position * 1000.0).round() as i64;
        parts.push(format!(
            "[{idx}:a]atrim=start={start}:end={end},asetpts=PTS-STARTPTS,atempo={tempo},adelay={delay}|{delay}[{label}]",
            idx = idx,
            start = clip.start,
            end = clip.end,
            tempo = clamp_atempo(speed),
            delay = delay_ms,
            label = label
        ));
        a_labels.push(label);
    }

    let audio_out = if a_labels.is_empty() {
        None
    } else if a_labels.len() == 1 {
        Some(a_labels[0].clone())
    } else {
        let inputs_str = a_labels
            .iter()
            .map(|l| format!("[{l}]"))
            .collect::<String>();
        parts.push(format!(
            "{inputs}amix=inputs={n}:duration=longest:dropout_transition=2[aout]",
            inputs = inputs_str,
            n = a_labels.len()
        ));
        Some("aout".into())
    };

    Ok((parts.join(";"), video_out, audio_out))
}

fn sanitize_xfade(kind: &str) -> String {
    let allowed = [
        "fade",
        "wipeleft",
        "wiperight",
        "wipeup",
        "wipedown",
        "slideleft",
        "slideright",
        "slideup",
        "slidedown",
        "circlecrop",
        "rectcrop",
        "distance",
        "fadeblack",
        "fadewhite",
        "radial",
        "smoothleft",
        "smoothright",
        "smoothup",
        "smoothdown",
        "circleopen",
        "circleclose",
        "vertopen",
        "vertclose",
        "horzopen",
        "horzclose",
        "dissolve",
        "pixelize",
        "diagtl",
        "diagtr",
        "diagbl",
        "diagbr",
        "hlslice",
        "hrslice",
        "vuslice",
        "vdslice",
    ];
    let k = kind.to_lowercase();
    if allowed.contains(&k.as_str()) {
        k
    } else {
        "fade".into()
    }
}

fn escape_drawtext(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace(':', "\\:")
        .replace('\'', "\\'")
        .replace('%', "%%")
}

fn resolve_fontfile(font: &str) -> String {
    if Path::new(font).exists() {
        return format!(":fontfile='{}'", escape_drawtext(font));
    }
    let map: &[(&str, &str)] = &[
        ("impact", "C:/Windows/Fonts/impact.ttf"),
        ("arial", "C:/Windows/Fonts/arial.ttf"),
        ("arial-black", "C:/Windows/Fonts/ariblk.ttf"),
        ("georgia", "C:/Windows/Fonts/georgia.ttf"),
        ("times", "C:/Windows/Fonts/times.ttf"),
        ("courier", "C:/Windows/Fonts/cour.ttf"),
        ("verdana", "C:/Windows/Fonts/verdana.ttf"),
        ("trebuchet", "C:/Windows/Fonts/trebuc.ttf"),
        ("comic", "C:/Windows/Fonts/comic.ttf"),
        ("segoe", "C:/Windows/Fonts/segoeui.ttf"),
    ];
    let key = font.to_lowercase();
    if let Some((_, path)) = map.iter().find(|(id, _)| key == *id || key.contains(id)) {
        if Path::new(path).exists() {
            return format!(":fontfile='{}'", escape_drawtext(path));
        }
    }
    // Try treating the value as a Windows font filename
    let candidate = format!("C:/Windows/Fonts/{font}");
    if Path::new(&candidate).exists() {
        return format!(":fontfile='{}'", escape_drawtext(&candidate));
    }
    String::new()
}

/// atempo only accepts 0.5..2.0; chain if needed — for simplicity clamp.
fn clamp_atempo(speed: f64) -> f64 {
    speed.clamp(0.5, 2.0)
}

async fn run_ffmpeg(app: &AppHandle, args: Vec<String>) -> Result<(), String> {
    // Prefer sidecar; fall back to PATH ffmpeg for dev without binaries present.
    match app.shell().sidecar("ffmpeg") {
        Ok(cmd) => {
            let (mut rx, _child) = cmd
                .args(args)
                .spawn()
                .map_err(|e| format!("Failed to spawn ffmpeg sidecar: {e}"))?;

            let mut stderr = String::new();
            let mut status_code: Option<i32> = None;

            use tauri_plugin_shell::process::CommandEvent;
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stderr(line) => {
                        stderr.push_str(&String::from_utf8_lossy(&line));
                    }
                    CommandEvent::Error(e) => {
                        return Err(format!("ffmpeg error: {e}"));
                    }
                    CommandEvent::Terminated(payload) => {
                        status_code = payload.code;
                    }
                    _ => {}
                }
            }

            if status_code.unwrap_or(1) != 0 {
                return Err(format!(
                    "ffmpeg exited with code {:?}: {stderr}",
                    status_code
                ));
            }
            Ok(())
        }
        Err(_) => run_ffmpeg_path(args),
    }
}

fn run_ffmpeg_path(args: Vec<String>) -> Result<(), String> {
    let mut child = StdCommand::new("ffmpeg")
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            format!(
                "ffmpeg not found as sidecar or on PATH. Place binaries in src-tauri/binaries/. ({e})"
            )
        })?;
    let mut stderr = String::new();
    if let Some(mut err) = child.stderr.take() {
        let _ = std::io::Read::read_to_string(&mut err, &mut stderr);
    }
    let status = child.wait().map_err(|e| format!("ffmpeg wait: {e}"))?;
    if !status.success() {
        return Err(format!("ffmpeg failed: {stderr}"));
    }
    Ok(())
}

/// Probe media with ffprobe sidecar (or PATH).
pub async fn probe_media(app: &AppHandle, path: &str) -> Result<crate::models::MediaProbe, String> {
    let args = vec![
        "-v".into(),
        "quiet".into(),
        "-print_format".into(),
        "json".into(),
        "-show_format".into(),
        "-show_streams".into(),
        path.to_string(),
    ];

    let output = match app.shell().sidecar("ffprobe") {
        Ok(cmd) => {
            let out = cmd
                .args(args)
                .output()
                .await
                .map_err(|e| format!("ffprobe sidecar: {e}"))?;
            if !out.status.success() {
                return Err(format!(
                    "ffprobe failed: {}",
                    String::from_utf8_lossy(&out.stderr)
                ));
            }
            String::from_utf8_lossy(&out.stdout).to_string()
        }
        Err(_) => {
            let out = StdCommand::new("ffprobe")
                .args([
                    "-v",
                    "quiet",
                    "-print_format",
                    "json",
                    "-show_format",
                    "-show_streams",
                    path,
                ])
                .output()
                .map_err(|e| {
                    format!("ffprobe not found as sidecar or on PATH: {e}")
                })?;
            if !out.status.success() {
                return Err(format!(
                    "ffprobe failed: {}",
                    String::from_utf8_lossy(&out.stderr)
                ));
            }
            String::from_utf8_lossy(&out.stdout).to_string()
        }
    };

    parse_probe_json(&output, path)
}

fn parse_probe_json(json: &str, path: &str) -> Result<crate::models::MediaProbe, String> {
    let v: serde_json::Value =
        serde_json::from_str(json).map_err(|e| format!("ffprobe json: {e}"))?;

    let duration = v
        .pointer("/format/duration")
        .and_then(|d| d.as_str())
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(5.0);

    let streams = v
        .get("streams")
        .and_then(|s| s.as_array())
        .cloned()
        .unwrap_or_default();

    let has_video = streams.iter().any(|s| s.get("codec_type").and_then(|c| c.as_str()) == Some("video"));
    let has_audio = streams.iter().any(|s| s.get("codec_type").and_then(|c| c.as_str()) == Some("audio"));

    let video_stream = streams.iter().find(|s| {
        s.get("codec_type").and_then(|c| c.as_str()) == Some("video")
    });

    let width = video_stream
        .and_then(|s| s.get("width"))
        .and_then(|w| w.as_u64())
        .map(|w| w as u32);
    let height = video_stream
        .and_then(|s| s.get("height"))
        .and_then(|h| h.as_u64())
        .map(|h| h as u32);

    let fps = video_stream.and_then(|s| {
        parse_rate_fraction(
            s.get("avg_frame_rate")
                .and_then(|r| r.as_str())
                .or_else(|| s.get("r_frame_rate").and_then(|r| r.as_str())),
        )
    });

    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let media_type = if matches!(
        ext.as_str(),
        "jpg" | "jpeg" | "png" | "gif" | "bmp" | "webp" | "tiff"
    ) {
        MediaType::Image
    } else if has_video {
        MediaType::Video
    } else if has_audio {
        MediaType::Audio
    } else {
        MediaType::Video
    };

    let duration = if matches!(media_type, MediaType::Image) {
        5.0
    } else {
        duration
    };

    Ok(crate::models::MediaProbe {
        media_type,
        duration,
        width,
        height,
        fps,
    })
}

fn parse_rate_fraction(raw: Option<&str>) -> Option<f64> {
    let s = raw?;
    if s == "0/0" || s.is_empty() {
        return None;
    }
    let mut parts = s.split('/');
    let num: f64 = parts.next()?.parse().ok()?;
    let den: f64 = parts.next().unwrap_or("1").parse().ok()?;
    if den == 0.0 {
        return None;
    }
    let fps = num / den;
    if !(1.0..=480.0).contains(&fps) {
        return None;
    }
    Some((fps * 1000.0).round() / 1000.0)
}

fn even_dim(v: u32) -> u32 {
    let v = v.max(2);
    v - (v % 2)
}

/// Per-clip: crop → color adjust → effects → zoom/pan → fit canvas.
fn clip_video_filters(clip: &Clip, w: u32, h: u32, fps: f64) -> String {
    let mut filters: Vec<String> = Vec::new();

    let crop = &clip.crop;
    let cw = crop.w.clamp(0.05, 1.0);
    let ch = crop.h.clamp(0.05, 1.0);
    let cx = crop.x.clamp(0.0, 1.0 - cw);
    let cy = crop.y.clamp(0.0, 1.0 - ch);
    if (cw - 1.0).abs() > 0.001 || (ch - 1.0).abs() > 0.001 || cx > 0.001 || cy > 0.001 {
        filters.push(format!(
            "crop=iw*{cw:.4}:ih*{ch:.4}:iw*{cx:.4}:ih*{cy:.4}",
            cw = cw,
            ch = ch,
            cx = cx,
            cy = cy
        ));
    }

    let adj = &clip.adjustments;
    if adj.brightness.abs() > 0.001
        || (adj.contrast - 1.0).abs() > 0.001
        || (adj.saturation - 1.0).abs() > 0.001
    {
        filters.push(format!(
            "eq=brightness={b:.3}:contrast={c:.3}:saturation={s:.3}",
            b = adj.brightness.clamp(-1.0, 1.0),
            c = adj.contrast.clamp(0.0, 3.0),
            s = adj.saturation.clamp(0.0, 3.0)
        ));
    }

    let out_dur = ((clip.end - clip.start) / if clip.speed <= 0.0 { 1.0 } else { clip.speed }).max(0.1);

    for effect in &clip.effects {
        let amount = effect.amount;
        match effect.kind.as_str() {
            "blur" => filters.push(format!("boxblur={}", amount.clamp(1.0, 20.0).round())),
            "sharpen" => filters.push(format!(
                "unsharp=5:5:{:.2}:5:5:0.0",
                amount.clamp(0.1, 5.0)
            )),
            "grayscale" => filters.push("hue=s=0".into()),
            "sepia" => filters.push(format!(
                "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131:0:0:0:0:{}",
                amount.clamp(0.0, 1.0)
            )),
            "vignette" => filters.push(format!("vignette=PI/{}", (4.0 / amount.max(0.1)).clamp(2.0, 20.0))),
            "mirror" => filters.push("hflip".into()),
            "fadeIn" => {
                let d = amount.clamp(0.05, out_dur * 0.5);
                filters.push(format!("fade=t=in:st=0:d={d:.3}"));
            }
            "fadeOut" => {
                let d = amount.clamp(0.05, out_dur * 0.5);
                let st = (out_dur - d).max(0.0);
                filters.push(format!("fade=t=out:st={st:.3}:d={d:.3}"));
            }
            _ => {}
        }
    }

    let scale = clip.transform.scale.clamp(0.1, 8.0);
    let pan_x = clip.transform.pan_x.clamp(-1.0, 1.0);
    let pan_y = clip.transform.pan_y.clamp(-1.0, 1.0);

    // Fit to canvas, then optional zoom crop (Ken Burns style zoom/pan).
    filters.push(format!(
        "scale={w}:{h}:flags=lanczos:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1"
    ));

    if (scale - 1.0).abs() > 0.001 {
        let zw = ((w as f64) / scale).round().max(2.0) as u32;
        let zh = ((h as f64) / scale).round().max(2.0) as u32;
        let zw = even_dim(zw.min(w));
        let zh = even_dim(zh.min(h));
        let max_x = w.saturating_sub(zw) as f64;
        let max_y = h.saturating_sub(zh) as f64;
        let x = ((pan_x + 1.0) * 0.5 * max_x).round().clamp(0.0, max_x) as u32;
        let y = ((pan_y + 1.0) * 0.5 * max_y).round().clamp(0.0, max_y) as u32;
        filters.push(format!("crop={zw}:{zh}:{x}:{y},scale={w}:{h}:flags=lanczos"));
    }

    if clip.opacity < 0.999 {
        // Represent opacity via geq alpha on a format that supports it, then flatten.
        filters.push("format=rgba".into());
        filters.push(format!(
            "colorchannelmixer=aa={:.3}",
            clip.opacity.clamp(0.0, 1.0)
        ));
        filters.push("format=yuv420p".into());
    }

    filters.push(format!("fps={fps}"));
    filters.join(",")
}

fn format_fps(fps: f64) -> String {
    if (fps - fps.round()).abs() < 0.001 {
        format!("{}", fps.round() as u32)
    } else {
        format!("{:.3}", fps)
    }
}

fn encode_preset(width: u32, height: u32, fps: f64) -> &'static str {
    let pixels = width as u64 * height as u64;
    // Keep 4K / high-FPS encodes practical on typical machines.
    if pixels >= 3840 * 2160 && fps >= 50.0 {
        "faster"
    } else if pixels >= 3840 * 2160 {
        "fast"
    } else {
        "medium"
    }
}

fn h264_level(width: u32, height: u32, fps: f64) -> &'static str {
    let pixels = width as u64 * height as u64;
    let mbps = ((pixels as f64) / 256.0) * fps; // rough macroblock/sec proxy
    if pixels >= 7680 * 4320 || mbps > 2_000_000.0 {
        "6.2"
    } else if pixels >= 3840 * 2160 && fps > 60.0 {
        "5.2"
    } else if pixels >= 3840 * 2160 {
        "5.1"
    } else if pixels >= 1920 * 1080 && fps > 60.0 {
        "4.2"
    } else if pixels >= 1920 * 1080 {
        "4.1"
    } else {
        "4.0"
    }
}

fn bitrate_caps(bitrate: &str) -> (String, String) {
    let n = parse_bitrate_bits(bitrate).unwrap_or(45_000_000.0);
    let maxrate = format!("{:.0}", n * 1.5);
    let bufsize = format!("{:.0}", n * 3.0);
    (maxrate, bufsize)
}

fn parse_bitrate_bits(s: &str) -> Option<f64> {
    let s = s.trim().to_lowercase();
    if let Some(rest) = s.strip_suffix('k') {
        return Some(rest.parse::<f64>().ok()? * 1_000.0);
    }
    if let Some(rest) = s.strip_suffix('m') {
        return Some(rest.parse::<f64>().ok()? * 1_000_000.0);
    }
    s.parse().ok()
}

#[allow(dead_code)]
pub fn sidecar_bin_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries")
}

#[allow(dead_code)]
pub fn write_debug_filter(filter: &str) -> Result<(), String> {
    let mut f = fs::File::create("filter_debug.txt").map_err(|e| e.to_string())?;
    f.write_all(filter.as_bytes()).map_err(|e| e.to_string())
}
