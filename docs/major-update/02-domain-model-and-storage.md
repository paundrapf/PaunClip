# Domain Model and Storage Design

## Summary

This repo should continue to use **filesystem-backed manifests** as the primary persistence model.

That matches the existing codebase better than introducing a database immediately.

The major update should formalize five main entities:

1. Campaign
2. ChannelSource
3. Session
4. HighlightDraft
5. ClipJob / ClipRevision

---

## 1. Campaign

Represents a durable working bucket.

### Purpose
- group source channels and videos
- store defaults
- provide a stable home for sessions

### Recommended fields

```json
{
  "id": "camp_20260401_abcd",
  "name": "Podcast Medical Indonesia",
  "channel_url": "https://www.youtube.com/@example",
  "channel_id": "UCxxxx",
  "created_at": "2026-04-01T08:00:00",
  "updated_at": "2026-04-01T08:15:00",
  "status": "active",
  "defaults": {
    "clip_count": 5,
    "add_hook": true,
    "add_captions": true,
    "tracking_mode": "smooth_follow",
    "provider_preset": "groq_rotate"
  },
  "sync_state": {
    "last_synced_at": null,
    "last_seen_published_at": null,
    "next_page_token": null
  }
}
```

### Storage recommendation
- stored in campaign folder as `campaign.json`
- indexed in a lightweight root manifest later if needed for fast loading

---

## 2. ChannelSource snapshot

This is the persisted result of a channel fetch run.

### Purpose
- avoid refetching from YouTube immediately
- persist queue candidates
- support resume/offline review

### Recommended file
- `channel_fetch.json`

### Recommended fields

```json
{
  "campaign_id": "camp_20260401_abcd",
  "channel_url": "https://www.youtube.com/@example",
  "channel_id": "UCxxxx",
  "fetched_at": "2026-04-01T09:00:00",
  "videos": [
    {
      "video_id": "abc123",
      "title": "Video title",
      "published_at": "2026-03-31T10:00:00",
      "duration_seconds": 2679,
      "thumbnail_url": "...",
      "status": "new"
    }
  ]
}
```

---

## 3. Session

Session is already the right unit in the current repo.

Today the app already writes `output/sessions/<session_id>/session_data.json`.

That contract should be expanded, not replaced.

### Current fields already observed
- `session_dir`
- `video_path`
- `srt_path`
- `highlights`
- `video_info`
- `created_at`
- `status`
- `transcription_method`
- `clips_processed`

### Required new fields

```json
{
  "session_id": "20260401_074655",
  "campaign_id": "camp_20260401_abcd",
  "campaign_name": "Podcast Medical Indonesia",
  "source": {
    "type": "youtube_channel_video",
    "channel_url": "https://www.youtube.com/@example",
    "video_url": "https://www.youtube.com/watch?v=abc123",
    "video_id": "abc123"
  },
  "video_path": "...",
  "srt_path": "...",
  "transcript_path": "source/transcript.json",
  "crop_track_path": "source/crop_track.json",
  "video_info": {},
  "highlights": [],
  "selected_highlight_ids": [],
  "stage": "highlights_found",
  "status": "highlights_found",
  "transcription_method": "groq_whisper",
  "provider_snapshot": {
    "highlight_finder": {},
    "caption_maker": {},
    "hook_maker": {},
    "youtube_title_maker": {}
  },
  "clip_jobs": [],
  "last_error": null,
  "created_at": "2026-04-01T07:46:55",
  "updated_at": "2026-04-01T08:10:10"
}
```

### Why provider snapshot matters
Current config can change globally after the session is created.

Without a snapshot:
- rerender can use a different provider/model/voice than the original session
- behavior becomes nondeterministic

---

## 4. HighlightDraft

The current highlight object is a good start, but it needs editable session-level state.

### Existing useful fields
- `title`
- `description`
- `start_time`
- `end_time`
- `virality_score`
- `hook_text`

### Extended draft fields

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
    "tts_voice": "autumn"
  }
}
```

---

## 5. ClipJob / ClipRevision

Each selected highlight should become a stable clip identity.

Today the app writes clip folders, but the naming and persistence are not stable enough for revision-aware editing.

### Problems in current flow
- empty placeholder clip folders can appear
- final clip folders are timestamp-based, not identity-based
- partial clip failures are hard to represent cleanly

### Recommended model

#### ClipJob
- one logical clip per highlight selection

#### ClipRevision
- one render attempt or saved revision of that clip

### Example `data.json`

```json
{
  "clip_id": "clip_001",
  "revision": 3,
  "highlight_id": "hl_001",
  "title": "Bapak Selamatkan Anak",
  "hook_text": "Bapaknya pingsan, anaknya teriak",
  "caption_mode": "auto",
  "tts_voice": "autumn",
  "start_time": "00:32:13,494",
  "end_time": "00:33:39,228",
  "duration_seconds": 86.0,
  "status": "completed",
  "render_inputs": {
    "tracking_mode": "smooth_follow",
    "hook_enabled": true,
    "captions_enabled": true,
    "watermark_enabled": false
  },
  "artifact_paths": {
    "portrait": "artifacts/portrait.mp4",
    "hooked": "artifacts/hooked.mp4",
    "captioned": "artifacts/captioned.mp4",
    "master": "master.mp4",
    "thumb": "thumb.jpg"
  },
  "last_rendered_at": "2026-04-01T10:00:00"
}
```

---

## Recommended folder structure

```text
output/
  campaigns/
    <campaign_id>/
      campaign.json
      sessions/
        <session_id>/
          session_data.json
          channel_fetch.json
          source/
            source.mp4
            subtitle.srt
            transcript.json
            crop_track.json
          clips/
            <clip_id>/
              data.json
              edit.json
              master.mp4
              thumb.jpg
              artifacts/
```

---

## Compatibility strategy

The current repo already expects:
- `session_data.json`
- per-clip `data.json`
- `master.mp4`

So migration should preserve those filenames.

### Good compatibility rule
Add fields freely, but do not rename:
- `session_data.json`
- `data.json`
- `master.mp4`

### Legacy import strategy
If older sessions exist under `output/sessions/` without campaign metadata:
- import them into a virtual or default campaign
- e.g. `Legacy Imports`

That avoids breaking old output.
