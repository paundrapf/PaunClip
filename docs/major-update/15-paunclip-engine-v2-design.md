# PaunClip Engine V2 Design

## Purpose

This document defines the next major technical focus for **PaunClip**:

> **Fix the output-quality engine first. Migrate to web second.**

The current codebase already has a strong workflow shell:
- Campaigns
- queue
- deterministic sessions
- Session Workspace
- clip jobs and revisions
- provider routing
- browser/results/session browsing

What is still not professional enough is the **engine that creates the actual clips**.

This document is the formal design for that engine layer.

---

## 1. Executive Decision

The next version should **not** start by migrating Tkinter to web.

It should start by upgrading the rendering/quality engine so that:
- clips look professional
- rendering is efficient
- hook and caption assets are stable
- tracking behaves predictably
- output is trustworthy enough to scale

Only after the engine is stable should PaunClip be migrated to a web interface.

---

## 2. Current State of the Product

### Already strong
- campaign-centric workflow
- persistent queue and deterministic session reuse
- session workspace shell
- stage-aware clip artifacts
- clip jobs, revisions, and dirty-stage state
- OpenAI API vs Groq Rotate runtime model
- Hook Maker provider-aware runtime support
- watermark and source-credit overlays

### Still weak
- portrait/reframing output quality
- caption timing and style quality
- hook visual quality
- download efficiency
- full confidence in tracking behavior

### Summary
PaunClip is already a strong **content operations shell**.

It now needs a strong **content rendering engine**.

---

## 3. Engine V2 Goals

## Primary goals
1. output quality must feel professional
2. default behavior must be stable and trustworthy
3. rerenders must stay incremental
4. each engine mode must match content context
5. future web migration must be easy because engine logic is modular

## Secondary goals
1. lower render cost
2. lower bandwidth cost
3. easier QA / debug
4. easier future open-source contributions

---

## 4. Core Engine Principle

The engine must become **mode-driven**, not one-size-fits-all.

Bad model:
- always face track
- always use one caption logic
- always use one hook style

Correct model:
- classify the scene or content type first
- choose the correct reframing/caption/hook strategy
- then render with stage-aware artifacts

---

## 5. Engine Architecture Overview

```text
[Source Input]
    |
    +--> Source Resolver
    |       - YouTube single video
    |       - Local file
    |       - Campaign queue item
    |
    +--> Ingestion Layer
    |       - metadata
    |       - subtitle acquisition
    |       - audio-first or full-video mode
    |
    +--> Transcript Layer
    |       - ASR
    |       - word timing normalization
    |       - optional diarization later
    |
    +--> Highlight Layer
    |       - candidate selection
    |       - ranking
    |       - user approval
    |
    +--> Clip Engine
            - Stage A: Cut
            - Stage B: Reframe
            - Stage C: Hook Assets
            - Stage D: Caption Assets
            - Stage E: Overlay Assets
            - Stage F: Final Compose
```

---

## 6. Reframing Engine V2

This is the largest engine decision.

## 6.1 User-facing modes

User-facing reframing choices should describe the **result**, not the library.

### `Center Crop`
- default
- fastest
- most stable
- FFmpeg-native
- good for many talking-head clips

### `Podcast Smart`
- smart single-speaker or active-speaker framing
- designed for podcasts, interviews, and reaction clips
- should use confidence-aware speaker selection

### `Split Screen`
- for two important speakers
- often better than panning between faces
- should be selectable explicitly or chosen by policy when needed

### `Sports Beta`
- specialized tracking mode
- object/ball-focused
- not default
- domain-specific and experimental

### `Manual Lock` (future)
- user pins crop behavior or subject selection manually

---

## 6.2 Internal reframing decision tree

```text
Is content single-speaker and stable?
  -> use Center Crop or Podcast Smart

Is content two-speaker interview/podcast?
  -> use Podcast Smart
  -> if rapid switching / ambiguity: Split Screen

Is content object-driven (sports/product focus)?
  -> use Sports Beta or object-follow mode

Is confidence low or tracking noisy?
  -> fall back to Center Crop
```

