---
name: songwriting-composition-standards
description: Agentic specification and quality standard for songwriting, music arrangement, chords, lyrics, and song structure. Defines target Destinations (end goals), strict Guardrails (harmonic consistency, prosody, structure, hook pacing), Definition of Done, and Execution Freedom for musicians, producers, and AI agents.
---

# Songwriting & Music Composition Standards: Agentic Specification Framework

This skill defines the operational framework for writing, arranging, and auditing music tracks using the **Song DSL** (`Song.g4`). It organizes musical production into four core pillars:
1. **Destinations (Конечные цели):** Target emotional impact, structural clarity, and commercial/artistic excellence.
2. **Guardrails (Жесткие ограничения):** Non-negotiable musical, harmonic, lyrical, and structural boundaries.
3. **Definition of Done (Критерии качества):** Verifiable criteria required before a composition is finalized.
4. **Execution Freedom (Творческая свобода):** Autonomy over genre, voicing, instruments, and themes within defined constraints.

---

## 1. Destinations (Целевые состояния композиции)

Every song composition must target the following outcomes:

- **Destination 1: Structural & Narrative Cohesion**
  Clear progression through intro, verses, chorus, and bridge, maintaining listener interest with tension and release.

- **Destination 2: Instant Hook Recognition & Memorability**
  A distinct musical or lyrical motif (hook/chorus) recognizable within the first 15–30 seconds.

- **Destination 3: Production & Arrangement Balance**
  Well-defined frequency spectrum (lows, mids, highs), distinct instrumental layers, and clear dynamic contrast between sections.

- **Destination 4: Harmonic & Prosodic Integrity**
  Natural alignment between lyrical stress, syllabic rhythm, and musical beat (prosody), with intentional chord voicings and progressions.

---

## 2. Guardrails (Жесткие ограничения композиции)

Guardrails are hard, non-negotiable boundaries. Any breach requires revision.

### 2.1 Structural & Timing Guardrails
- **Guardrail 1: Bar & Beat Consistency** — Sections must be mathematically consistent with the time signature (standard 4, 8, 16, or 32 bar increments unless an intentional asymmetric meter is defined).
- **Guardrail 2: Section Differentiation** — Verse and Chorus cannot share identical instrumentation, vocal delivery, and dynamic level simultaneously.
- **Guardrail 3: Bridge Purpose** — The bridge must introduce harmonic novelty (new chord or relative key), rhythmic variation, or emotional shift.

### 2.2 Harmonic & Chord Guardrails
- **Guardrail 4: Key Centering** — Chords must either belong to the declared key/mode or represent intentional modal interchange / secondary dominants.
- **Guardrail 5: Cadence Resolution** — Verses and pre-choruses must resolve or build appropriate harmonic tension leading cleanly into the chorus tonic.

### 2.3 Lyrical & Vocal Prosody Guardrails
- **Guardrail 6: Syllabic Fit (Natural Prosody)** — No awkward stretching or misaccenting of words across bar lines (stressed syllables must land on downbeats or accented syncopations).
- **Guardrail 7: Rhyme & Cadence Scheme** — Establish an intentional rhyme scheme per section (e.g. AABB, ABAB, or AAAA) without forced, cliché filler rhymes.
- **Guardrail 8: Vocal Range Feasibility** — Vocal melodies and harmonies must remain within realistic vocal tessituras for the designated singer type.

### 2.4 Arrangement & Dynamics Guardrails
- **Guardrail 9: Frequency Separation** — Avoid conflicting low-frequency instruments (e.g. 808 sub and heavy kick drum competing without sidechain or register split).
- **Guardrail 10: Dynamic Arc** — Songs must have a distinct dynamic journey (e.g. quiet verse → crescendo pre-chorus → explosive chorus → stripped-down bridge).

---

## 3. Definition of Done (Критерии завершенности)

Before a `.song` script or arrangement is signed off:

### 3.1 Metadata Checklist
- [ ] `bpm` is specified and matches the tempo feel of the genre.
- [ ] `key` and `time_signature` are explicitly declared.
- [ ] `genre` and `mood` style tags are assigned.

### 3.2 Musical Content Verification
- [ ] Every section has explicit bar timing (e.g. `(8 bars)` or `(4 bars)`) or second timing.
- [ ] Chord progressions are declared for every section where harmony is present.
- [ ] Multi-line lyrics (`"""..."""`) are written with natural phrasing and correct stanza breaks.
- [ ] Vocal part descriptions include character and processing tags (e.g. `#lead #intimate`, `#wide #reverb`).
- [ ] Instrumental roles (drums, bass, guitar, synth, piano) are defined per section.

---

## 4. Execution Freedom (Творческая свобода)

Within these Guardrails and DoD:
- **Genre & Style:** Total freedom across pop, rock, metal, hip-hop, R&B, jazz, ambient, EDM, folk, or classical.
- **Chord Complexity:** Choose from simple 3-chord folk progressions to advanced jazz extensions (maj7, sus4, add9, slash chords).
- **Lyrical Themes:** Storytelling, abstract emotion, social commentary, party anthem, introspection, or ballad.
- **Sound Design & Instrumentation:** Free choice of acoustic, electric, orchestral, or digital synthesis.
