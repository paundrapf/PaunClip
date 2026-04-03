# Provider Router and Groq Rotation Spec

## Purpose

This document defines the runtime behavior for provider selection, task routing, `.env` loading, and Groq key rotation.

It complements `03-provider-and-api-strategy.md` by specifying the operational logic.

---

## 1. Design principles

1. user-facing choice stays simple
2. internal routing stays task-scoped
3. secrets are never persisted into session manifests
4. every session stores a provider snapshot for reproducibility
5. rate-limit handling is explicit, not incidental

---

## 2. User-facing provider modes

### Mode A — OpenAI API

User sees:
- OpenAI API

Internally:
- single-provider mode
- API key and base URL come from config or direct credentials

### Mode B — Groq Rotate

User sees:
- Groq Rotate

Internally:
- `.env`-loaded key pool
- cooldown-aware key selection
- task-level model selection on top of the pool

---

## 3. Runtime objects

## `ProviderRouter`

### Responsibilities
- build task-scoped runtime clients
- choose provider mode per task
- create provider snapshots for sessions and clip jobs

### Suggested methods
- `resolve_task_provider(task_name, context)`
- `build_client(task_name, resolved_provider)`
- `snapshot_provider(task_name, resolved_provider)`
- `is_provider_ready(task_name)`

## `GroqKeyPool`

### Responsibilities
- read Groq keys from `.env`
- hold key state in memory
- assign next key for a request
- cool down keys after rate limits
- report pool health to the UI/debug log

### Suggested methods
- `load_from_env(env_path)`
- `get_next_key(task_name)`
- `mark_rate_limited(key_id, retry_after_seconds)`
- `mark_failure(key_id, error_type)`
- `mark_success(key_id)`
- `get_pool_status()`

---

## 4. `.env` loading rules

## Expected variables
- `BASE_URL_API_GROQ`
- `GROQ_API_KEY`
- `GROQ_API_KEY_2`
- `GROQ_API_KEY_3`
- ... up to available keys

### Rules
1. `.env` is loaded only into runtime, never copied into manifests.
2. Empty/missing keys are ignored.
3. At least one valid key is required for Groq Rotate readiness.
4. Base URL falls back to Groq default if env base URL is absent.

### Validation output to UI
- loaded keys count
- active keys count
- keys cooling down count
- last pool error

---

## 5. Task-scoped routing rules

## Highlight Finder

### Strongest candidate for rotation
Because:
- highest TPM pressure
- largest requests
- most likely to benefit from cooldown-aware key switching

### Recommended behavior
- `OpenAI API` -> single configured client
- `Groq Rotate` -> pooled Groq client resolution + task-specific model

## Caption Maker

### Recommended behavior
- keep simpler
- no rotation in first pass unless clearly needed
- use single provider mode for predictable Whisper behavior

## Hook Maker

### Recommended behavior
- allow OpenAI API and Groq Rotate
- when Groq Rotate is active, still use a task-specific TTS model and voice
- provider router must inject provider-specific defaults if voice/format missing

## YouTube Title Maker

### Recommended behavior
- can support single or rotate later
- lower urgency than Highlight Finder

---

## 6. Groq key selection algorithm

### Initial strategy
Weighted round-robin with cooldown exclusion.

### Key state fields
```json
{
  "key_id": "groq_key_03",
  "available": true,
  "cooldown_until": null,
  "last_used_at": null,
  "recent_failures": 0,
  "recent_successes": 0,
  "last_error": null
}
```

### Selection rules
1. exclude keys whose `cooldown_until` is still in the future
2. prefer least-recently-used available keys
3. deprioritize keys with repeated recent failures
4. if all keys are cooling down, surface pool exhaustion clearly

---

## 7. Rate-limit handling rules

## For 429 / TPM exhaustion
1. parse retry delay
2. mark current key cooling down
3. if another healthy key exists, next request may use another key
4. if no healthy key exists, wait or fail cleanly depending on caller policy

## For 413 / request too large
1. do not rotate keys blindly
2. classify as request-shape issue, not key issue
3. return to caller so chunking/compaction logic handles it

## For auth/invalid key errors
1. mark key unavailable
2. do not reuse until manual recovery or restart validation

---

## 8. Session snapshot rules

Every session should capture provider snapshots like:

```json
{
  "highlight_finder": {
    "mode": "groq_rotate",
    "strategy": "rotate",
    "pool_name": "default_groq_pool",
    "model": "groq/compound"
  },
  "hook_maker": {
    "mode": "groq_rotate",
    "strategy": "single",
    "pool_name": "default_groq_pool",
    "model": "canopylabs/orpheus-v1-english",
    "tts_voice": "autumn",
    "tts_response_format": "wav"
  }
}
```

### Important
Do **not** store raw API keys in session or clip manifests.

---

## 9. Validation rules

## OpenAI API mode
Validation should check:
- API key presence
- base URL
- minimal client hydration

## Groq Rotate mode
Validation should check:
- `.env` found
- at least one key loaded
- Groq base URL resolved
- chosen model valid for the task family

## Hook Maker extra validation
If using Groq/Orpheus:
- voice must be one of the valid Groq voices
- response format must be provider-compatible

---

## 10. UI mapping recommendation

### Settings page should show
- provider mode selector:
  - OpenAI API
  - Groq Rotate
- task cards under the chosen mode

### If OpenAI API selected
show direct task-scoped fields

### If Groq Rotate selected
show:
- pool health summary
- task model selectors
- task voice selectors where applicable

Do not expose raw keys in the UI.

---

## 11. Failure behavior goals

The provider system is correct only if these are true:
- a stale UI state cannot claim ready while runtime is not hydrated
- a rate-limited Groq key does not keep being reused blindly
- oversize requests are fixed by request shaping, not random key switching
- session rerenders can reproduce prior provider behavior

That is the bar for the provider router to be considered complete.
