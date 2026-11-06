import type { ViralProfileConfig } from "@clipppy/contracts";

export type ChatInput = {
  occurredAtMs: number;
  chatterKey: string;
  text: string;
};

export type AudioSample = { atMs: number; rms: number };

export type BucketFeatures = {
  bucketStartMs: number;
  messageCount: number;
  uniqueChatters: number;
  emoteCount: number;
  tokenCount: number;
  mps: number;
  emoteDensity: number;
  keywordHits: number;
  audioRms: number | null;
  lastEventMs: number | null;
};

export type DecisionStatus = "warming_up" | "below_threshold" | "triggered" | "cooldown_merge" | "hourly_cap";

export type AutoProposal = {
  anchorMs: number;
  startOffsetMs: number;
  endOffsetMs: number;
  score: number;
  summary: string;
  snapshot: Record<string, unknown>;
};

/**
 * Zero-dispersion fallback: when MAD is 0 the baseline is a flat line, so a
 * classic robust z is undefined. We use relative excess over the median,
 * scaled so a +1.0 excess against a baseline magnitude of 1 yields z=3,
 * which is the top of the [0,1] component map. Fixtures cover this branch.
 */
export function robustZ(value: number, median: number, mad: number): { z: number; fallback: boolean } {
  if (mad > 1e-9) return { z: (0.6745 * (value - median)) / mad, fallback: false };
  const excess = Math.max(0, value - median);
  const denom = Math.max(Math.abs(median), 1);
  return { z: (excess / denom) * 3, fallback: true };
}

export function mapComponent(z: number): number {
  return Math.min(1, Math.max(0, z / 3));
}

export function detectMoments(input: {
  events: ChatInput[];
  profile: ViralProfileConfig;
  audio?: AudioSample[];
  sessionId?: string;
}): {
  proposals: AutoProposal[];
  decisions: { bucketStartMs: number; status: DecisionStatus; score: number | null; summary?: string; warnings: string[] }[];
  buckets: BucketFeatures[];
} {
  const profile = input.profile;
  const events = [...input.events].sort((a, b) => a.occurredAtMs - b.occurredAtMs);
  if (events.length === 0) return { proposals: [], decisions: [], buckets: [] };
  const bucketMs = profile.detection.bucket_seconds * 1000;
  const first = Math.floor(events[0]!.occurredAtMs / bucketMs) * bucketMs;
  const last = Math.floor(events[events.length - 1]!.occurredAtMs / bucketMs) * bucketMs;
  const buckets: BucketFeatures[] = [];
  for (let cursor = first; cursor <= last; cursor += bucketMs) {
    buckets.push(buildBucket(cursor, bucketMs, events, profile, input.audio ?? []));
  }
  const floors = effectiveFloors(profile);
  const proposals: AutoProposal[] = [];
  const decisions: { bucketStartMs: number; status: DecisionStatus; score: number | null; summary?: string; warnings: string[] }[] = [];
  let seen = 0;
  for (const bucket of buckets) {
    const prior = buckets.filter(
      (item) =>
        item.bucketStartMs < bucket.bucketStartMs &&
        item.bucketStartMs >= bucket.bucketStartMs - profile.detection.baseline_window_seconds * 1000,
    );
    const warmed =
      seen >= profile.detection.baseline_min_events &&
      bucket.bucketStartMs - first >= profile.detection.baseline_window_seconds * 1000;
    seen += bucket.messageCount;
    if (!warmed) {
      decisions.push({ bucketStartMs: bucket.bucketStartMs, status: "warming_up", score: null, warnings: [] });
      continue;
    }
    const scored = scoreBucket(bucket, prior, profile, floors);
    const passed =
      scored.score >= profile.detection.score_threshold &&
      bucket.mps >= floors.minMps &&
      bucket.uniqueChatters >= floors.minUnique &&
      bucket.messageCount > 0;
    if (!passed) {
      decisions.push({
        bucketStartMs: bucket.bucketStartMs,
        status: "below_threshold",
        score: scored.score,
        summary: scored.summary,
        warnings: scored.warnings,
      });
      continue;
    }
    const anchorMs = bucket.lastEventMs ?? bucket.bucketStartMs;
    const startOffsetMs = -Math.max(10, profile.window.pre_seconds) * 1000;
    const endOffsetMs = profile.window.post_seconds * 1000;
    const proposal: AutoProposal = {
      anchorMs,
      startOffsetMs,
      endOffsetMs,
      score: scored.score,
      summary: scored.summary,
      snapshot: scored.snapshot,
    };
    const previous = proposals[proposals.length - 1];
    if (previous && anchorMs - previous.anchorMs < profile.detection.cooldown_seconds * 1000) {
      const prevStart = previous.anchorMs + previous.startOffsetMs;
      const prevEnd = previous.anchorMs + previous.endOffsetMs;
      const nextStart = anchorMs + startOffsetMs;
      const nextEnd = anchorMs + endOffsetMs;
      const overlaps = nextStart <= prevEnd && nextEnd >= prevStart;
      if (overlaps && proposal.score > previous.score) {
        previous.score = proposal.score;
        previous.summary = proposal.summary;
        previous.snapshot = proposal.snapshot;
      }
      if (overlaps && nextStart < prevStart) {
        previous.startOffsetMs = nextStart - previous.anchorMs;
      }
      decisions.push({
        bucketStartMs: bucket.bucketStartMs,
        status: "cooldown_merge",
        score: scored.score,
        summary: scored.summary,
        warnings: scored.warnings,
      });
      continue;
    }
    const hourAgo = anchorMs - 3_600_000;
    const recent = proposals.filter((item) => item.anchorMs >= hourAgo).length;
    if (recent >= profile.detection.max_candidates_per_hour) {
      decisions.push({ bucketStartMs: bucket.bucketStartMs, status: "hourly_cap", score: scored.score, warnings: scored.warnings });
      continue;
    }
    proposals.push(proposal);
    decisions.push({
      bucketStartMs: bucket.bucketStartMs,
      status: "triggered",
      score: scored.score,
      summary: scored.summary,
      warnings: scored.warnings,
    });
  }
  return { proposals, decisions, buckets };
}