This is critical:

> a professional engine must know when **not** to track.

---

## 6.3 Center Crop

### Purpose
Provide a deterministic, high-trust baseline that always works.

### Implementation
- FFmpeg-native crop + scale
- no Python frame loop
- one pass

### Why it matters
- fastest option
- stable output
- perfect fallback when smart logic is uncertain
- ideal default mode while quality engine matures

---

## 6.4 Podcast Smart

### Purpose
Produce professional podcast/interview framing.

### Required sublayers

#### A. Scene classification
Classify clip into:
- `single_speaker`
- `two_speaker`
- `group`
- `uncertain`

#### B. Candidate tracks
Build candidate face/person tracks with:
- visibility
- size
- center bias
- confidence history

#### C. Speaking signal
Use one or more of:
- transcript timing
- diarization later
- audio-visual active speaker score later

#### D. Camera policy
Decide whether to:
- lock to one speaker
- smoothly follow
- switch speakers
- use split-screen
- fall back to center crop

#### E. Smoothing policy
Always apply:
- deadzone
- hysteresis
- minimum hold time
- max pan speed
- eased transitions

### Professional constraint
For multi-speaker clips:
- do not switch focus on every syllable
- do not let crop path oscillate left-right repeatedly
- prefer split-screen or wider stable framing when confidence is weak

---

## 6.5 Split Screen

### Purpose
Provide a professional alternative to unstable active-speaker panning.

### Best for
- two-speaker podcasts
- interviews
- debate / reaction formats

### Why it matters
In many two-person clips, split-screen is more professional than “camera jumping” between speakers.

### Rendering model
- detect left and right subjects
- crop them separately
- compose into stacked or side-by-side layout appropriate for 9:16

---

## 6.6 Sports Beta

### Purpose
Support object-centric tracking as an advanced mode.

### Important warning
Sports tracking should not be treated as “face tracking but for balls.”

### Sports Beta should be its own engine mode
with:
- sport-specific object detection
- temporal tracking / trajectory smoothing
- confidence fallback behavior
- play-zone or context-zone fallback when object disappears

### Recommendation
Do not ship this as a default mode.
Ship it later as an advanced / experimental mode after podcast quality is solved.

---

## 7. Caption Engine V2

The current caption engine is not yet good enough for pro output.

## Problems to solve
- duplicate/stacked lines
- overlapping ASS events
- flicker between words
- weak style consistency
- hardcoded language assumptions
- incomplete use of `caption_mode` / `caption_override`

## Target architecture

### Layer 1 — transcript normalization
- normalize word timing overlaps
- remove invalid zero-duration words where necessary
- preserve word-level timing for karaoke mode

### Layer 2 — caption segmentation
Do not rely on naive fixed word chunks alone.

Segment by:
- punctuation
- pause duration
- maximum characters
- maximum visible duration
- emphasis word availability

### Layer 3 — style presets
Provide style presets like:
- `Karaoke Bold`
- `Clean Lower Third`
- `Minimal`
- `Podcast Heavy`

### Layer 4 — output artifacts
- `caption_words.json`
- `caption_segments.json`
- `captions.ass`

## Default style recommendation
`Karaoke Bold`
- uppercase
- strong white base text
- yellow highlighted active word
- bottom-safe placement
- no overlap and no flicker

---

## 8. Hook Engine V2

The hook system must be redefined as an asset engine, not a frame-loop effect.

## Subsystems

### A. Hook spec
- hook text
- style preset
- duration
- top safe-zone placement
- motion/animation strategy

### B. Hook audio
- provider
- model
- voice
- speed
- response format
- cached asset output

### C. Hook visual renderer
- moving video base, not a frozen awkward frame by default
- FFmpeg-native text layer or equivalent professional renderer
- cross-platform font strategy
- proper background panel options

### D. Hook artifacts
- `hook_audio.wav`
- `hook_video.mp4`
- `hook_meta.json`

