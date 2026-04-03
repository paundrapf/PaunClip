# JSON Schema and State Machine

## Purpose

This document locks the key data contracts and lifecycle transitions for the major update.

It is intentionally more implementation-oriented than the earlier blueprint docs.

---

## 1. Campaign schema

```json
{
  "id": "camp_20260401_abcd",
  "name": "Podcast Medical Indonesia",
  "status": "active",
  "channel": {
    "url": "https://www.youtube.com/@example",
    "channel_id": "UCxxxx",
    "title": "Example Channel"
  },
  "defaults": {
    "clip_count": 5,
    "add_hook": true,
    "add_captions": true,
    "tracking_mode": "smooth_follow",
    "provider_preset": "groq_rotate",
    "watermark_preset": "default",
    "source_credit_enabled": true
  },
  "sync_state": {
    "last_synced_at": null,
    "last_seen_published_at": null,
    "next_page_token": null,
    "last_error": null
  },
  "created_at": "2026-04-01T08:00:00",
  "updated_at": "2026-04-01T08:15:00"
}
```

### Campaign statuses
- `active`
- `archived`

---

## 2. Session schema

```json
{
  "session_id": "20260401_074655",
  "campaign_id": "camp_20260401_abcd",
  "campaign_name": "Podcast Medical Indonesia",
  "stage": "highlights_found",
  "status": "highlights_found",
  "source": {
    "type": "youtube_channel_video",
    "channel_url": "https://www.youtube.com/@example",
    "video_url": "https://www.youtube.com/watch?v=abc123",
    "video_id": "abc123",
    "video_title": "Video title"
  },
  "video_path": "source/source.mp4",
  "srt_path": "source/subtitle.srt",
  "transcript_path": "source/transcript.json",
  "crop_track_path": null,
  "video_info": {},
  "transcription_method": "groq_whisper",
  "provider_snapshot": {
    "highlight_finder": {},
    "caption_maker": {},
    "hook_maker": {},
    "youtube_title_maker": {}
  },
  "highlights": [],
  "selected_highlight_ids": [],
  "clip_jobs": [],
  "last_error": null,
  "created_at": "2026-04-01T07:46:55",
  "updated_at": "2026-04-01T08:10:10",
  "completed_at": null
}
```

### Session stages
- `queued`
- `metadata_fetched`
- `downloaded`
- `transcribed`
- `highlights_found`
- `editing`
- `render_queued`
- `rendering`
- `completed`
- `partial`
- `failed`
- `cancelled`

### Rule
`stage` is the current pipeline position. `status` is the overall session health.

Example:
- stage = `rendering`
- status = `partial`

---

## 3. HighlightDraft schema

```json
{
  "highlight_id": "hl_001",
  "title": "Bapak Selamatkan Anak",
  "description": "...",
  "start_time": "00:32:13,494",
  "end_time": "00:33:39,228",
  "duration_seconds": 86.0,
  "virality_score": 8,
  "hook_text": "Bapaknya pingsan, anaknya teriak",
  "selected": true,
  "editor": {
    "hook_enabled": true,
    "captions_enabled": true,
    "caption_mode": "auto",
    "caption_override": "",
    "tracking_mode": "smooth_follow",
    "trim_start_offset_ms": 0,
    "trim_end_offset_ms": 0,
    "tts_voice": "autumn",
    "source_credit_enabled": true,
    "watermark_preset": "default"
  }
}
```

---

## 4. ClipJob schema

```json
{
  "clip_id": "clip_001",
  "highlight_id": "hl_001",
  "status": "pending",
  "dirty": false,
  "dirty_stages": [],
  "last_error": null,
  "current_revision": 1,
  "revisions": [
    {
      "revision": 1,
      "status": "completed",
      "data_path": "clips/clip_001/data.json",
      "master_path": "clips/clip_001/master.mp4",
      "rendered_at": "2026-04-01T10:00:00"
    }
  ]
}
```

### ClipJob statuses
- `pending`
- `rendering`
- `completed`
- `failed`
- `cancelled`
- `dirty_needs_rerender`

---

## 5. Clip `data.json` schema

```json
{
  "clip_id": "clip_001",
  "revision": 1,
  "highlight_id": "hl_001",
  "title": "Bapak Selamatkan Anak",
  "hook_text": "Bapaknya pingsan, anaknya teriak",
  "caption_mode": "auto",
  "caption_override": "",
  "tts_voice": "autumn",
  "tracking_mode": "smooth_follow",
  "source_credit_enabled": true,
  "watermark_preset": "default",
  "start_time": "00:32:13,494",
  "end_time": "00:33:39,228",
  "duration_seconds": 86.0,
  "status": "completed",
  "render_inputs": {
    "hook_enabled": true,
    "captions_enabled": true,
    "watermark_enabled": false,
    "source_credit_enabled": true,
    "provider_snapshot": {
      "hook_maker": {},
      "caption_maker": {}
    }
  },
  "artifact_paths": {
    "cut": "artifacts/cut.mp4",
    "portrait": "artifacts/portrait.mp4",
    "hook_audio": "artifacts/hook_audio.wav",
    "hook_video": "artifacts/hook_video.mp4",
    "caption_words": "artifacts/caption_words.json",
    "captions_ass": "artifacts/captions.ass",
    "master": "master.mp4",
    "thumb": "thumb.jpg"
  },
  "created_at": "2026-04-01T09:59:00",
  "last_rendered_at": "2026-04-01T10:00:00"
}
```

---

## 6. State machine rules

## Session transitions

### Ingestion path
- `queued` -> `metadata_fetched`
- `metadata_fetched` -> `downloaded`
- `downloaded` -> `transcribed`
- `transcribed` -> `highlights_found`

### Editing/render path
- `highlights_found` -> `editing`
- `editing` -> `render_queued`
- `render_queued` -> `rendering`
- `rendering` -> `completed`

### Partial/failure path
- any active stage -> `failed`
- `rendering` -> `partial` if some clips completed and some failed
- `failed` or `partial` -> `editing` on recovery

---

## ClipJob transitions

- `pending` -> `rendering`
- `rendering` -> `completed`
- `rendering` -> `failed`
- `completed` -> `dirty_needs_rerender` if edit spec changes
- `dirty_needs_rerender` -> `rendering` on rerender

---

## 7. Dirty-stage model

Dirty stages should be explicit.

Allowed values:
- `cut`
- `portrait`
- `hook`
- `captions`
- `compose`

### Examples

#### Hook text changes
dirty stages:
- `hook`
- `compose`

#### Caption text changes
dirty stages:
- `captions`
- `compose`

#### Trim changes
dirty stages:
- `cut`
- `portrait`
- `hook`
- `captions`
- `compose`

#### Tracking mode changes
dirty stages:
- `portrait`
- `hook`
- `captions`
- `compose`

---

## 8. Compatibility rules

These filenames must remain stable:
- `session_data.json`
- `data.json`
- `master.mp4`

These are already consumed by existing pages and should not be casually renamed.

---

## 9. Migration rule

If a legacy session lacks:
- `campaign_id`
- `clip_jobs`
- `provider_snapshot`

then the app should:
- infer sensible defaults
- place it in a legacy/default campaign
- mark migration as completed silently

This avoids breaking old work.
