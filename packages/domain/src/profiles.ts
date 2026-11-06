import { viralProfileConfigSchema, type ViralProfileConfig } from "@clipppy/contracts";

const busy: ViralProfileConfig = {
  schema_version: 1,
  language: "en",
  detection: {
    bucket_seconds: 5,
    baseline_window_seconds: 300,
    baseline_min_events: 20,
    score_threshold: 0.72,
    min_messages_per_second: 2,
    min_unique_chatters: 8,
    weights: {
      chat_zscore: 0.4,
      emote_density: 0.2,
      unique_chatter_zscore: 0.15,
      audio_rms_zscore: 0.15,
      keyword_burst: 0.1,
    },
    emote_terms: ["KEKW", "LUL"],
    keywords: ["clip it", "no way", "what just happened"],
    audio_enabled: false,
    keyword_enabled: false,
    redistribute_missing_features: false,
    cooldown_seconds: 90,
    max_candidates_per_hour: 12,
    quiet_chat_mode: false,
  },
  window: { pre_seconds: 15, post_seconds: 30, min_duration_seconds: 15, max_duration_seconds: 60 },
  style: {
    template_id: "gameplay_webcam_v1",
    caption_preset: "karaoke_clean",
    caption_language: "en",
    hook_enabled: true,
    end_card_enabled: true,
    silence_cut_enabled: false,
    face_crop_enabled: false,
    brand_asset_keys: [],
    profanity_policy: "censor_captions_only",
  },
};

const small: ViralProfileConfig = {
  ...structuredClone(busy),
  detection: {
    ...structuredClone(busy.detection),
    baseline_window_seconds: 60,
    baseline_min_events: 8,
    score_threshold: 0.55,
    min_messages_per_second: 0.25,
    min_unique_chatters: 3,
    max_candidates_per_hour: 6,
    audio_enabled: true,
    weights: {
      chat_zscore: 0.35,
      emote_density: 0.15,
      unique_chatter_zscore: 0.15,
      audio_rms_zscore: 0.25,
      keyword_burst: 0.1,
    },
  },
};

const reaction: ViralProfileConfig = {
  ...structuredClone(busy),
  detection: {
    ...structuredClone(busy.detection),
    audio_enabled: true,
    keyword_enabled: true,
    weights: {
      chat_zscore: 0.3,
      emote_density: 0.3,
      unique_chatter_zscore: 0.1,
      audio_rms_zscore: 0.2,
      keyword_burst: 0.1,
    },
  },
  style: { ...structuredClone(busy.style), template_id: "reaction_v1" },
};

export const PRESETS = {
  busy_gameplay: viralProfileConfigSchema.parse(busy),
  small_community: viralProfileConfigSchema.parse(small),
  reaction_heavy: viralProfileConfigSchema.parse(reaction),
} as const;

export type PresetName = keyof typeof PRESETS;

export function clonePreset(name: PresetName): ViralProfileConfig {
  return structuredClone(PRESETS[name]);
}

export function thresholdFromSensitivity(sensitivity: number): number {
  const clamped = Math.min(100, Math.max(0, sensitivity));
  return Math.round((0.9 - clamped * 0.0045) * 100) / 100;
}

export function applyChatPace(
  config: ViralProfileConfig,
  input: { sensitivity: number; messagesPerMinute: number; clipsPerHour: number; clipSeconds: number },
): ViralProfileConfig {
  const next = structuredClone(config);
  next.detection.score_threshold = thresholdFromSensitivity(input.sensitivity);
  next.detection.min_messages_per_second = Math.round((input.messagesPerMinute / 60) * 2 * 100) / 100;
  next.detection.min_unique_chatters = Math.max(2, Math.min(50, Math.round(Math.sqrt(input.messagesPerMinute))));
  next.detection.max_candidates_per_hour = Math.max(1, Math.min(30, Math.round(input.clipsPerHour)));
  const total = Math.max(15, Math.min(next.window.max_duration_seconds, Math.round(input.clipSeconds)));
  const pre = Math.max(10, Math.min(20, next.window.pre_seconds));
  next.window.pre_seconds = pre;
  next.window.post_seconds = Math.max(0, total - pre);
  next.window.min_duration_seconds = 15;
  return viralProfileConfigSchema.parse(next);
}