## Style presets
- `Minimal Top`
- `Bold Banner`
- `Soft Story`
- `Breaking News`

## Recommended default
`Minimal Top`
- dark translucent panel
- safe top placement
- clean bold font
- no face obstruction

---

## 9. Overlay Engine V2

Two overlay families remain important:

### A. Brand Watermark
- logo / brand identity
- opacity / size / position

### B. Auto Source Video
- source attribution
- default bottom-center
- opacity / size / style

## Design principle
These should remain composition-stage artifacts whenever possible.

Changing them should not trigger portrait or transcript regeneration.

---

## 10. Asset and Artifact Layer

Per clip, PaunClip should converge on this artifact model:

```text
clip/
  artifacts/
    cut.mp4
    portrait.mp4
    crop_track.json
    hook_audio.wav
    hook_video.mp4
    caption_words.json
    caption_segments.json
    captions.ass
    overlays.json
  data.json
  master.mp4
```

## Why this matters
- rerender is faster
- debugging is easier
- quality checks are easier
- future web worker architecture becomes much cleaner

---

## 11. Ingestion Engine V2

## Modes

### `Compatibility Mode`
- full video first
- safest fallback

### `Optimized Mode`
- download audio first
- transcribe
- detect highlights
- then download video by segment with buffer
- final trim with FFmpeg

## When to add it
After output quality is stabilized.

Because lower bandwidth is useful, but not enough if the clip still looks bad.

---

## 12. Session Workspace Role in Engine V2

The Session Workspace remains the **operator shell**.

### It should expose
- source context
- selected highlights
- hook text
- caption mode
- reframing mode
- TTS voice
- overlay choices
- render/revision controls

### It should not own
- raw engine logic
- direct FFmpeg orchestration logic

The workspace should describe intent; the engine should execute it.

---

## 13. Engine / UI boundary for future web migration

This is crucial.

Before migrating to web, the engine should be organized so that the UI layer only does:
- load state
- edit state
- trigger engine jobs
- display output

### Engine modules should become separable into services like:
- source ingestion service
- transcript service
- highlight service
- reframing service
- hook service
- caption service
- composition service

### Why
Once those boundaries exist, web migration becomes an interface problem, not a rendering rewrite.

---

## 14. Future Web Flow

After Engine V2 is stable, the web product should mirror the current mental model, not invent a new one.

## Recommended web flow

```text
Dashboard
 -> Campaigns
    -> Campaign Detail
       -> Video Queue
          -> Session Workspace
             -> Clip Review
             -> Rerender
             -> Output Library
```

## Suggested stack
- Frontend: Next.js / React
- API: FastAPI
- Workers: Python queue workers
- Storage: local filesystem first, object storage later

## Why web later
Because web helps testing, iteration, and contributor friendliness — but it does not solve poor output quality by itself.

---

## 15. Recommended roadmap

## V2-A — Output Quality Engine
1. Lock reframing mode strategy
2. Rewrite caption engine
3. Rewrite hook engine
4. Fix timing/language correctness
5. Finalize artifacts/contracts

## V2-B — Efficiency
6. optimized download mode
7. segment video download
8. queue/parallel efficiency improvements

## V2-C — Engine extraction
9. separate engine services from Tkinter orchestration
10. define API contracts for future UI migration

## V2-D — Web Migration
11. Next.js frontend
12. FastAPI orchestration
13. worker-based rendering

---

## 16. Locked recommendation

If PaunClip wants to become professional while staying sane technically:

### default mode
`Center Crop`

### smart mode
`Podcast Smart`

### alternative mode
`Split Screen`

### advanced experimental mode
`Sports Beta`

This is the cleanest path toward a trustworthy output engine.

---

## Final statement

PaunClip does **not** need a new interface first.

PaunClip needs a **better engine first**.

Once the engine is good enough that the rendered output feels professional and reliable, the migration to web becomes the easy part — and a much more worthwhile one.
