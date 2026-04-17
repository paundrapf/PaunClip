# PaunClip Web Application Architecture & UI/UX Map

## 1. Executive Summary
The pivot from a Desktop GUI (CustomTkinter/PyWebView) to a true Client-Server Web Application is the right move for testing, headless VPS deployment, and modern UX. 
This document defines the tech stack, UI/UX flow, and backend architecture to migrate PaunClip without losing the "Engine V2" processing core.
**Key Constraint:** This is a personal tool. No Signup/Login/Auth walls. Local/VPS private access only.

## 2. Proposed Tech Stack

### Backend: FastAPI (Python 3.10+)
* **Why:** The entire `clipper_core.py` and processing engine is Python. FastAPI is asynchronous, incredibly fast, auto-generates Swagger API docs, and perfectly handles long-running background tasks (like `yt-dlp` and `ffmpeg`) via `asyncio` or `BackgroundTasks`.
* **Communication:** REST API for CRUD operations (Settings, Campaigns, Sessions). **Server-Sent Events (SSE)** or WebSockets for pushing real-time progress bars and terminal logs to the frontend without heavy polling.
* **Storage:** Keep the existing filesystem-based contract (`config.json`, `session_data.json`, `output/`). It's proven, portable, and prevents us from needing to set up PostgreSQL/MySQL for a personal tool.

### Frontend: Next.js (React) + Tailwind CSS + shadcn/ui
* **Why:** The industry standard for high-quality, snappy, and maintainable user interfaces.
* **Tailwind CSS & shadcn/ui:** Gives us professional, dark-mode ready, glassmorphism UI components (cards, progress bars, modals, toggles) out of the box. No more struggling with vanilla JS DOM manipulation.
* **State Management:** React Context or Zustand for managing the active workspace, queue statuses, and global settings.

---

## 3. UI/UX Mapping & User Flow

The application will be a Single Page Application (SPA) or smoothly routed Next.js app with a persistent sidebar navigation and a main content area. Theme: **Dark Mode Native (Sleek, Minimal, Glassmorphism)**.

### A. Global Layout
* **Sidebar (Left):**
  * Brand Logo: **PaunClip**
  * Navigation Links: Dashboard (Home), Campaigns, Sessions (Workspace), Library (Outputs), Settings.
  * Global Progress Widget (Bottom of Sidebar): A mini-indicator showing if a background worker is currently active (e.g., "Rendering 2 clips... [||||||    ] 60%").

### B. Screens & Flows

#### 1. Dashboard (Home)
* **Goal:** Quick overview of the system status and rapid one-off clipping.
* **UI Elements:**
  * **Quick Clip Input:** A large, prominent input bar for pasting a YouTube URL. "Start a quick manual session".
  * **Stats Row:** Total campaigns, total generated clips, total failed jobs.
  * **Recent Activity:** A feed of the last 5 completed clips or newly fetched videos.

#### 2. Campaigns Manager
* **Goal:** Manage channels, queues, and bulk processing.
* **Flow:**
  * **List View:** Cards for each campaign showing Name, Channel URL, and Unprocessed Video count. Button to "Add New Campaign".
  * **Detail View (Inside a Campaign):**
    * **Header:** Campaign Name, Fetch Latest Videos button, Queue All New button.
    * **Queue Table/List:** Shows fetched videos. Columns: Thumbnail, Title, Published Date, Status (New, Queued, Downloading, Transcribing, Highlights Found, Failed), Actions (Process, Skip).
    * **UX Magic:** Clicking "Process" changes the row status to a loading spinner. The backend pushes SSE events updating the progress bar inside that specific row. Once done, an "Open Workspace" button appears.

#### 3. Session Workspace (The Core Editor)
* **Goal:** The heart of PaunClip. Where users review AI highlights and tweak render settings.
* **Layout:** Split Screen (2 Columns).
  * **Left Column (Source & Queue Context):**
    * Source Video Info (Thumbnail, Title, Duration).
    * Current Queue Status (e.g., 3 Selected, 1 Rendering, 2 Completed).
    * **Highlight List:** Scrollable list of AI-generated clips. Clicking one selects it. Checkboxes to mark for rendering.
  * **Right Column (Focused Editor):**
    * Displays details of the *Selected Highlight*.
    * **Inputs:** Title, Description, Hook Text (Textarea), Caption Override (Textarea).
    * **Toggles/Dropdowns:** Tracking Mode (Center Crop, Podcast Smart, etc.), TTS Voice, Watermark Preset, Source Credit.
    * **Floating Action Bar (Bottom):** "Save Draft", "Render Selected", "Retry Failed".
* **UX Magic:** Any change triggers a "Draft unsaved" indicator. Rendering changes the highlight's card border to yellow (processing) then green (done), allowing the user to click a "View Output" button directly on the card.

#### 4. Library (Outputs)
* **Goal:** Browse, play, and download finished short videos.
* **UI Elements:**
  * Grid of video cards.
  * Each card shows: Hook Text, Duration, Campaign/Session name, and an HTML5 `<video>` player preview (muted, autoplay on hover).
  * Actions: "Download MP4", "Copy JSON Data", "Open Folder".

#### 5. Settings
* **Goal:** Configure API keys, default models, and system paths.
* **UI Elements:**
  * **AI Providers:** Inputs for OpenAI Base URL, API Key, Model. Same for Groq/Custom providers. Password-masked inputs with an "eye" toggle. "Test Connection" button for immediate validation.
  * **Global Defaults:** Default tracking mode, default TTS voice, watermark toggle.
  * **System:** Restart Backend worker button, clear logs.

---

## 4. Transition Plan (How to build this)

We will build this in 3 phases, completely decoupling the Frontend from the Python Backend.

### Phase 1: The FastAPI Backend Core
1. Create a `server.py` using FastAPI.
2. Port the `utils/web_campaign_api.py` and `utils/web_session_api.py` logic into clean REST endpoints (e.g., `GET /api/campaigns`, `POST /api/sessions/{id}/render`).
3. Set up a background task queue (using FastAPI `BackgroundTasks` or a lightweight `asyncio.Queue`) so API requests return instantly while `clipper_core.py` runs in the background.
4. Expose the `output/` folder as a static file route so the frontend can stream the `.mp4` files directly.

### Phase 2: The Next.js Frontend Foundation
1. Bootstrap a Next.js 14 (App Router) project in a new folder (e.g., `frontend/`).
2. Install Tailwind CSS and shadcn/ui.
3. Build the Sidebar layout and the API client (Axios/Fetch) to talk to `localhost:8000`.
4. Build the **Settings** and **Dashboard** pages first to ensure API connectivity.

### Phase 3: The Workspace & Real-time Progress
1. Build the **Campaigns** and **Session Workspace** pages.
2. Implement SSE (Server-Sent Events) in FastAPI.
3. Wire the frontend to listen to the SSE stream and update progress bars globally.
4. Finalize the **Library (Outputs)** page with video players.

This architecture ensures PaunClip can run forever on a VPS (`uvicorn server:app --host 0.0.0.0 --port 8000`) and you can access the UI from your laptop browser. On Windows development machines, prefer the non-reload command (no `--reload`) when the repo lives inside OneDrive or another synced folder.
