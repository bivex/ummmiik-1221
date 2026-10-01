/* Song Studio Visualizer
 * Parses and visualizes Song programs (.song files).
 * Renders musical timeline tracks, chords progressions, lyrics sheets, and arrangement grids.
 */

let currentSongs = [];
let currentView = "timeline";
let playbackTimer = null;
let isPlaying = false;
let playProgress = 0; // 0 to 1

/* ── Timing & Musical Calculations ──────────────────────── */

function parseTiming(val, bpm = 120, timeSig = "4/4") {
  if (val == null) return null;
  if (typeof val === "number") return { type: "bars", value: val, sec: (val * 4 * 60) / bpm };

  const str = String(val).trim();

  // Bars / measures / beats
  const barMatch = str.match(/^([\d.]+)\s*(bars?|measures?)$/i);
  if (barMatch) {
    const bars = parseFloat(barMatch[1]);
    const beatsPerBar = parseInt(timeSig.split("/")[0]) || 4;
    const sec = (bars * beatsPerBar * 60) / bpm;
    return { type: "bars", value: bars, sec, label: `${bars} bar${bars === 1 ? "" : "s"}` };
  }

  const beatMatch = str.match(/^([\d.]+)\s*(beats?)$/i);
  if (beatMatch) {
    const beats = parseFloat(beatMatch[1]);
    const sec = (beats * 60) / bpm;
    return { type: "beats", value: beats, sec, label: `${beats} beat${beats === 1 ? "" : "s"}` };
  }

  // Time in seconds/minutes
  const timeMatch = str.match(/^([\d.]+)\s*(ms|s|m|h)$/i);
  if (timeMatch) {
    const num = parseFloat(timeMatch[1]);
    const mult = { ms: 0.001, s: 1, m: 60, h: 3600 }[timeMatch[2].toLowerCase()];
    const sec = num * mult;
    const beatsPerBar = parseInt(timeSig.split("/")[0]) || 4;
    const bars = sec / ((beatsPerBar * 60) / bpm);
    return { type: "time", value: sec, sec, label: fmtTime(sec), bars };
  }

  // Plain number
  const num = parseFloat(str);
  if (!isNaN(num)) {
    return { type: "bars", value: num, sec: (num * 4 * 60) / bpm, label: `${num} bars` };
  }

  return null;
}

