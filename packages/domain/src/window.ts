export type SegmentSpan = { sequence: number; startMs: number; durationMs: number };

export type WindowAssessment =
  | {
      ok: true;
      pendingPostRoll: boolean;
      discontinuities: { atMs: number; gapMs: number }[];
      sequences: number[];
    }
  | { ok: false; code: "MEDIA_WINDOW_EXPIRED"; missingMs: number };

export function assessMediaWindow(input: {
  segments: SegmentSpan[];
  startMs: number;
  endMs: number;
  nowMs: number;
}): WindowAssessment {
  const segments = [...input.segments].sort((a, b) => a.startMs - b.startMs);
  if (segments.length === 0) return { ok: false, code: "MEDIA_WINDOW_EXPIRED", missingMs: input.endMs - input.startMs };
  const covers = (ms: number) => segments.some((segment) => ms >= segment.startMs && ms < segment.startMs + segment.durationMs);
  if (input.startMs < input.nowMs && !covers(input.startMs)) {
    const oldest = segments[0]!.startMs;
    return { ok: false, code: "MEDIA_WINDOW_EXPIRED", missingMs: Math.max(0, oldest - input.startMs) };
  }
  const horizon = Math.min(input.endMs, input.nowMs);
  let cursor = input.startMs;
  const discontinuities: { atMs: number; gapMs: number }[] = [];
  for (const segment of segments) {
    const segEnd = segment.startMs + segment.durationMs;
    if (segEnd <= input.startMs || segment.startMs >= horizon) continue;
    if (segment.startMs > cursor + 500) discontinuities.push({ atMs: cursor, gapMs: segment.startMs - cursor });
    cursor = Math.max(cursor, segEnd);
  }
  if (cursor + 500 < horizon) discontinuities.push({ atMs: cursor, gapMs: horizon - cursor });
  const missing = discontinuities.reduce((sum, gap) => sum + gap.gapMs, 0);
  if (missing > 2000) return { ok: false, code: "MEDIA_WINDOW_EXPIRED", missingMs: missing };
  const sequences = segments
    .filter((segment) => segment.startMs + segment.durationMs > input.startMs && segment.startMs < input.endMs)
    .map((segment) => segment.sequence);
  return { ok: true, pendingPostRoll: input.endMs > input.nowMs, discontinuities, sequences };
}

export function buildLocalTimeline(segments: SegmentSpan[]): {
  spans: { sequence: number; localStartMs: number; durationMs: number }[];
  discontinuities: { afterSequence: number; gapMs: number }[];
} {
  const ordered = [...segments].sort((a, b) => a.sequence - b.sequence);
  const spans: { sequence: number; localStartMs: number; durationMs: number }[] = [];
  const discontinuities: { afterSequence: number; gapMs: number }[] = [];
  let local = 0;
  for (let index = 0; index < ordered.length; index += 1) {
    const segment = ordered[index]!;
    const previous = ordered[index - 1];
    if (previous) {
      const expected = previous.startMs + previous.durationMs;
      const gap = segment.startMs - expected;
      if (gap > 500) discontinuities.push({ afterSequence: previous.sequence, gapMs: gap });
    }
    spans.push({ sequence: segment.sequence, localStartMs: local, durationMs: segment.durationMs });
    local += segment.durationMs;
  }
  return { spans, discontinuities };
}
