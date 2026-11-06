export type Interval = { startMs: number; endMs: number };

export function evaluateDetector(input: {
  annotations: Interval[];
  candidates: Interval[];
  fullyAnnotated: boolean;
}): { precisionAtReview: number | null; recall: number | null; note: string } {
  const hits = input.candidates.filter((candidate) => input.annotations.some((annotation) => iou(candidate, annotation) >= 0.3)).length;
  const precisionAtReview = input.candidates.length === 0 ? null : hits / input.candidates.length;
  const recall = input.fullyAnnotated && input.annotations.length > 0 ? hits / input.annotations.length : null;
  const note = input.fullyAnnotated
    ? "Precision and recall use the annotated intervals only. They are not a virality claim."
    : "Recall is omitted until the full test stream is annotated.";
  return { precisionAtReview, recall, note };
}

function iou(left: Interval, right: Interval): number {
  const start = Math.max(left.startMs, right.startMs);
  const end = Math.min(left.endMs, right.endMs);
  const overlap = Math.max(0, end - start);
  const union = left.endMs - left.startMs + (right.endMs - right.startMs) - overlap;
  return union <= 0 ? 0 : overlap / union;
}