function effectiveFloors(profile: ViralProfileConfig) {
  const weights = { ...profile.detection.weights };
  let minMps = profile.detection.min_messages_per_second;
  let minUnique = profile.detection.min_unique_chatters;
  if (profile.detection.quiet_chat_mode) {
    minMps = Math.min(minMps, Math.max(0.15, minMps * 0.5));
    minUnique = Math.max(2, Math.floor(minUnique * 0.5));
    if (profile.detection.audio_enabled) weights.audio_rms_zscore = Math.min(1, weights.audio_rms_zscore * 1.5);
  }
  return { minMps, minUnique, weights };
}

function buildBucket(
  bucketStartMs: number,
  bucketMs: number,
  events: ChatInput[],
  profile: ViralProfileConfig,
  audio: AudioSample[],
): BucketFeatures {
  const slice = events.filter((event) => event.occurredAtMs >= bucketStartMs && event.occurredAtMs < bucketStartMs + bucketMs);
  const chatters = new Set<string>();
  let emoteCount = 0;
  let tokenCount = 0;
  let keywordHits = 0;
  const terms = new Set(profile.detection.emote_terms.map((term) => term.toLowerCase()));
  const keywords = profile.detection.keywords.map((keyword) => keyword.toLowerCase());
  for (const event of slice) {
    chatters.add(event.chatterKey);
    const tokens = event.text.split(/\s+/).filter(Boolean);
    tokenCount += tokens.length;
    for (const token of tokens) {
      if (terms.has(token.toLowerCase())) emoteCount += 1;
    }
    const lower = event.text.toLowerCase();
    if (keywords.some((keyword) => lower.includes(keyword))) keywordHits += 1;
  }
  const samples = audio.filter((sample) => sample.atMs >= bucketStartMs && sample.atMs < bucketStartMs + bucketMs);
  const audioRms = samples.length ? samples.reduce((sum, sample) => sum + sample.rms, 0) / samples.length : null;
  return {
    bucketStartMs,
    messageCount: slice.length,
    uniqueChatters: chatters.size,
    emoteCount,
    tokenCount,
    mps: slice.length / profile.detection.bucket_seconds,
    emoteDensity: tokenCount === 0 ? 0 : emoteCount / tokenCount,
    keywordHits,
    audioRms,
    lastEventMs: slice.length ? slice[slice.length - 1]!.occurredAtMs : null,
  };
}

