# PaunClip Website Product Map

## 1. Purpose

This document is the mature product mapping for the future PaunClip website.

It is intentionally not an implementation plan and not a visual design system.
Its job is to lock product behavior so a later UI-focused model can design the interface without inventing logic.

This document defines:
- scope boundaries
- information architecture
- page inventory
- user flows
- queue behavior
- no-auth rules
- wireframe-level page structure
- backend interaction model
- error and recovery states
- handoff rules for a UI builder

---

## 2. Scope Boundaries

### In scope
This mapping covers the product web app for PaunClip as a personal tool.

It includes:
- dashboard/home
- campaigns
- campaign detail and queue
- manual session intake
- session browser
- session workspace
- render queue and processing states
- outputs and global library
- settings
- help and diagnostics inside the product

### Out of scope
This mapping does not fully design:
- public marketing landing pages
- pricing or billing
- signup or login
- team collaboration
- permissions or roles
- multi-tenant SaaS behavior
- full nonlinear timeline editing

### Product constraint
PaunClip website is a personal tool.

That means:
- no signup
- no login
- no role system
- no account recovery

But it still needs:
- persisted server state
- resumable work
- clear recovery paths
- deterministic queue and session behavior

---

## 3. Product Model

The website should preserve the same product model already proven by the desktop app.

### Core entities
- **Campaign**
  - a content operations bucket
  - usually tied to one channel or recurring source
  - owns queue rows and campaign-level defaults

- **Queue Video**
  - one fetched video row inside a campaign
  - may or may not already have a deterministic linked session

- **Session**
  - persisted workspace for one source video
  - stores source info, highlights, workspace state, clip jobs, and output state

- **Highlight**
  - AI-selected clip candidate inside a session
  - editable title, description, hook, caption, trim, tracking, and overlay settings

- **Clip Job**
  - one renderable clip derived from a highlight
  - has status, revisions, and dirty-stage semantics

- **Output Clip**
  - final clip artifact with `master.mp4` and `data.json`

---

## 4. Information Architecture

```text
Dashboard
Campaigns
  -> Campaign Detail / Queue
Manual Session
Sessions
  -> Session Workspace
Library
Settings
Help
```

### Primary navigation groups

#### Operations
- Dashboard
- Campaigns
- Sessions
- Library

#### Work execution
- Campaign Queue
- Session Workspace
- Processing overlays and progress states

#### Configuration and support
- Settings
- Help
- Diagnostics

---

## 5. Global Layout Rules

The website should use an app shell, not disconnected single pages.

### Left sidebar
Persistent on desktop.

Contains:
- PaunClip logo
- Dashboard
- Campaigns
- Sessions
- Library
- Settings
- Help
- global progress widget at the bottom

### Top bar
Contextual per page.

Contains:
- current page title
- primary page action
- runtime status chip
- optional search or filters
- optional active-task indicator

### Main content area
Holds the current route.

### Right detail rail
Contextual only where useful, especially in Queue and Workspace views.

---

## 6. No-Auth State Model

No auth does not mean no state rules.

### Identity model
- single-tenant private tool
- same machine or same private server context
- filesystem-backed persistence remains the source of truth

### Continuity rules
- refreshing the site must not lose campaign or session state
- revisiting the app should reopen into the last valid page context when possible
- direct navigation to a session or campaign route should work if the manifest still exists

### Multi-tab rules
- multi-tab is allowed
- newest persisted state wins
- stale tabs should show a reload banner when state changes materially

### Expiry rules
- no auth/session expiry in SaaS terms
- background task memory can disappear after restart
- persisted manifests remain the truth after restart

### Recovery rules
If the browser closes during processing:
- user reopens the site
- revisits the relevant campaign or session
- sees final persisted state
- resumes editing or retries failed work

---

## 7. Primary User Flows

### Flow 1 - Campaign-driven production
```text
Open Website
-> Dashboard
-> Campaigns
-> Open Campaign
-> Fetch Latest Videos
-> Queue All New or Queue Selected
-> Process One or More Queue Rows
-> Session Workspace
-> Edit Highlights
-> Render Selected Clips
-> Output or Library
```

### Flow 2 - Manual one-off session
```text
Open Website
-> Dashboard
-> Start Manual Session
-> Enter YouTube URL or Local File
-> Phase 1 Processing
-> Session Workspace
-> Render
-> Output or Library
```

