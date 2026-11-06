# Addendum — Viral Profiles and Detection (v1.0, 2026-11-06)

Each authorized source has an active immutable profile version. Editing clones a new version; old sessions/candidates keep the snapshot used. A profile controls what gets proposed, never whether a post needs approval.

## V1. JSON configuration

```json
{
  "schema_version": 1,
  "language": "en",
  "detection": {
    "bucket_seconds": 5,
    "baseline_window_seconds": 300,
    "baseline_min_events": 20,
    "score_threshold": 0.72,
    "min_messages_per_second": 2.0,
    "min_unique_chatters": 8,
    "weights": { "chat_zscore": 0.40, "emote_density": 0.20, "unique_chatter_zscore": 0.15, "audio_rms_zscore": 0.15, "keyword_burst": 0.10 },
    "emote_terms": ["KEKW", "LUL"],
    "keywords": ["clip it", "no way", "what just happened"],
    "audio_enabled": false,
    "keyword_enabled": false,
    "cooldown_seconds": 90,
    "max_candidates_per_hour": 12,
    "quiet_chat_mode": false
  },
  "window": { "pre_seconds": 15, "post_seconds": 30, "min_duration_seconds": 15, "max_duration_seconds": 60 },
  "style": {
    "template_id": "gameplay_webcam_v1",
    "caption_preset": "karaoke_clean",
    "caption_language": "en",
    "hook_enabled": true,
    "end_card_enabled": true,
    "silence_cut_enabled": false,
    "face_crop_enabled": false,
    "brand_asset_keys": [],
    "profanity_policy": "censor_captions_only"
  }
}
```

Zod/Pydantic reject unknown major versions, malformed regex-like patterns, excessive lists, invalid weights/durations. Weights need not sum to one input but are normalized before scoring; all zero is invalid. Max duration is capped by plan and destination capability. Language defaults to source language but can be overridden; unavailable ASR language produces warning, not fabricated captions.

## V2. Signals

For each 5s bucket compute:
- `mps`: messages/bucket seconds.
- rolling median and robust dispersion for messages/sec over baseline window; `chat_zscore` is robust z (use absolute fallback for zero dispersion, document fixture).
- `emote_density`: recognized emote tokens / message tokens, plus absolute burst count so one emote in an empty chat does not trigger.
- unique-chatters count vs baseline using pseudonymous HMAC keys.
- optional audio RMS robust z from aligned media; missing audio feature redistributes weight only if profile explicitly allows.
- optional Whisper keyword burst using word timestamps; transcripts are delayed evidence and can refine an existing window rather than block live capture.
- viewers are displayed/context only in default score: jumps often represent raids, not content moments.

Score components clipped to [0,1] after calibrated mappings. Store raw features, baseline, normalized weights, each contribution and threshold crossed. The candidate explanation reads as evidence (“6.4× normal chat, 31 unique chatters, KEKW density 0.28”), not “AI knows this is viral.”

## V3. State and cooldown

Baseline warms for `baseline_window_seconds`; until minimum events, automatic detection is `warming_up` and manual input still works. Candidates require score threshold + absolute minimum MPS + unique chatters. `quiet_chat_mode` offers lower absolute floors and stronger audio weight only when audio is enabled; it does not magically solve silent streams.

At threshold crossing, reserve anchor from event `occurred_at`, create candidate with start `anchor - pre_seconds`, apply session cooldown. Merge overlapping automatic candidates, retaining strongest snapshot and earliest start. Manual candidates bypass score but share rate limits for abuse prevention and never overwrite an existing candidate.

## V4. Profile UI and presets

Wizard: chat sensitivity slider mapped to explicit threshold fields; average chat size; desired clips/hour; clip length; audio/keyword opt-ins; caption language; template preview using licensed sample. Advanced view exposes raw JSON only through validated form, not arbitrary code.

Presets: `busy_gameplay` (defaults above), `small_community` (MPS .25, unique 3, audio encouraged, max 6/hr), `reaction_heavy` (emote .30/chat .30/audio .20/keywords .10/unique .10). These are starting hypotheses, not measured performance claims. Profile test mode replays an authorized recorded session and compares candidates against the active profile without publishing.

## V5. Feedback and tuning

Reject requires one reason: `not_interesting`, `wrong_window`, `too_short`, `bad_crop`, `bad_captions`, `music_risk`, `duplicate`, `other`. Accept and rejection data is tenant private. Recommend threshold/pre-roll changes based on review outcomes; user must apply a new version. Never optimize against public views into automatic posting, and do not auto-change a live profile mid-session.

M1 golden tests: steady chat no trigger; single spammer blocked by unique minimum; emote-only tiny chat no trigger; true distributed burst triggers; cooldown merges; quiet community profile triggers above its own baseline; missing audio behaves explicitly; anchor has pre-roll; manual event works during warm-up.
