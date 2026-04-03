# Screen Wireflow and Button-State Matrix

## Purpose

This document defines the target screen flow and the rules that prevent dead buttons or broken transitions.

---

## 1. Global navigation map

```text
Campaigns Dashboard
  -> Campaign Detail
    -> Fetched Video Queue
      -> Session Workspace
        -> Clip Preview / Output
  -> Session Browser
  -> Global Library
  -> Settings
```

### Manual fallback route

```text
Campaigns Dashboard
  -> New Manual Session
    -> Session Workspace
```

This preserves the local video workflow.

---

## 2. Campaigns Dashboard

### Main actions
- Add Campaign
- Rename Campaign
- Open Campaign
- Archive Campaign
- Open Session Browser
- Open Global Library
- Open Settings

### Button state rules

#### `Open Campaign`
Enabled only when a campaign row exists.

#### `Rename Campaign`
Enabled only when exactly one campaign is selected.

#### `Archive Campaign`
Enabled only for active campaigns.

#### `New Manual Session`
Always available.

---

## 3. Campaign Detail

### Sections
- campaign header
- channel settings
- sync/fetch controls
- fetched video queue
- failed/partial sessions summary

### Main actions
- Fetch Videos
- Queue All New
- Process Selected
- Retry Failed
- Open Session

### Button state rules

#### `Fetch Videos`
Enabled only if channel URL is valid.

#### `Queue All New`
Enabled only if fetched videos exist with status `new`.

#### `Process Selected`
Enabled only if one or more videos are selected and queueable.

#### `Retry Failed`
Enabled only if at least one failed queue item or failed session exists.

#### `Open Session`
Enabled only if the selected video already has a session.

---

## 4. Session Workspace

### Layout

#### Left rail
- source summary
- stage/status summary
- highlight list

#### Center panel
- active highlight editor
- text fields
- trim summary

#### Right rail
- hook controls
- caption controls
- tracking controls
- overlay controls
- render actions

### Main actions
- Save Draft
- Select/Deselect Highlight
- Render Selected Clips
- Retry Failed Clips
- Open Clip Output

### Button state rules

#### `Save Draft`
Enabled whenever there are unsaved editor changes.

#### `Render Selected Clips`
Enabled only if at least one selected highlight exists.

#### `Retry Failed Clips`
Enabled only if any clip job is `failed`.

#### `Render Changes`
Enabled only if a clip is `dirty_needs_rerender`.

#### `Play Current Revision`
Enabled only if `master.mp4` exists for the selected clip.

#### `Upload`
Enabled only if the clip has a completed `master.mp4` and metadata passes validation.

---

## 5. Session Browser

### Filters
- campaign
- status
- source type
- date range

### Actions
- Resume Editing
- Retry Rendering
- Open Output Folder
- Archive Session

### Button state rules

#### `Resume Editing`
Enabled if session stage is one of:
- `highlights_found`
- `editing`
- `render_queued`
- `partial`
- `failed`

#### `Retry Rendering`
Enabled if session has failed or dirty clip jobs.

#### `Open Output Folder`
Enabled if session directory exists.

---

## 6. Global Library

### Purpose
Cross-session output browsing only.

### Actions
- Play
- Open Folder
- Open Parent Session
- Upload

### Button state rules

#### `Play`
Enabled only if `master.mp4` exists.

#### `Upload`
Enabled only if clip metadata is valid and render is completed.

#### `Open Parent Session`
Enabled only if linked session manifest still exists.

---

## 7. Settings

### Principles
- show only controls relevant to current provider mode
- validate using runtime-accurate checks
- never show “Configured” if the runtime cannot actually hydrate

---

## 8. Dead-button prevention rules

Every major page should implement a refresh lifecycle.

### Recommended app contract
- `on_page_shown()`
- `refresh_from_state()`

### Rule
Button state should always derive from persisted state + runtime readiness, not from stale widget state.

---

## 9. Error UX rules

### Good error UX
- tell user what stage failed
- show retry path
- never strand user on a screen with no valid next action

### Examples

#### If fetch fails
- keep `Retry Fetch`
- keep `Back to Campaign`

#### If session render partially fails
- show completed clips
- show failed clip count
- show `Retry Failed Clips`

#### If provider validation fails
- show exact task that is not ready
- keep navigation to the relevant settings page

These rules eliminate most flow weirdness.