### Flow 3 - Resume existing work
```text
Open Website
-> Sessions
-> Filter or Search
-> Resume Session Workspace
-> Retry Failed or Render Changes
-> Output or Library
```

### Flow 4 - Global output review
```text
Open Website
-> Library
-> Browse Outputs
-> Play Clip
-> Open Parent Session
-> Continue Editing or Export
```

---

## 8. Page Inventory and Wireframe-Level Structure

## 8.1 Dashboard

### Purpose
Operational homepage.

### Must answer
- what needs attention right now?
- can I start a quick one-off job?
- are there failures to recover?

### Required sections
1. Quick Manual Session card
2. Operational stats row
3. Recent activity feed
4. Resume work shortcuts

### Wireframe
```text
[Top Bar: Dashboard + New Manual Session]
[Stats Row]
[Quick Manual Session Card]
[Recent Activity Feed]
[Resume Work Panel]
```

## 8.2 Campaigns Dashboard

### Purpose
Campaign management surface.

### Required sections
1. Campaign actions bar
   - add campaign
   - rename selected
   - archive selected
   - open selected
2. Campaign list or grid
3. Summary side panel

### Per-campaign fields
- campaign name
- channel URL
- fetched videos count
- queued count
- failed count
- completed count
- last activity

### Button rules
- Open Campaign only when a campaign is selected
- Rename only when exactly one active campaign is selected
- Archive only for active campaigns
- Add Campaign always enabled

## 8.3 Campaign Detail / Queue

### Purpose
Campaign-level ingestion and queue management.

### Required sections
1. Campaign header
2. Queue control bar
3. Queue table or list
4. Failed and partial summary panel

### Queue row fields
- thumbnail
- title
- publish date
- duration
- queue status
- last error
- linked session id if present
- actions

### Per-row actions
- queue
- process
- skip
- retry
- open session
- open source URL

### Bulk actions
- fetch latest videos
- queue all new
- process selected
- retry failed
- filter by status

## 8.4 Manual Session Intake

### Purpose
Compatibility path for one-off jobs.

### Required sections
- source type selector
- YouTube URL input
- local file input
- clip count
- transcript mode summary
- start processing
- back to dashboard

## 8.5 Processing View or Progress Overlay

### Purpose
Keep active work visible and understandable.

### Required information
- current stage
- current item being processed
- percentage
- latest log line
- linked campaign or session context
- next best action on success or failure

### Rules
- user should never wonder whether work is alive
- user can navigate away while progress remains visible globally if safe
- completion should surface the next action explicitly

## 8.6 Sessions Browser

### Purpose
Cross-session resume and recovery hub.

### Required sections
- filters: campaign, status, source type, date range
- session list or table
- actions: resume editing, retry rendering, open output, archive

## 8.7 Session Workspace

### Purpose
Core editing and rendering surface.

### Layout
Three-column desktop-first layout.

#### Left rail
- source summary
- stage and status summary
- highlight list
- clip jobs list

#### Center editor
- editable title
- editable description
- editable hook text
- caption override
- trim controls
- preview summary

#### Right rail
- hook settings
- caption settings
- tracking settings
- overlay settings
- render actions

#### Bottom tabs
- output
- revisions
- logs
- export

### Required actions
- save draft
- select or deselect highlights
- render selected clips
- retry failed clips
- open current output
- open revision history

### Rules
- Save only enables when dirty
- Render Selected requires one or more selected highlights
- Retry Failed only if failed clip jobs exist
- Render Changes only if a clip is dirty

## 8.8 Outputs / Global Library

### Purpose
Cross-session output browser.

### Required sections
- search, filter, sort
- clip grid or list
- play preview
- open parent session
- export/download
- upload hooks later

### Clip card data
- clip title
- hook text
- duration
- campaign or session
- render status
- revision label

## 8.9 Settings

### Purpose
Runtime configuration and diagnostics.

### Required groups
1. AI Providers
2. Render Defaults
3. System / Runtime

### Rules
- settings should reflect real runtime readiness, not stale config only
- validation messages must be specific and actionable

## 8.10 Help / Diagnostics

### Purpose
Avoid dead-end failures.

### Required sections
- how it works
- queue explanation
- cookies setup
- provider setup
- troubleshooting
- current system status

---

## 9. Queue State Matrix

### 9.1 Campaign Video Queue

