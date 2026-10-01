/* Reel timeline visualizer.
 * Fetches the JSON produced by ReelToJson and renders an editor-facing
 * timeline: a proportional scene track + ruler, a storyboard of cards,
 * and a detail modal per scene. */

const SCENE_PALETTE = ["blue", "violet", "purple", "pink", "teal", "olive", "brown", "grey"];
const KIND_COLOR = {
  hook: "orange", intro: "teal", cta: "green", outro: "green",
  reveal: "violet", drop: "violet", twist: "violet",
};

/* ── helpers ─────────────────────────────────────────────── */

// "30s"->30, "500ms"->0.5, "2m"->120, "1h"->3600, 30->30, null->null
function toSec(v) {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const m = String(v).trim().match(/^([\d.]+)\s*(ms|s|m|h)$/);
  if (!m) return null;
  return parseFloat(m[1]) * { ms: 0.001, s: 1, m: 60, h: 3600 }[m[2]];
}

function fmtTime(sec) {
  if (sec == null || isNaN(sec)) return "?";
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function niceStep(total) {
  if (total <= 10) return 2;
  if (total <= 30) return 5;
  if (total <= 60) return 10;
  if (total <= 180) return 30;
  return 60;
}

// Lay every scene out on a seconds axis. start/end scenes keep their
// window; duration-only scenes flow after the previous; untimed scenes
// get a default 2s slot (flagged estimated).
function computeTimings(video) {
  const scenes = video.scenes || [];
  let cursor = 0;
  const placed = scenes.map((s, i) => {
    let start, end, est = false;
    const t = s.timing;
    if (t && t.start != null && t.end != null) {
      start = toSec(t.start); end = toSec(t.end);
      cursor = Math.max(cursor, end || cursor);
    } else if (t && t.duration != null) {
      const d = toSec(t.duration) || 2;
      start = cursor; end = cursor + d; cursor = end;
    } else {
      est = true; start = cursor; end = cursor + 2; cursor = end;
    }
    return { ...s, idx: i, _start: start || 0, _end: end || 0, _est: est };
  });
  const metaDur = toSec(video.meta && video.meta.duration);
  const total = Math.max(metaDur || 0, cursor, ...placed.map(p => p._end), 1);
  return { placed, total };
}

function sceneColor(s) {
  const name = (s.name || "").toLowerCase();
  for (const key of Object.keys(KIND_COLOR)) if (name.includes(key)) return KIND_COLOR[key];
  return SCENE_PALETTE[s.idx % SCENE_PALETTE.length];
}

// pull a scene's props into friendly buckets
function bucket(scene) {
  const p = scene.props || {};
  return {
    text:    p.text || p.caption || p.hook,
    narration: p.narration,
    visual:  p.visual,
    broll:   p.broll,
    audio:   [p.music, p.sfx].filter(x => x != null),
    transition: p.transition,
    effect:  p.effect,
    speaker: p.speaker,
    raw:     p,
  };
}

function valText(v) {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(valText).join(", ");
  if (v.value) return v.by ? `${v.value} — ${valText(v.by)}` : v.value;
  return JSON.stringify(v);
}

/* ── rendering ───────────────────────────────────────────── */

function renderVideos(videos) {
  $("#videos").empty();
  if (!videos.length) {
    $("#videos").append('<div class="ui placeholder segment">No videos in this file.</div>');
    return;
  }
  videos.forEach((v, i) => $("#videos").append(renderVideo(v, i)));
}

function renderVideo(video, vi) {
  const { placed, total } = computeTimings(video);
  const m = video.meta || {};
  const tags = Array.isArray(m.tags) ? m.tags : (m.tags ? [m.tags] : []);
  const music = valText(m.music);

  const $card = $(`
    <div class="video-block">
      <h3 class="ui header">
        <span class="ui horizontal label">${video.kind || "video"}</span>
        ${video.title || "(untitled)"}
        <span class="sub header">${vi + 1} of · ${placed.length} scenes · ${fmtTime(total)} total</span>
      </h3>
      <div class="meta-labels">
        ${m.platform ? `<span class="ui tiny basic label"><i class="share square icon"></i>${m.platform}</span>` : ""}
        ${m.aspect ? `<span class="ui tiny basic label"><i class="rectangle icon"></i>${m.aspect}</span>` : ""}
        ${m.duration ? `<span class="ui tiny basic label"><i class="clock icon"></i>${m.duration}</span>` : ""}
        ${music ? `<span class="ui tiny basic label"><i class="music icon"></i>${music}</span>` : ""}
        ${tags.map(t => `<span class="ui tiny label">#${t}</span>`).join("")}
      </div>
      <div class="timeline">
        ${renderRuler(total)}
        <div class="track scenes">${placed.map(s => renderSegment(s, total)).join("")}</div>
      </div>
      <div class="ui stackable four cards storyboard">
        ${placed.map(s => renderCard(s)).join("")}
      </div>
    </div>
  `);
  $card.find(".scene-segment, .storyboard .card").each(function () {
    const idx = +$(this).data("idx");
    $(this).on("click", () => openSceneModal(placed[idx], video));
  });
  return $card;
}

function renderRuler(total) {
  const step = niceStep(total);
  let ticks = "";
  for (let t = 0; t <= total + 0.001; t += step) {
    const left = (t / total) * 100;
    ticks += `<div class="tick" style="left:${left}%">
                <span class="tick-label">${fmtTime(t)}</span>
              </div>`;
  }
  return `<div class="ruler">${ticks}</div>`;
}

function renderSegment(s, total) {
  const left = (s._start / total) * 100;
  const width = Math.max(((s._end - s._start) / total) * 100, 0.8);
  const color = sceneColor(s);
  const b = bucket(s);
  const icons = [
    b.visual ? "🎬" : "",
    b.text ? "📝" : "",
    b.audio.length ? "🔊" : "",
  ].join("");
  const est = s._est ? " estimated" : "";
  return `
    <div class="scene-segment ${color}${est}" data-idx="${s.idx}"
         style="left:${left}%; width:${width}%"
         title="${s.name || "scene"} · ${fmtTime(s._start)}–${fmtTime(s._end)}">
      <span class="seg-name">${s.name || "#" + s.idx}</span>
      <span class="seg-time">${fmtTime(s._start)}–${fmtTime(s._end)}</span>
      <span class="seg-icons">${icons}</span>
      ${b.transition ? `<span class="seg-transition" title="transition: ${b.transition}">⇆ ${b.transition}</span>` : ""}
    </div>`;
}

function renderCard(s) {
  const b = bucket(s);
  const text = valText(b.text) || "";
  const color = sceneColor(s);
  return `
    <div class="ui ${color} card" data-idx="${s.idx}">
      <div class="content">
        <div class="header">${s.name || "scene #" + s.idx}</div>
        <div class="meta">
          ${fmtTime(s._start)}–${fmtTime(s._end)}
          ${b.transition ? ` · ⇆ ${b.transition}` : ""}
          ${b.effect ? ` · ✨ ${b.effect}` : ""}
        </div>
        <div class="description">${escapeHtml(text.slice(0, 90))}${text.length > 90 ? "…" : ""}</div>
      </div>
      ${b.audio.length ? `<div class="extra content"><i class="music icon"></i>${escapeHtml(valText(b.audio))}</div>` : ""}
    </div>`;
}

function openSceneModal(s, video) {
  const b = bucket(s);
  const rows = (label, v) => {
    const t = valText(v);
    return t ? `<div class="kb-row"><dt>${label}</dt><dd>${escapeHtml(t)}</dd></div>` : "";
  };
  const t = s.timing || {};
  $("#modal-title").html(`${s.name || "scene #" + s.idx}
      <span class="ui basic label">${fmtTime(s._start)}–${fmtTime(s._end)}${s._est ? " (est.)" : ""}</span>`);
  let body = '<dl class="scene-kv">';
  body += rows("Text", b.text);
  body += rows("Narration", b.narration);
  body += rows("Visual", b.visual);
  body += rows("B-roll", b.broll);
  body += rows("Music / SFX", b.audio);
  body += rows("Transition", b.transition);
  body += rows("Effect", b.effect);
  body += rows("Speaker", b.speaker);
  // any other props not shown above
  const known = new Set(["text", "caption", "hook", "narration", "visual", "broll",
                         "music", "sfx", "transition", "effect", "speaker"]);
  for (const [k, v] of Object.entries(s.props || {})) {
    if (!known.has(k)) body += `<div class="kb-row"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(valText(v))}</dd></div>`;
  }
  body += "</dl>";
  // full raw props (for the editor who wants everything)
  body += `<details class="raw-props"><summary>raw props (JSON)</summary><pre>${escapeHtml(JSON.stringify(s.props, null, 2))}</pre></details>`;
  $("#modal-body").html(body);
  $("#scene-modal").modal("show");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ── wiring ──────────────────────────────────────────────── */

async function loadExamples() {
  const res = await fetch("/api/examples");
  const files = await res.json();
  const $sel = $("#file-select");
  files.forEach(f => $sel.append(`<option value="${f}">${f}</option>`));
  $sel.dropdown();  // Fomantic widget
  if (files.length) { $sel.val(files[0]); load(files[0]); }
}

async function load(file) {
  $("#main, #error-banner").attr("hidden", true);
  setStatus("loading", `parsing ${file}…`);
  try {
    const res = await fetch("/api/parse?file=" + encodeURIComponent(file));
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    renderVideos(data);
    $("#main").attr("hidden", false);
    setStatus("ok", `${data.length} video(s) loaded`);
  } catch (err) {
    $("#error-detail").text(err.message);
    $("#error-banner").attr("hidden", false);
    setStatus("error", "failed");
  }
}

function setStatus(kind, text) {
  const icon = { loading: "circle notch loading", ok: "check circle", error: "exclamation triangle" }[kind] || "info circle";
  const color = { loading: "", ok: "green", error: "red" }[kind] || "";
  $("#status-text").html(`<i class="${icon} icon ${color}"></i> ${escapeHtml(text)}`);
}

$(function () {
  $("#load-btn").on("click", () => load($("#file-select").val()));
  $("#file-select").on("change", function () { load(this.value); });
  loadExamples();
});
