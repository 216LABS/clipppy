import { viralProfileConfigSchema, type RejectReason, type ViralProfileConfig } from "@clipppy/contracts";
import { ClipppyError } from "@clipppy/contracts";

export type ReviewOutcome = { outcome: "accepted" | "rejected"; reason?: RejectReason };

export type Recommendation = {
  id: string;
  message: string;
  apply: (config: ViralProfileConfig) => ViralProfileConfig;
};

export function recommendProfileAdjustments(config: ViralProfileConfig, reviews: ReviewOutcome[]): Recommendation[] {
  const rejected = reviews.filter((review) => review.outcome === "rejected");
  if (reviews.length < 4) return [];
  const share = (reason: RejectReason) => rejected.filter((review) => review.reason === reason).length / reviews.length;
  const recommendations: Recommendation[] = [];
  if (share("wrong_window") >= 0.3) {
    recommendations.push({
      id: "more_preroll",
      message: "Rejected clips often start late. A new profile version could add 5 seconds of pre-roll. Nothing changes until you save it.",
      apply: (current) => {
        const next = structuredClone(current);
        next.window.pre_seconds = Math.min(current.window.max_duration_seconds - 5, current.window.pre_seconds + 5);
        next.window.post_seconds = Math.max(0, Math.min(current.window.post_seconds, current.window.max_duration_seconds - next.window.pre_seconds));
        return viralProfileConfigSchema.parse(next);
      },
    });
  }
  if (share("not_interesting") >= 0.4) {
    recommendations.push({
      id: "higher_threshold",
      message: "Many rejects were not interesting. You can raise the score threshold by 0.05 on the next version.",
      apply: (current) => {
        const next = structuredClone(current);
        next.detection.score_threshold = Math.min(0.9, Math.round((current.detection.score_threshold + 0.05) * 100) / 100);
        return viralProfileConfigSchema.parse(next);
      },
    });
  }
  if (share("too_short") >= 0.3) {
    recommendations.push({
      id: "longer_tail",
      message: "Clips were often too short. You can add 5 seconds after the anchor on the next version.",
      apply: (current) => {
        const next = structuredClone(current);
        const room = current.window.max_duration_seconds - current.window.pre_seconds - current.window.post_seconds;
        next.window.post_seconds = current.window.post_seconds + Math.min(5, Math.max(0, room));
        return viralProfileConfigSchema.parse(next);
      },
    });
  }
  void config;
  return recommendations;
}

export function applyRecommendation(config: ViralProfileConfig, recommendation: Recommendation, confirm: boolean): ViralProfileConfig {
  if (!confirm) {
    throw new ClipppyError("CONFIRM_REQUIRED", "Profile recommendations are never applied automatically.", 400);
  }
  return recommendation.apply(structuredClone(config));
}
