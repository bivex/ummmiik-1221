# Song DSL

A declarative domain-specific language (DSL) for **songwriting, music composition, arrangement, chord charts, and lyrics**, powered by an **ANTLR 4** parser.

A `.song` file describes the *musical structure* of a track — its metadata (BPM, key, time signature, genre, artist), an ordered list of musical sections (`intro`, `verse`, `pre_chorus`, `chorus`, `bridge`, `solo`, `drop`, `outro`) timed by musical bars or seconds, and per-section properties for chord progressions, lyrics, vocal arrangements, instrumentation, and dynamics.

It is designed to be writable by musicians, songwriters, and AI agents, and machine-parseable by DAWs, sheet music tools, lyric video generators, and AI music models (Suno, Udio).

```song
define MAIN_CHORDS = [Am, F, C, G]

song "Midnight Echoes" {
  meta {
    bpm:            124
    key:            Am
    time_signature: 4/4
    genre:          "Indie Pop"
    artist:         "The Antigravity Band"
    tags:           #indie #pop #hits2026
  }

  intro (4 bars) {
    chords:     [Am, F]
    guitar:     "clean arpeggio" #reverb
    dynamics:   piano
  }

  verse "1" (8 bars) {
    chords:     $MAIN_CHORDS
    lyrics:     """
      Walking down the midnight avenue
      Raindrops reflecting golden hues
      Searching for the words I couldn't say
      Before the morning washed it all away
    """
    vocal:      "lead vocal" #intimate #dry
    drums:      "soft kick and snare"
  }

  chorus (8 bars) {
    chords:     [F, G, C, Am]
    lyrics:     """
      We are the echoes in the dark!
      Lighting a fire from a spark!
    """
    vocal:      "belted lead with harmonies" #loud
    drums:      "full groove" #punchy
    dynamics:   forte
  }
}
```

---

## Quick start

Requires Java 17+ and `antlr4` (Homebrew: `brew install antlr`).

```bash
make              # generate + compile the ANTLR parser and SongToJson listener
make test         # parse every examples/*.song, fail on any error
make test-errors  # parse every examples/broken/*.song, verify negative tests
make json F=cookbook    # emit a JSON timeline/arrangement
make tree F=cookbook    # print the parse tree for examples/cookbook.song
make tokens F=hello     # dump the token stream
make gui F=cookbook     # graphical parse-tree viewer
make viz          # start the web visualizer (http://localhost:8000)
make clean        # remove generated artifacts
```

### Project Files

