# Provider and API Strategy

## Summary

The future app should expose **two top-level provider modes** to the user:

1. **OpenAI API**
2. **Groq Rotate**

But internally, provider logic should remain **task-scoped**.

That means the app should still think in terms of:
- `highlight_finder`
- `caption_maker`
- `hook_maker`
- `youtube_title_maker`

The difference is that each task can use a provider strategy instead of a single raw API config.

---

## Current repo reality

Observed from the repo:

- `config/config_manager.py` already stores task-scoped `ai_providers`
- `clipper_core.py` already creates separate clients for:
  - highlight finding
  - captions/transcription
  - hook maker TTS
- Hook Maker already has provider-specific runtime behavior now
- `.env` is currently **not read at all** by the repo

That means `Groq Rotate` must be introduced as a deliberate new layer, not a minor tweak.

---

## User-facing provider options

## Option 1: OpenAI API

### Purpose
- stable single-key mode
- easier mental model
- good default for users who only want one provider

### Recommended use
- Highlight Finder
- Hook Maker
- Title Generator

---

## Option 2: Groq Rotate

### Purpose
- use multiple Groq keys
- spread TPM load
- reduce failures on long/high-throughput runs

### `.env` signals already available
From the parent folder `.env`:

- `GROQ_API_KEY`
- `GROQ_API_KEY_2 ... GROQ_API_KEY_10`
- `BASE_URL_API_GROQ`

### Design rule
The app should never persist the secret values into session manifests.

Instead, save only a provider snapshot like:

```json
{
  "mode": "groq_rotate",
  "base_url_ref": "BASE_URL_API_GROQ",
  "pool_name": "default_groq_pool",
  "selected_model": "groq/compound"
}
```

---

## Internal provider strategy model

Each task config should support:

```json
{
  "mode": "openai_api",
  "strategy": "single",
  "model": "gpt-4.1"
}
```

or

```json
{
  "mode": "groq_rotate",
  "strategy": "rotate",
  "pool": "default_groq_pool",
  "model": "groq/compound"
}
```

### Strategies

#### `single`
- one configured provider

#### `rotate`
- round-robin or cooldown-aware key rotation

#### `failover`
- primary provider first
- fallback to a second provider if primary fails

---

## Recommended task defaults

## Highlight Finder
Best candidate for provider strategy sophistication.

### Why
- highest TPM pressure
- biggest prompt size problems
- already has Groq-specific fallback behavior in core

### Recommended support
- OpenAI single
- Groq Rotate
- optional OpenAI fallback if Groq exhausted

---

## Caption Maker
Keep simpler.

### Why
- transcription path is more model/provider specific
- Whisper-compatible behavior is less uniform than chat completions

### Recommended support
- OpenAI-compatible single provider
- optional Groq single for Whisper if configured
- no rotation in first major update unless needed

---

## Hook Maker
Needs strong provider-aware behavior.

### Why
- TTS models are provider-specific
- voice lists are provider-specific
- response format can differ

### OpenAI-style defaults
- model: `tts-1`
- voice: `nova`
- format: `mp3`

### Groq defaults
- model: `canopylabs/orpheus-v1-english`
- voices:
  - `autumn`
  - `diana`
  - `hannah`
  - `austin`
  - `daniel`
  - `troy`
- format: `wav`

### UI requirement
If Hook Maker provider mode is Groq, voice selector must show only valid Groq voices.

---

## YouTube Title Maker
Lower complexity than highlight finding.

### Recommended support
- OpenAI single
- Groq Rotate optional later

---

## Groq Rotate design

## Core concept
Introduce a small runtime service, conceptually something like:

- `GroqKeyPool`
- `ProviderRouter`

### Responsibilities
- load keys from `.env`
- keep a pool of active keys
- mark keys cooling down after rate limit events
- choose next key for a task
- emit structured telemetry about key usage

### Minimum metadata per key
- key id / label
- cooldown until
- recent failures
- last used at

### Important note
The app should never surface full raw keys in UI or logs.

---

## Runtime resolution flow

### Desired flow
1. user chooses provider mode in settings or campaign defaults
2. config persists task-scoped provider strategy
3. app hydrates runtime provider objects on startup
4. session stores provider snapshot
5. clip render uses session snapshot or clip override

This prevents the old problem where runtime behavior drifts away from saved settings.

---

## Validation design

Validation must stop being generic “models.list works” only.

### For Hook Maker
Validation should actually check:
- model present
- selected voice valid for provider
- request shape valid for that provider family

### For Highlight Finder
Validation should know:
- direct mode vs Groq Rotate
- model availability
- long transcript constraints cannot be fully validated, but request family can

### For Groq Rotate
Validation should show:
- number of keys loaded
- active keys count
- last rotation test
- cooldown state summary

---

## Recommended config shape

```json
{
  "providers": {
    "openai_api": {
      "type": "openai",
      "base_url": "https://api.openai.com/v1",
      "api_key_ref": "config_or_env"
    },
    "groq_rotate": {
      "type": "groq_pool",
      "base_url_env": "BASE_URL_API_GROQ",
      "key_refs": [
        "GROQ_API_KEY",
        "GROQ_API_KEY_2",
        "GROQ_API_KEY_3"
      ]
    }
  },
  "ai_providers": {
    "highlight_finder": {
      "mode": "groq_rotate",
      "strategy": "rotate",
      "model": "groq/compound"
    },
    "hook_maker": {
      "mode": "groq_rotate",
      "strategy": "single",
      "model": "canopylabs/orpheus-v1-english",
      "tts_voice": "autumn",
      "tts_response_format": "wav",
      "tts_speed": 1.0
    }
  }
}
```

The exact final shape can vary, but this is the right direction.

---

## UX rules for providers

### Rule 1
Always show the user which provider mode is active.

### Rule 2
Never show options that do not apply to the active provider mode.

### Rule 3
If a provider mode needs extra config, block actions until it is actually ready.

### Rule 4
If using Groq Rotate, surface health status, not raw keys.

### Rule 5
Persist runtime-relevant fields in the session snapshot so future rerenders remain reproducible.
