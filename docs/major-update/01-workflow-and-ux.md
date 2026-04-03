# Workflow and UX Design

## Summary

The future app should feel like a **workspace**, not a one-shot wizard.

Today the app behaves mostly like:

`Home -> Processing -> Highlight Selection -> Clipping -> Results`

The target flow should become:

`Campaigns -> Campaign Detail -> Video Queue -> Session Workspace -> Clip Revisions -> Export/Upload`

This preserves the strengths of the current app while removing awkward transitions and dead ends.

---

## Current workflow reality

Observed from the codebase:

- `app.py` owns all page registration and navigation.
- `processing_page.py` is phase 1 only.
- `highlight_selection_page.py` is the handoff between phase 1 and phase 2.
- `clipping_page.py` is phase 2 progress only.
- `results_page.py` and `browse_page.py` are mostly output consumers.
- `session_browser_page.py` already proves that the app wants resume behavior.

The problem is not that the screens are wrong. The problem is that the current flow is still too narrow:

- one source video at a time
- one session active in memory
- too little persisted editor state
- too little queue/state visibility

---

## Target UX model

## 1. Campaigns page

This becomes the real home screen.

### What the user sees
- campaign list
- create campaign button
- rename action
- archive action
- recent sessions summary
- optional quick entry for one-off local/manual work

### What a campaign represents
- a content operation bucket
- usually tied to one channel, niche, or content goal
- stores defaults that should apply to many videos

### Campaign card fields
- campaign name
- linked channel URL
- total videos fetched
- queued videos count
- failed videos count
- completed clips count
- last activity

### Buttons that must never be dead
- `Open Campaign` only if campaign exists
- `Fetch Videos` only if a valid channel URL exists
- `Resume Failed Sessions` only if failed sessions exist
- `Archive` always available

---

## 2. Campaign detail page

This page is the center of ingestion and queue management.

### Top section
- campaign name
- channel URL
- sync status
- provider preset summary
- default clip settings summary

### Main section: video queue
Every video fetched from the channel becomes a queue row.

### Each row should show
- thumbnail
- title
- publish date
- duration
- status
- last error if any
- action buttons

### Video statuses
- `new`
- `queued`
- `downloading`
- `transcribing`
- `highlights_found`
- `editing`
- `rendering`
- `completed`
- `failed`
- `skipped`

### Per-video actions
- queue
- open session
- retry
- skip
- remove from queue

### Bulk actions
- fetch latest videos
- queue all new
- process selected
- retry failed
- filter by status

This page should feel like an operations dashboard, not a single-run form.

---

## 3. Session workspace

This is the most important screen in the major update.

It replaces the idea that highlight selection and clipping are separate mental models. A session should be where the user can inspect, edit, and render work for one source video.

### Recommended layout

#### Left panel
- source video info
- transcript source
- highlight list
- highlight scores and durations

#### Middle panel
- active highlight preview
- editable metadata

#### Right panel
- rendering options
- TTS/hook/caption controls
- tracking profile controls
- render queue actions

### Tabs or sections

#### A. Source
- source video metadata
- transcript/transcription method
- subtitles present or generated
- provider snapshot used for highlight generation

#### B. Highlights
- list of detected highlights
- checkbox to include/exclude
- editable title
- editable description
- editable hook text

#### C. Clip Editor
- Add Hook toggle
- Add Caption toggle
- hook text editor
- TTS voice selector
- caption source mode:
  - AI auto
  - manual override
  - disabled
- trim adjustment
- tracking mode selector
- optional preview render action

#### D. Render Queue
- per-clip status
- queued
- rendering
- failed
- completed
- retry failed clips

#### E. Output
- clip revisions
- preview clips
- export/upload actions

---

## 4. Mini preview editor

This should be a **spec editor**, not a full nonlinear editor.

The goal is to make common changes efficient:

- change hook text
- change caption mode/text
- change TTS voice
- tweak trim a little
- change face tracking mode

### What it should NOT try to be at first
- full timeline editor
- frame-accurate drag UI
- arbitrary overlay composition system

That would dramatically raise complexity and slow down delivery.

### Efficient editing rules

#### If only hook text changes
- regenerate TTS
- rebuild hook stage
- reuse portrait base

#### If only caption text/style changes
- regenerate caption artifact
- reuse cut + portrait + optional hook output

#### If trim changes
- rerun cut
- rerun portrait
- rerun downstream stages for that clip

#### If tracking mode changes
- rerun portrait stage only
- rerun dependent stages

---

## 5. Session browser redesign

The current session browser already scans `output/sessions/**/session_data.json`.

That should evolve into a **Campaign-aware Session Browser**.

### Add grouping/filtering by
- campaign
- status
- source type
- last updated

### Add clear actions
- resume editing
- retry rendering
- open output
- open session folder
- archive session

---

## 6. Results page redesign

The current `ResultsPage` is session-scoped and useful, but for the major update it should become one view inside the session workspace or a session-specific output tab.

### It should show
- finished clips
- revision number
- current hook text
- caption state
- upload/export actions
- re-edit button

### It should not be the only place to discover clip info
The user should not need to leave the session workspace just to understand what happened.

---

## 7. Browse page redesign

Keep a global library page, but make it obviously different from session editing.

### Browse page should answer
- what clips exist globally?
- which campaign/session did they come from?
- were they uploaded already?
- what is their current revision?

### Browse page should not own session logic
It is a library view, not a workflow view.

---

## 8. No dead buttons policy

This is mandatory.

Every button should be enabled from actual state, not visual assumptions.

### Examples
- no channel URL -> disable fetch
- no fetched videos -> disable queue/process
- no selected highlights -> disable render
- no `master.mp4` -> disable play/upload
- clip has dirty edits -> show `Render Changes`, not `Play`

### Recommendation
Add a page-level `refresh_from_state()` or `on_page_shown()` pattern for all major pages.

That removes a lot of stale-state weirdness.

---

## 9. Best user flow

### First-time user
1. Create Campaign
2. Paste channel URL
3. Fetch videos
4. Queue one or more videos
5. Open generated session
6. Review/edit highlights
7. Render selected clips
8. Review output and upload/export

### Returning user
1. Open app
2. Go to Campaign
3. Open failed/partial session
4. Continue exactly from saved state

### Manual one-off local workflow
1. New Manual Session
2. Pick local file
3. Generate highlights
4. Use same session workspace/editor

This keeps both power-user and batch-user flows efficient.
