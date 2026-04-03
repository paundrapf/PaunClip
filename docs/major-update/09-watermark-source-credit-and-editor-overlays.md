# Watermark, Source Credit, and Editor Overlay Design

## Summary

The repo already has two related features today:

1. **Image Watermark**
2. **Credit Watermark** (text-based channel credit)

This is good news, because the user-requested future flow can build on real existing features instead of inventing them from zero.

---

## 1. What already exists today

## Image watermark
Observed in:
- `pages/settings/watermark_settings.py`
- `clipper_core.py` watermark application path

### Current supported capabilities
- enable/disable
- image file selection
- position
- opacity
- scale

### Current limitations
- UI is image-focused
- preview is basic
- no preset system
- GIF is not first-class

---

## Credit watermark
Observed in:
- `pages/settings/credit_watermark_settings.py`
- `clipper_core.py` credit rendering path

### Current supported capabilities
- enable/disable
- text position
- text size
- opacity

### Current meaning
The current credit watermark is already very close to the requested:

> “Auto Source Video” / source channel label at the bottom center

So the future product should **reuse and rename/expand** this feature, not replace it.

---

## 2. Recommended product wording

### Rename in UX
Instead of `Credit Watermark`, use one of:
- `Auto Source Video`
- `Auto Source Credit`

Recommended user-facing label:

**Auto Source Video**

### Why
It matches the user's business intent better:
- visible attribution
- permission/compliance support
- mutual benefit with source channel owner

---

## 3. Watermark model for major update

The editor should support **two overlay families**:

### A. Brand Watermark
Purpose:
- creator brand / logo / identity

### B. Source Credit Overlay
Purpose:
- source channel attribution
- optional source video attribution later

These should be modeled separately.

---

## 4. Brand Watermark spec

### Required settings
- enabled
- asset path
- position_x
- position_y
- opacity
- scale

### Nice-to-have additions
- preset name
- safe-area snapping
- top-right / top-left / bottom-right / bottom-left quick anchors

### Recommended defaults
- enabled: false
- position: top-right
- opacity: 0.8
- scale: 0.15

---

## 5. GIF support

## Should it exist?
Yes, but as an **optional advanced mode**, not the first required implementation.

### Why not first-wave mandatory
- animated overlay complicates rendering cost
- requires a more expensive overlay path
- can interact badly with GPU/encode stages if not designed carefully

### Recommended rollout

#### Phase 1
- static PNG/JPG watermark first-class

#### Phase 2
- GIF watermark support as an advanced overlay type

### Recommended implementation direction later
- pre-render GIF watermark to overlay video asset
- cache overlay asset
- composite at final stage

This keeps the main clip pipeline simpler.

---

## 6. Auto Source Video / Source Credit spec

This should evolve from the current credit watermark system.

### Required settings
- enabled
- display_mode
- position_x
- position_y
- opacity
- size

### `display_mode` options

#### Phase 1
- `channel_name`

#### Phase 2
- `channel_name_with_prefix`
  - e.g. `Source: Dokter Tirta`
- `channel_and_video_title`

### Recommended default behavior
- bottom center
- opacity around 0.65–0.75
- text like:
  - `Source: {channel_name}`

This exactly supports the use case of attributing the original creator.

---

## 7. Editor behavior

The mini editor should expose overlays per clip.

### For each clip

#### Brand Watermark section
- enable/disable
- choose preset
- preview opacity
- preview scale

#### Auto Source Video section
- enable/disable
- choose display mode
- adjust opacity
- adjust size
- adjust position

### Important rule
Changing watermark or source-credit settings should not force:
- transcript regeneration
- highlight regeneration
- portrait analysis rerun

It should only invalidate the final composition-related stage.

---

## 8. Data contract suggestion

### Session defaults

```json
{
  "watermark_defaults": {
    "enabled": false,
    "preset": "default_brand"
  },
  "source_credit_defaults": {
    "enabled": true,
    "display_mode": "channel_name",
    "position_x": 0.5,
    "position_y": 0.95,
    "opacity": 0.7,
    "size": 0.03
  }
}
```

### Clip-level override

```json
{
  "editor": {
    "watermark_enabled": false,
    "watermark_preset": "default_brand",
    "source_credit_enabled": true,
    "source_credit_display_mode": "channel_name",
    "source_credit_opacity": 0.7
  }
}
```

---

## 9. UX recommendation

The major update should surface overlays in the clip editor, not hide them only in settings.

### Why
Users often want:
- campaign default settings
- but clip-level tweaks later

So the right model is:

### Settings
set global defaults and presets

### Session/Clip Editor
override per clip if needed

---

## 10. Final recommendation

### Current repo answer
Yes, the app **already has watermark support**.

### And yes, it already has the beginnings of your source-credit idea
The current `credit_watermark` is basically the seed of `Auto Source Video`.

### Best major-update direction
- keep both overlay families
- rename credit watermark in UX
- make both editable in the clip editor
- keep opacity controls
- add GIF support only after static overlays are stable