function fmtTime(sec) {
  if (sec == null || isNaN(sec)) return "0:00";
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function computeSongLayout(song) {
  const bpm = (song.meta && (typeof song.meta.bpm === "number" ? song.meta.bpm : parseFloat(song.meta.bpm))) || 120;
  const timeSig = (song.meta && song.meta.time_signature) || "4/4";
  const sections = song.sections || [];

  let cursorSec = 0;
  let cursorBars = 0;

  const placed = sections.map((sec, idx) => {
    let durSec = 16; // default 8 bars at 120 bpm = 16s
    let durBars = 8;
    let label = "";

    const t = sec.timing;
    if (t) {
      if (t.duration != null) {
        const parsed = parseTiming(t.duration, bpm, timeSig);
        if (parsed) {
          durSec = parsed.sec;
          durBars = parsed.bars || (parsed.type === "bars" ? parsed.value : durSec / (240 / bpm));
          label = parsed.label;
        }
      } else if (t.start != null && t.end != null) {
        const pStart = parseTiming(t.start, bpm, timeSig);
        const pEnd = parseTiming(t.end, bpm, timeSig);
        if (pStart && pEnd) {
          durSec = Math.max(pEnd.sec - pStart.sec, 1);
          durBars = Math.max((pEnd.bars || pEnd.value) - (pStart.bars || pStart.value), 1);
          label = `${t.start} - ${t.end}`;
        }
      }
    } else {
      label = "8 bars (est.)";
    }

    const startSec = cursorSec;
    const endSec = cursorSec + durSec;
    const startBar = cursorBars;
    const endBar = cursorBars + durBars;

    cursorSec = endSec;
    cursorBars = endBar;

    return {
      ...sec,
      idx,
      startSec,
      endSec,
      durSec,
      startBar,
      endBar,
      durBars,
      timingLabel: label || `${Math.round(durBars)} bars`,
    };
  });

  const totalSec = Math.max(cursorSec, 1);
  const totalBars = Math.max(cursorBars, 1);

  return { placed, totalSec, totalBars, bpm, timeSig };
}

/* ── Value Extraction Helpers ───────────────────────────── */

function getChords(sec) {
  const p = sec.props || {};
  const c = p.chords || p.progression || p.harmony;
  if (!c) return [];
  if (Array.isArray(c)) return c.map(x => (typeof x === "object" && x.value ? x.value : String(x)));
  if (typeof c === "string") return c.split(/[\s,-]+/).filter(Boolean);
  return [String(c)];
}

function getLyrics(sec) {
  const p = sec.props || {};
  const l = p.lyrics || p.text || p.words;
  if (!l) return null;
  if (typeof l === "string") return l;
  if (Array.isArray(l)) return l.join("\n");
  if (l.value) return String(l.value);
  return String(l);
}

function getInstruments(sec) {
  const p = sec.props || {};
  const insts = [];
  const standard = ["drums", "bass", "guitar", "synth", "piano", "keys", "strings", "lead", "percussion"];
  for (const k of standard) {
    if (p[k]) insts.push({ name: k, desc: valText(p[k]) });
  }
  return insts;
}

function valText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(valText).join(", ");
  if (v.value) return v.by ? `${v.value} (by ${valText(v.by)})` : v.value;
  return JSON.stringify(v);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ── Rendering ──────────────────────────────────────────── */

function renderSongs(songs) {
  currentSongs = songs;
  $("#songs").empty();
  if (!songs.length) {
    $("#songs").append('<div class="ui placeholder segment">No songs found in this file.</div>');
    return;
  }

  songs.forEach((s, i) => {
    const layout = computeSongLayout(s);
    $("#songs").append(renderSong(s, layout, i));
  });

  setupInteractions();
}

function renderSong(song, layout, idx) {
  const { placed, totalSec, totalBars, bpm, timeSig } = layout;
  const m = song.meta || {};
  const tags = Array.isArray(m.tags) ? m.tags : (m.tags ? [m.tags] : []);
  const mood = Array.isArray(m.mood) ? m.mood : (m.mood ? [m.mood] : []);

  const $block = $(`
    <div class="song-block" data-idx="${idx}">
      <div class="song-header">
        <h2 class="ui header">
          <span class="ui horizontal label">${song.kind || "song"}</span>
          ${escapeHtml(song.title || "Untitled Song")}
          <div class="sub header">
            ${placed.length} sections · ${Math.round(totalBars)} bars · ${fmtTime(totalSec)} total
          </div>
        </h2>
      </div>

      <div class="meta-badges">
        ${m.bpm ? `<div class="meta-badge bpm-badge"><i class="clock icon"></i> ${m.bpm} BPM</div>` : ""}
        ${m.key ? `<div class="meta-badge key-badge"><i class="music icon"></i> Key: ${escapeHtml(m.key)}</div>` : ""}
        ${m.time_signature ? `<div class="meta-badge highlight"><i class="hourglass half icon"></i> ${escapeHtml(m.time_signature)}</div>` : ""}
        ${m.genre ? `<div class="meta-badge"><i class="tag icon"></i> ${escapeHtml(m.genre)}</div>` : ""}
        ${m.artist ? `<div class="meta-badge"><i class="user icon"></i> ${escapeHtml(m.artist)}</div>` : ""}
        ${m.producer ? `<div class="meta-badge"><i class="headphones icon"></i> ${escapeHtml(valText(m.producer))}</div>` : ""}
        ${mood.map(md => `<div class="meta-badge"><i class="heart outline icon"></i> ${escapeHtml(md)}</div>`).join("")}
        ${tags.map(t => `<div class="meta-badge">#${escapeHtml(t)}</div>`).join("")}
      </div>

      <!-- Timeline View -->
      <div class="view-panel view-timeline">
        <div class="timeline-container">
          ${renderRuler(totalBars, totalSec)}
          <div class="timeline-track">
            <div class="timeline-playhead" style="left: 0%;"></div>
            ${placed.map(sec => renderTimelineSegment(sec, totalSec)).join("")}
          </div>
        </div>

        <div class="arrangement-grid">
          ${placed.map(sec => renderSectionCard(sec)).join("")}
        </div>
      </div>

      <!-- Lyrics Sheet View -->
      <div class="view-panel view-sheet" style="display: none;">
        <div class="lyrics-sheet">
          <h1 style="text-align: center; color: #fff; margin-bottom: 0.5rem;">${escapeHtml(song.title || "Song")}</h1>
          <p style="text-align: center; color: #9ca3af; margin-bottom: 2rem;">
            ${m.artist ? escapeHtml(m.artist) + " · " : ""}${m.key ? "Key of " + escapeHtml(m.key) + " · " : ""}${m.bpm ? m.bpm + " BPM" : ""}
          </p>
          ${placed.map(sec => renderSheetSection(sec)).join("")}
        </div>
      </div>

      <!-- Chords Grid View -->
      <div class="view-panel view-chords" style="display: none;">
        <table class="ui inverted celled table">
          <thead>
            <tr>
              <th style="width: 140px;">Section</th>
              <th style="width: 100px;">Timing</th>
              <th>Chords Progression</th>
              <th>Instrumentation</th>
            </tr>
          </thead>
          <tbody>
            ${placed.map(sec => {
              const chords = getChords(sec);
              const insts = getInstruments(sec);
              return `
                <tr>
                  <td><strong>${escapeHtml(sec.name)}</strong></td>
                  <td><code>${sec.timingLabel}</code></td>
                  <td>${chords.map(c => `<span class="chord-badge">${escapeHtml(c)}</span>`).join(" ")}</td>
                  <td>${insts.map(i => `<span class="inst-chip">${escapeHtml(i.name)}</span>`).join(" ")}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `);

  return $block;
}

function renderRuler(totalBars, totalSec) {
  let step = 4;
  if (totalBars > 64) step = 8;
  if (totalBars > 128) step = 16;
  if (totalBars <= 24) step = 2;

  let ticks = "";
  for (let b = 0; b <= totalBars; b += step) {
    const left = (b / totalBars) * 100;
    ticks += `
      <div class="ruler-tick" style="left: ${left}%;">
        <span class="ruler-label">Bar ${b + 1}</span>
      </div>
    `;
  }
  return `<div class="timeline-ruler">${ticks}</div>`;
}

function renderTimelineSegment(sec, totalSec) {
  const left = (sec.startSec / totalSec) * 100;
  const width = Math.max((sec.durSec / totalSec) * 100, 1.5);
  const typeClass = `seg-${(sec.type || "section").toLowerCase()}`;
  const chords = getChords(sec);
  const lyrics = getLyrics(sec);

  return `
    <div class="section-segment ${typeClass}" data-idx="${sec.idx}"
         style="left: ${left}%; width: ${width}%;"
         title="${escapeHtml(sec.name)} (${sec.timingLabel})">
      <div class="seg-header">
        <span class="seg-name">${escapeHtml(sec.name)}</span>
        <span class="seg-timing">${sec.timingLabel}</span>
      </div>
      ${chords.length ? `
        <div class="seg-chords-strip">
          ${chords.slice(0, 4).map(c => `<span class="chord-chip">${escapeHtml(c)}</span>`).join("")}
          ${chords.length > 4 ? '<span class="chord-chip">…</span>' : ""}
        </div>
      ` : ""}
      ${lyrics ? `<div class="seg-lyrics-preview">"${escapeHtml(lyrics.split("\n")[0].trim())}"</div>` : ""}
    </div>
  `;
}

function renderSectionCard(sec) {
  const typeClass = `card-${(sec.type || "section").toLowerCase()}`;
  const chords = getChords(sec);
  const lyrics = getLyrics(sec);
  const insts = getInstruments(sec);
  const p = sec.props || {};

  return `
    <div class="section-card ${typeClass}" data-idx="${sec.idx}">
      <div class="card-title-row">
        <span class="card-title">${escapeHtml(sec.name)}</span>
        <span class="card-time-pill">${sec.timingLabel}</span>
      </div>

      ${chords.length ? `
        <div class="chords-row">
          ${chords.map(c => `<span class="chord-badge">${escapeHtml(c)}</span>`).join("")}
        </div>
      ` : ""}

      ${lyrics ? `
        <div class="lyrics-preview-box">${escapeHtml(lyrics.trim())}</div>
      ` : ""}

      ${p.vocal ? `
        <div style="font-size: 11px; color: #f472b6;">
          <i class="microphone icon"></i> ${escapeHtml(valText(p.vocal))}
        </div>
      ` : ""}

      ${insts.length ? `
        <div class="card-instruments">
          ${insts.map(i => `<span class="inst-chip">${escapeHtml(i.name)}: ${escapeHtml(i.desc)}</span>`).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function renderSheetSection(sec) {
  const typeClass = `card-${(sec.type || "section").toLowerCase()}`;
  const chords = getChords(sec);
  const lyrics = getLyrics(sec);

  return `
    <div class="sheet-section ${typeClass}">
      <div class="sheet-sec-header">
        <span class="sheet-sec-name">${escapeHtml(sec.name)}</span>
        <span style="font-size: 12px; color: #9ca3af;">(${sec.timingLabel})</span>
      </div>
      ${chords.length ? `
        <div class="sheet-chords">
          ${chords.map(c => `<span class="chord-badge">${escapeHtml(c)}</span>`).join("")}
        </div>
      ` : ""}
      ${lyrics ? `
        <div class="sheet-lyrics">${escapeHtml(lyrics.trim())}</div>
      ` : `<div style="font-style: italic; color: #6b7280;">(Instrumental / No lyrics)</div>`}
    </div>
  `;
}

/* ── Interactive Modal ──────────────────────────────────── */

function openSectionModal(sec) {
  const chords = getChords(sec);
  const lyrics = getLyrics(sec);
  const p = sec.props || {};

  $("#modal-title").html(`
    <span class="ui label">${escapeHtml(sec.type || "section")}</span>
    ${escapeHtml(sec.name)}
    <span style="font-size: 12px; opacity: 0.8; margin-left: 8px;">(${sec.timingLabel})</span>
  `);

  let body = '<div class="modal-section-grid">';

  if (chords.length) {
    body += `
      <div class="modal-chords-box">
        <div style="font-size: 11px; color: #fbbf24; text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Chord Progression</div>
        <div class="chords-row">
          ${chords.map(c => `<span class="chord-badge" style="font-size: 15px; padding: 4px 10px;">${escapeHtml(c)}</span>`).join("")}
        </div>
      </div>
    `;
  }

  if (lyrics) {
    body += `
      <div>
        <div style="font-size: 11px; color: #9ca3af; text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">Lyrics</div>
        <div class="modal-lyrics-box">${escapeHtml(lyrics)}</div>
      </div>
    `;
  }

  body += `
    <table class="modal-kv-table">
      <tbody>
  `;

  for (const [k, v] of Object.entries(p)) {
    if (k === "lyrics" || k === "chords" || k === "progression") continue;
    body += `
      <tr>
        <td class="label">${escapeHtml(k)}</td>
        <td>${escapeHtml(valText(v))}</td>
      </tr>
    `;
  }

  body += `
      </tbody>
    </table>
    <details style="margin-top: 10px;">
      <summary style="cursor: pointer; color: #60a5fa; font-size: 12px;">Raw JSON Properties</summary>
      <pre style="background: #15161a; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 11px; color: #cbd5e1;">${escapeHtml(JSON.stringify(p, null, 2))}</pre>
    </details>
  </div>`;

  $("#modal-body").html(body);
  $("#section-modal").modal("show");
}

function setupInteractions() {
  $(".section-segment, .section-card").off("click").on("click", function () {
    const songIdx = $(this).closest(".song-block").data("idx") || 0;
    const secIdx = +$(this).data("idx");
    const song = currentSongs[songIdx];
    if (song && song.sections && song.sections[secIdx]) {
      const layout = computeSongLayout(song);
      openSectionModal(layout.placed[secIdx]);
    }
  });
}

/* ── Playback Metronome Simulator ───────────────────────── */

function togglePlayback() {
  if (isPlaying) {
    clearInterval(playbackTimer);
    isPlaying = false;
    $("#play-btn").removeClass("negative").addClass("teal").html('<i class="play icon"></i>');
    $(".timeline-playhead").css("left", "0%");
  } else {
    isPlaying = true;
    $("#play-btn").removeClass("teal").addClass("negative").html('<i class="stop icon"></i>');
    playProgress = 0;
    playbackTimer = setInterval(() => {
      playProgress += 0.005;
      if (playProgress > 1) {
        togglePlayback();
        return;
      }
      $(".timeline-playhead").css("left", `${playProgress * 100}%`);
    }, 100);
  }
}

/* ── Wiring ─────────────────────────────────────────────── */

async function loadExamples() {
  const res = await fetch("/api/examples");
  const files = await res.json();
  const $sel = $("#file-select");
  $sel.empty();
  files.forEach(f => $sel.append(`<option value="${f}">${f}</option>`));
  $sel.dropdown();
  if (files.length) {
    $sel.val(files[0]);
    load(files[0]);
  }
}

async function load(file) {
  $("#main, #error-banner").attr("hidden", true);
  setStatus("loading", `parsing ${file}…`);
  try {
    const res = await fetch("/api/parse?file=" + encodeURIComponent(file));
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);

    renderSongs(data);
    $("#main").attr("hidden", false);
    setStatus("ok", `${data.length} song(s) loaded`);

    if (data[0] && data[0].meta && data[0].meta.bpm) {
      $("#tempo-ticker").text(`BPM: ${data[0].meta.bpm}`);
    } else {
      $("#tempo-ticker").text("BPM: 120");
    }
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

  $(".view-toggle button").on("click", function () {
    $(".view-toggle button").removeClass("active");
    $(this).addClass("active");
    const view = $(this).data("view");
    currentView = view;
    $(".view-panel").hide();
    $(`.view-${view}`).show();
  });

  $("#play-btn").on("click", togglePlayback);

  loadExamples();
});
