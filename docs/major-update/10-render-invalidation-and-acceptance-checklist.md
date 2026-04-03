# Render Invalidation and Acceptance Checklist

## Purpose

This document defines:

1. which changes invalidate which render stages
2. how to know a phase is truly complete

This is the closest thing to a delivery checklist for the major update.

---

## 1. Render invalidation matrix

## Change: hook text only

### Invalidate
- hook stage
- final composition stage

### Do not invalidate
- cut
- portrait analysis
- transcript generation
- highlight generation

---

## Change: TTS voice only

### Invalidate
- hook TTS audio
- hook stage
- final composition stage

### Do not invalidate
- cut
- portrait stage
- captions

---

## Change: caption text/style only

### Invalidate
- caption asset stage
- final composition stage

### Do not invalidate
- cut
- portrait
- hook

---

## Change: watermark or source-credit settings only

### Invalidate
- final composition stage

### Do not invalidate
- cut
- portrait
- hook asset generation
- transcript generation

---

## Change: trim / in-out time

### Invalidate
- cut
- portrait
- hook
- captions
- final composition

---

## Change: tracking mode or tracking smoothing

### Invalidate
- portrait analysis/crop path
- portrait render
- downstream composition stages

---

## Change: campaign provider preset only

### Immediate effect
- affects only new sessions by default

### Optional advanced behavior
- allow user to apply to current session explicitly

---

## 2. Acceptance checklist by area

## Campaigns
- [ ] user can add a campaign
- [ ] user can rename a campaign
- [ ] user can archive a campaign
- [ ] campaign persists across restart
- [ ] no dead button appears when no channel URL is configured

## Channel fetch queue
- [ ] user can fetch videos from a channel
- [ ] queue survives restart
- [ ] video statuses persist
- [ ] failed fetch can be retried
- [ ] opening a queued/already-fetched video is deterministic

## Sessions
- [ ] session manifest is created early, not only after full success
- [ ] session can resume after app restart
- [ ] session status reflects partial and failed states correctly
- [ ] provider snapshot persists

## Highlights
- [ ] detected highlights persist in session manifest
- [ ] highlight selection persists
- [ ] hook/caption editor defaults persist per highlight

## Clip rendering
- [ ] each clip has a stable `clip_id`
- [ ] clip failure does not abort the whole session render batch
- [ ] completed clip remains playable after retrying failed clips
- [ ] clip revisions are visible and traceable

## Mini editor
- [ ] hook text change rerenders only dependent stages
- [ ] caption change rerenders only dependent stages
- [ ] watermark/source credit change rerenders only composition
- [ ] trim change rerenders dependent stages correctly

## Provider strategy
- [ ] user can choose OpenAI API or Groq Rotate
- [ ] runtime hydration reflects saved settings after restart
- [ ] Groq Rotate key pool loads from `.env`
- [ ] Hook Maker Groq voice selector is provider-aware

## Overlays
- [ ] watermark defaults can be set globally
- [ ] source credit defaults can be set globally
- [ ] clip editor can override watermark/source-credit behavior
- [ ] source credit defaults to bottom-center readable placement

## Performance
- [ ] portrait conversion reuses crop path/cache when valid
- [ ] thumbnail generation does not require re-opening every clip on page load
- [ ] face tracking smoothing visibly improves over current locky behavior

---

## 3. Done-definition for each major phase

## Phase 1 is done when
- campaign/session/clip manifests are stable
- old sessions still load
- no key page is broken by migration

## Phase 2 is done when
- campaigns are usable daily
- users can fetch and queue channel videos

## Phase 3 is done when
- session workspace replaces most confusing phase jumps
- highlights, edits, and render queue are in one coherent place

## Phase 4 is done when
- rerenders are visibly incremental
- editor changes do not trigger unnecessary work

## Phase 5 is done when
- provider mode selection is reliable
- OpenAI API and Groq Rotate both work end-to-end
- Groq TTS voices are actually user-selectable

## Phase 6 is done when
- tracking is smoother
- portrait conversion is more predictable
- output browsing is faster

---

## 4. Final quality bar

The major update should be considered successful only when the app feels like this:

- user can start from a campaign
- fetch a channel
- process one or many videos
- resume any partial session later
- edit hook/caption/source-credit without starting over
- rerender only what changed
- understand every important action from the UI without guessing

That is the bar for “complete”, not simply “the code compiles”.
