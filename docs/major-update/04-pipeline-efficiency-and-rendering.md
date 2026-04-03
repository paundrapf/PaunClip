# Pipeline Efficiency and Rendering Design

## Summary

The current rendering system works, but several parts are more expensive than they need to be.

The biggest cost today is **portrait conversion**, followed by repeated downstream renders for hook/caption style changes.

This document explains what is slow now and how the major update should change the pipeline.

---

## 1. Current observed inefficiencies

## A. Portrait conversion is the biggest bottleneck

In the current codebase, portrait conversion does heavy per-frame CPU work.

### OpenCV path
- reads all frames once for analysis
- reads all frames again for crop/render
- writes a temporary portrait video frame by frame
- then merges audio afterward

### MediaPipe path
even heavier:
- RGB conversion
- face mesh processing
- multi-face scoring
- lip activity logic
- another full render pass
- final audio merge

### Consequence
One clip around 70–90 seconds can easily mean thousands of frame operations.

That is why one clip can feel much slower than expected.

---

## B. Current tracking is stable, but not truly smooth

The current tracking logic is oriented toward:
- median stabilization
- shot locking
- minimum shot duration
- thresholded switching

That reduces jitter, but visually it can look:
- blocky
- stepwise
- not like a smooth camera move

The user experience target is closer to:
- center-following
- fluid interpolation
- natural motion

---

## C. Warning: `Failed to write frame ####`

This warning currently appears inside the frame write loop.

### What it means architecturally
It indicates the video writing stage is not robust enough.

Potential issues include:
- unreliable success detection for `VideoWriter.write(...)`
- output writer instability
- file/codec mismatch
- downstream validation only happening too late

### What the major update should do
- treat frame writer health as a first-class render concern
- validate writer initialization and frame size invariants early
- fail fast with structured clip-job errors
- record failure in clip manifest, not only in console warnings

---

## D. Hook/caption edits are too expensive today

The current stage order is roughly:

1. cut
2. portrait
3. hook
4. captions
5. watermark
6. credit

That order is fine, but it becomes inefficient if every small edit causes too much rerendering.

---

## 2. Target stage architecture

Each clip should become a stage-aware render pipeline.

## Stages

### Stage A — source cut
Input:
- session source video
- clip time range

Output:
- `artifacts/cut.mp4`

### Stage B — portrait transform
Input:
- cut video
- tracking settings

Output:
- `artifacts/portrait.mp4`
- `source/crop_track.json`

### Stage C — hook asset
Input:
- hook text
- TTS provider/model/voice

Output:
- `artifacts/hook_audio.wav`
- `artifacts/hook_video.mp4`

### Stage D — caption asset
Input:
- transcript or caption override
- caption style

Output:
- `artifacts/captions.ass`
- `artifacts/caption_words.json`

### Stage E — final composition
Input:
- portrait base
- optional hook video
- optional captions
- optional watermark/credit

Output:
- `master.mp4`

---

## 3. Incremental rerender rules

This is the most important efficiency policy.

## If hook text changes only
Rebuild:
- Stage C
- Stage E

Do not rebuild:
- cut
- portrait

## If caption text or style changes only
Rebuild:
- Stage D
- Stage E

Do not rebuild:
- cut
- portrait
- hook unless hook settings changed too

## If trim changes
Rebuild:
- Stage A
- Stage B
- dependent downstream stages

## If tracking mode changes
Rebuild:
- Stage B
- downstream composition stages

This is what makes a mini editor practical.

---

## 4. Portrait conversion redesign

## Current weakness
Today the crop path is derived directly from per-frame detection plus stabilization.

## Recommended redesign

### Step 1 — sparse analysis
Do not run full heavy face analysis on every frame if not necessary.

Instead:
- detect every N frames
- collect anchor points
- store them in `crop_track.json`

### Step 2 — interpolation
Interpolate between anchor points to generate a smooth crop path.

### Step 3 — easing / smoothing
Apply low-pass smoothing or eased transitions so movement feels continuous.

### Step 4 — render from crop path
Use the crop path as the source of truth for the portrait render.

---

## 5. Tracking modes to support

### `center_lock`
- always center-biased
- simplest and fastest

### `speaker_lock`
- strongest face/activity lock
- similar to current behavior

### `smooth_follow`
- recommended default
- balances stability with motion continuity

### `cinematic_follow`
- slower, more polished motion
- not necessarily ideal for every short clip, but visually stronger

---

## 6. Hook rendering redesign

Current hook generation is too coupled to clip rendering.

### Better model
Hook should be treated as an asset pipeline:

1. synthesize TTS audio
2. build hook visual background
3. render hook text overlay
4. cache the result

Then final composition only combines assets.

### Benefits
- changing hook text rerenders only hook assets
- changing TTS voice rerenders only hook audio + dependent compose
- debugging TTS failures becomes easier

---

## 7. Caption pipeline redesign

Current caption generation should evolve toward reusable assets.

### Recommended artifacts
- `caption_words.json`
- `captions.ass`

### Caption modes
- `auto`
- `manual_override`
- `disabled`

### Why this matters
If the user changes caption text or style, the app should not behave like this is a full clip regeneration.

---

## 8. Render queue behavior

Each session should render selected clips through a queue.

### Clip statuses
- `pending`
- `rendering`
- `failed`
- `completed`
- `dirty_needs_rerender`

### Queue rules
- clip failures do not kill the entire session
- session failures do not kill the entire campaign
- retry failed clips only

---

## 9. Thumbnails and browse efficiency

Current browsing often has to inspect video files dynamically.

### Recommended change
Generate `thumb.jpg` during render and store its path in `data.json`.

That makes:
- session browser faster
- results faster
- browse faster

---

## 10. Practical outcome

If this design is implemented well:

- users stop paying the portrait cost repeatedly for simple text edits
- hook and caption changes become cheap
- clip failures become isolated and resumable
- tracking can become visually smoother
- the app feels much closer to a true production workspace