| State | Meaning | User sees | Allowed actions |
|---|---|---|---|
| new | fetched but untouched | row available | queue, skip |
| queued | ready to process | waiting badge | process, skip |
| downloading | source acquisition | progress or lock | inspect only |
| transcribing | subtitle/ASR running | progress or lock | inspect only |
| highlights_found | phase 1 complete | ready badge | open session |
| editing | linked session exists and has edits | editing badge | open session |
| rendering | linked session rendering clips | rendering badge | open session |
| completed | output exists and work is done | completed badge | open session, open output |
| failed | processing failed | error badge | retry, open session if exists |
| skipped | intentionally ignored | skipped badge | queue again |

### Campaign queue policy rules
- this is an internal processing queue, not a public waiting room
- no user fairness model is required
- order still matters for predictability
- background processing should surface one active item clearly
- failed rows must be sticky and easy to recover

### 9.2 Session Render Queue

| State | Meaning | Allowed actions |
|---|---|---|
| queued | waiting to render | inspect |
| rendering | actively rendering | inspect logs |
| completed | output exists | play, export, upload later |
| failed | render failed | retry |
| dirty_needs_rerender | spec changed after success | render changes |
| partial | mixed output state | retry failed, inspect completed |

---

## 10. Error, Empty, and Recovery UX

### Empty states
Every major page needs a first-use empty state that answers:
- what this page is for
- why it is empty
- what the user should do next

### Error states
Every major error should expose:
- what failed
- what stage failed
- whether data was persisted
- what the user can do next

### Required recovery actions
- retry
- open relevant session or campaign
- go to settings
- view logs or details

### Backend unavailable state
If FastAPI is unavailable:
- show backend offline banner
- disable mutating actions
- keep cached view only if safe
- show reconnect instructions

### Stale tab state
If persisted state changes underneath the current page:
- show a non-destructive refresh banner
- allow reload from source of truth

---

## 11. Trust and Content Requirements

### Required content blocks
- what PaunClip does
- how campaign queue works
- what session workspace means
- what Render Selected vs Retry Failed means
- why outputs can lag behind processing state briefly
- setup help for cookies, providers, FFmpeg, and Deno
- runtime warnings when system dependencies are missing

### Tone
- direct
- operational
- no marketing fluff inside the app
- precise failure language

---

## 12. Backend Interaction Model

### Frontend to backend
Frontend should talk only to the FastAPI backend.

### Patterns
- REST for CRUD and page hydration
- SSE for progress events
- static file serving for output media

### Page hydration model
- Dashboard hydrates from summary endpoints
- Campaigns hydrates from campaign list endpoint
- Campaign Detail hydrates from campaign + queue snapshot endpoint
- Session Workspace hydrates from session DTO endpoint
- Library hydrates from output clip summary endpoint

### Progress event minimum fields
- task type
- status text
- percentage
- session id if relevant
- campaign id if relevant
- current item label if relevant

---

## 13. Suggested Route Map

```text
/                       -> Dashboard
/campaigns              -> Campaign list
/campaigns/:id          -> Campaign detail + queue
/manual                 -> Manual session intake
/sessions               -> Session browser
/sessions/:id           -> Session workspace
/library                -> Global output library
/settings               -> Settings
/help                   -> Help / diagnostics
```

---

## 14. Handoff Rules for UI Builder

### The UI builder must preserve
- page purpose
- section ordering
- action hierarchy
- state visibility
- empty, error, and recovery surfaces

### The UI builder can decide visually
- spacing
- typography scale
- icon style
- shadows and glassmorphism intensity
- desktop/mobile breakpoints
- card vs table visual language

### The UI builder must not invent
- queue behavior
- retry rules
- selection persistence rules
- hidden auto-actions not in this spec

### Important caution
Keep product behavior/spec separate from visual design. Beauty is flexible; workflow rules are not.

---

## 15. Acceptance Checklist

This mapping is complete only if it includes:
- scope boundaries
- no-auth state model
- page inventory
- primary flows
- queue state matrix
- error/empty/recovery states
- trust/content requirements
- backend interaction model
- route map
- handoff rules for the UI builder

---

## 16. Final Recommendation

The future PaunClip website should feel like a content operations workstation with this backbone:

```text
Dashboard
-> Campaigns
-> Campaign Queue
-> Session Workspace
-> Outputs / Library
-> Settings / Help
```

The most important rule is:

Do not let the UI builder invent workflow behavior.
Lock states, transitions, and recovery rules first.
Then let Gemini make it beautiful.