function scoreBucket(
  bucket: BucketFeatures,
  prior: BucketFeatures[],
  profile: ViralProfileConfig,
  floors: ReturnType<typeof effectiveFloors>,
) {
  const mpsMedian = median(prior.map((item) => item.mps));
  const mpsMad = mad(prior.map((item) => item.mps), mpsMedian);
  const uniqueMedian = median(prior.map((item) => item.uniqueChatters));
  const uniqueMad = mad(prior.map((item) => item.uniqueChatters), uniqueMedian);
  const chat = robustZ(bucket.mps, mpsMedian, mpsMad);
  const unique = robustZ(bucket.uniqueChatters, uniqueMedian, uniqueMad);
  const warnings: string[] = [];
  const audioMissing = profile.detection.audio_enabled && bucket.audioRms == null;
  if (audioMissing) warnings.push("AUDIO_FEATURE_MISSING");
  let audioZ = { z: 0, fallback: false };
  if (profile.detection.audio_enabled && bucket.audioRms != null) {
    const values = prior.map((item) => item.audioRms).filter((value): value is number => value != null);
    const audioMedian = median(values);
    audioZ = robustZ(bucket.audioRms, audioMedian, mad(values, audioMedian));
  }
  const emote = bucket.emoteCount < 3 ? Math.min(0.2, bucket.emoteDensity) : Math.min(1, bucket.emoteDensity / 0.35);
  const keyword = Math.min(1, bucket.keywordHits / 3);
  const parts: { key: keyof typeof floors.weights; component: number; enabled: boolean; missing: boolean }[] = [
    { key: "chat_zscore", component: mapComponent(chat.z), enabled: true, missing: false },
    { key: "emote_density", component: emote, enabled: true, missing: false },
    { key: "unique_chatter_zscore", component: mapComponent(unique.z), enabled: true, missing: false },
    { key: "audio_rms_zscore", component: audioMissing ? 0 : mapComponent(audioZ.z), enabled: profile.detection.audio_enabled, missing: audioMissing },
    { key: "keyword_burst", component: keyword, enabled: profile.detection.keyword_enabled, missing: false },
  ];
  let active = parts.filter((part) => part.enabled);
  if (profile.detection.redistribute_missing_features) active = active.filter((part) => !part.missing);
  const weightSum = active.reduce((sum, part) => sum + floors.weights[part.key], 0);
  const contributions = active.map((part) => {
    const weight = weightSum === 0 ? 0 : floors.weights[part.key] / weightSum;
    return { feature: part.key, weight, component: part.component, contribution: weight * part.component, missing: part.missing };
  });
  const score = contributions.reduce((sum, part) => sum + part.contribution, 0);
  const ratio = mpsMedian > 0.05 ? bucket.mps / mpsMedian : null;
  const summary = ratio
    ? `${ratio.toFixed(1)}× normal chat, ${bucket.uniqueChatters} unique chatters, emote density ${bucket.emoteDensity.toFixed(2)}`
    : `${bucket.mps.toFixed(1)} messages/sec on a flat baseline, ${bucket.uniqueChatters} unique chatters, emote density ${bucket.emoteDensity.toFixed(2)}`;
  return {
    score,
    summary,
    warnings,
    snapshot: {
      features: bucket,
      baseline: { mpsMedian, mpsMad, uniqueMedian, uniqueMad, samples: prior.length, dispersionFallback: chat.fallback || unique.fallback },
      normalizedWeights: Object.fromEntries(contributions.map((part) => [part.feature, part.weight])),
      contributions,
      thresholds: {
        score: profile.detection.score_threshold,
        minMps: floors.minMps,
        minUnique: floors.minUnique,
      },
      warnings,
    },
  };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return sorted[mid] ?? 0;
}

function mad(values: number[], center: number): number {
  if (values.length === 0) return 0;
  return median(values.map((value) => Math.abs(value - center)));
}

export function steadyChat(startMs: number, seconds: number, chatters: string[]): ChatInput[] {
  const events: ChatInput[] = [];
  for (let second = 0; second < seconds; second += 1) {
    events.push({
      occurredAtMs: startMs + second * 1000,
      chatterKey: chatters[second % chatters.length] ?? "c",
      text: second % 23 === 0 ? "nice round" : "ok",
    });
  }
  return events;
}

export function distributedBurst(anchorMs: number, chatters = 15, messages = 30): ChatInput[] {
  const events: ChatInput[] = [];
  for (let index = 0; index < messages; index += 1) {
    events.push({
      occurredAtMs: anchorMs + (index % 4) * 800,
      chatterKey: `burst-${index % chatters}`,
      text: index % 2 === 0 ? "KEKW no way" : "what just happened",
    });
  }
  return events;
}
