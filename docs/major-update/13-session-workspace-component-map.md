# Session Workspace Component Map

## Purpose

This document defines the future **Session Workspace** in UI/component terms.

It is the key page in the major update because it collapses several disconnected flows into one coherent working surface.

---

## 1. Session Workspace mission

The session workspace should become the place where the user can:
- inspect one source video
- review generated highlights
- edit hook/caption/tracking settings
- render selected clips
- retry failed clips
- inspect completed revisions

It should replace the need to mentally jump between:
- highlight selection
- clipping progress
- results
- session browser

---

## 2. High-level layout

```text
+--------------------------------------------------------------------------------+
| Session Header                                                                 |
| campaign name | source video | stage | status | provider snapshot | quick actions |
+----------------------+-------------------------------+-------------------------+
| Left Rail            | Center Editor                 | Right Rail              |
|                      |                               |                         |
| Source Summary       | Highlight Editor              | Render Controls         |
| Highlight List       | Hook Text                     | Hook Settings           |
| Clip Job List        | Caption Settings              | Caption Settings        |
| Session Logs         | Trim Controls                 | Tracking Settings       |
|                      | Overlay Controls              | Overlay Controls        |
+--------------------------------------------------------------------------------+
| Bottom Tabs: Output | Revisions | Logs | Upload/Export                          |
+--------------------------------------------------------------------------------+
```

---

## 3. Session Header

### Displays
- campaign name
- session id
- source title
- source type (channel video / manual local / single YouTube)
- stage
- status
- quick provider summary

### Actions
- back to campaign
- back to session browser
- open session folder
- refresh

### Ownership
Driven by:
- `session_data.json`
- app navigation context

---

## 4. Left Rail

## A. Source Summary card

### Shows
- channel name
- video title
- duration
- transcription method
- subtitle source

### Buttons
- open source file
- open transcript

## B. Highlight List

### Shows per highlight
- title
- duration
- score
- selected state
- dirty marker if edited
- clip render status if linked to a clip job

### Actions
- select
- deselect
- focus editor on highlight

## C. Clip Job List

### Shows
- clip id
- status
- current revision
- last error if failed

### Actions
- open clip output
- retry clip
- open revision history

## D. Session Logs

### Shows
- stage-level log lines
- provider fallback notices
- clip render failures

### Purpose
Keep diagnostic info visible without polluting user-facing status text everywhere else.

---

## 5. Center Editor

This is the editing heart of the workspace.

## A. Highlight Editor

### Fields
- editable title
- editable description
- editable hook text

### Buttons
- save draft
- reset to AI suggestion

## B. Caption Editor

### Fields
- caption mode
  - auto
  - manual override
  - off
- caption override textarea

### Buttons
- preview captions
- reset caption text

## C. Trim Controls

### Fields
- trim start offset
- trim end offset

### Notes
This is not a full timeline editor. It is a bounded timing adjustment panel.

## D. Overlay Controls

### Fields
- brand watermark toggle
- source credit toggle
- source credit display mode
- opacity/size quick controls

---

## 6. Right Rail

## A. Render Controls

### Buttons
- render selected clips
- render current clip
- retry failed clips
- render changes

### State rules
- `render selected` only if selected highlights > 0
- `render current` only if a highlight is focused
- `retry failed` only if failed clip jobs exist
- `render changes` only if current clip/highlight is dirty

## B. Hook Settings

### Fields
- hook enabled
- TTS provider mode summary
- TTS model
- TTS voice
- TTS speed

## C. Caption Settings

### Fields
- caption enabled
- caption provider summary
- style preset

## D. Tracking Settings

### Fields
- tracking mode
- smoothing preset
- center bias

## E. Overlay Settings

### Fields
- watermark preset
- source credit preset

---

## 7. Bottom tabs

## Output
- preview playable clips
- open output folders

## Revisions
- revision history for current clip
- active revision indicator

## Logs
- richer technical logs

## Upload/Export
- YouTube upload
- Repliz upload
- export actions

---

## 8. Component ownership map

## Session-owned state
- source info
- session stage/status
- transcript metadata
- provider snapshot
- highlight list

## Highlight-owned state
- title
- description
- hook text
- selection state
- editor settings

## Clip-owned state
- render status
- revision history
- dirty stage list
- artifacts

## App-owned state
- current campaign
- current session id
- active page
- runtime provider hydration

---

## 9. Persistence rules

### Save Draft
Writes:
- highlight editor fields
- clip editor defaults
- dirty flags

### Render Selected Clips
Writes:
- clip job creation
- per-clip status updates
- revision metadata

### Retry Failed Clips
Writes:
- status transitions only for failed jobs

### Open Output
Never mutates state; only navigates to artifacts.

---

## 10. Why this page matters

Without this page, the major update risks becoming:
- campaigns bolted onto the old wizard
- queueing without editing clarity
- persistence without a real workspace

With this page, the app becomes a true resumable production workspace.