| File | Purpose |
|---|---|
| [`Song.g4`](file:///Volumes/External/Code/ummmiik-1221/Song.g4) | The ANTLR4 grammar (lexer + parser for Song DSL). |
| [`SongToJson.java`](file:///Volumes/External/Code/ummmiik-1221/SongToJson.java) | Reference consumer — walks the parse tree, resolves `$refs`, chords, and emits JSON. |
| [`examples/`](file:///Volumes/External/Code/ummmiik-1221/examples) | Valid song programs: `hello.song`, `cookbook.song`, `pop_anthem.song`, `rock_ballad.song`, `electronic_drop.song`. |
| [`examples/broken/`](file:///Volumes/External/Code/ummmiik-1221/examples/broken) | Intentionally invalid programs for negative testing. |
| [`viz/`](file:///Volumes/External/Code/ummmiik-1221/viz) | Interactive Song Studio web visualizer (Timeline track, Lyrics sheet, Chords grid). |
| [`SKILL.md`](file:///Volumes/External/Code/ummmiik-1221/SKILL.md) | Quality standards and specifications for music composition and arrangement. |
| [`Makefile`](file:///Volumes/External/Code/ummmiik-1221/Makefile) | Build & test harness. |

---

## Language Reference

### Program Structure

A song file contains global constants (`define`), metadata blocks, and one or more track declarations:

```song
<songKind> "<title>" { <statement>* }
```

`<songKind>` is one of `song`, `track`, `beat`, `piece`. The title is optional.

### Musical Sections

The language provides dedicated first-class keywords for song sections:

| Section Keyword | Purpose | Example |
|---|---|---|
| `verse` | Verses (Куплеты) | `verse "1" (8 bars) { ... }` |
| `chorus` | Chorus / Hook (Припевы) | `chorus (8 bars) { ... }` |
| `pre_chorus` / `prechorus` | Pre-chorus build-up | `pre_chorus (4 bars) { ... }` |
| `bridge` | Bridge (Бридж) | `bridge (8 bars) { ... }` |
| `intro` | Introduction | `intro (4 bars) { ... }` |
| `outro` | Outro / Coda | `outro (4 bars) { ... }` |
| `solo` | Instrumental Solo | `solo "Guitar" (8 bars) { ... }` |
| `drop` | EDM Drop / Climax | `drop "Main Drop" (16 bars) { ... }` |
| `hook` | Catchy motif/riff | `hook (4 bars) { ... }` |
| `section` | Generic section | `section "Breakdown" { ... }` |

Section names and timings are both optional:
```song
verse                     { ... }   // anonymous, ordered
verse "1"                 { ... }   // named
verse (8 bars)            { ... }   // duration in musical bars
verse (1 .. 8 bars)       { ... }   // bar range
verse (0s - 30s)          { ... }   // explicit time range
```

### Musical Timing

Song timing supports both **musical bars/measures** and **chronological seconds**:
- **Bars & Measures:** `8 bars`, `4 bar`, `16 measures`, `32 beats`
- **Time points:** `30s`, `500ms`, `1.5m`, `2m`
- **Ranges:** `(1 .. 8 bars)`, `(1 - 8 bars)`, `(0s - 30s)`

### Values

| Kind | Example | Notes |
|---|---|---|
| **Multiline Lyrics** | `""" Line 1\nLine 2 """` | Triple-quoted multiline strings preserving formatting. |
| **Single-line String** | `"Hello"`, `'Hello'` | Escapes `\n \t \" \\`. |
| **Chords** | `[Am, F, C, G]`, `C#m`, `Bb`, `F#m7`, `Dsus4`, `C/E` | First-class chord symbols with sharps, flats, extensions, and inversions. |
| **Time Signature** | `4/4`, `3/4`, `6/8`, `7/8` | Native composite token. |
| **Duration** | `8 bars`, `16 beats`, `30s`, `500ms` | Number + musical or time unit. |
| **BPM / Number** | `120`, `78`, `3.5` | Integer or decimal. |
| **Reference** | `$MAIN_CHORDS`, `$TEMPO` | Resolves to a `define` constant. |
| **Style Tags** | `#intimate`, `#punchy`, `#reverb` | Trailing stylistic modifiers. |
| **Attribution** | `by "Artist"` or `by $REF` | Songwriter, producer, or session player credits. |
| **Lists** | `[Am, F, C, G]`, `["drums", "bass"]` | Comma-separated with optional trailing comma. |

### Constants (`define`)

```song
define MAIN_CHORDS = [Am, F, C, G]
define TEMPO = 124
define PRODUCER = "DJ Apricot"

song "My Track" {
  meta {
    bpm:      $TEMPO
    producer: $PRODUCER
  }
  verse (8 bars) {
    chords: $MAIN_CHORDS
  }
}
```

Constants are **file-scoped**, **last write wins**, and allow forward references (`$REF` before `define`).

---

## Consuming the AST (SongToJson)

`SongToJson.java` parses any `.song` file, resolves all references, and outputs a clean JSON model:

```bash
make json F=cookbook
```

```json
[
  {
    "kind": "song",
    "title": "Midnight Echoes",
    "meta": {
      "bpm": 124,
      "key": "Am",
      "time_signature": "4/4",
      "genre": "Indie Pop",
      "artist": "The Antigravity Band",
      "tags": ["indie", "pop", "hits2026"]
    },
    "sections": [
      {
        "type": "intro",
        "name": "Intro",
        "timing": { "duration": "4 bars" },
        "props": {
          "chords": ["Am", "F"],
          "guitar": { "value": "clean arpeggio", "tags": ["reverb"] },
          "dynamics": "piano"
        }
      },
      {
        "type": "verse",
        "name": "1",
        "timing": { "duration": "8 bars" },
        "props": {
          "chords": ["Am", "F", "C", "G"],
          "lyrics": "Walking down the midnight avenue\nRaindrops reflecting golden hues",
          "vocal": { "value": "lead vocal", "tags": ["intimate", "dry"] }
        }
      }
    ]
  }
]
```

---

## Interactive Visualizer (Song Studio)

Launch the web visualizer:

```bash
make viz
# Open http://localhost:8000 in your browser
```

Features:
- **DAW Timeline Track:** Proportional section blocks calculated using BPM and bar lengths, with playhead simulation.
- **Chord Progression Display:** Chords displayed right on the timeline and section cards.
- **Lyrics Sheet View:** Clean formatted lyrics book with chords above each section.
- **Chords Grid View:** Comprehensive harmony overview across all sections.
- **Detail Modal:** Deep inspection of section vocals, instrument layers, dynamics, and raw JSON.
