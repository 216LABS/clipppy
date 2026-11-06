import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RENDER_JOB_REQUIRED_PATHS, renderJobPayloadSchema } from "./jobs";
import { viralProfileConfigSchema } from "./profile";

describe("contracts", () => {
  it("parses the shared render job fixture and rejects zero weights", () => {
    const file = path.resolve(process.cwd(), "fixtures/contracts/render-job.json");
    const payload = JSON.parse(readFileSync(file, "utf8")) as { profile_snapshot: unknown };
    const parsed = renderJobPayloadSchema.parse(payload);
    expect(parsed.output_key.startsWith(`tenants/${parsed.tenant_id}/`)).toBe(true);
    expect(viralProfileConfigSchema.parse(payload.profile_snapshot).schema_version).toBe(1);
    for (const required of RENDER_JOB_REQUIRED_PATHS) {
      const value = required.split(".").reduce<unknown>((current, key) => {
        if (!current || typeof current !== "object") return undefined;
        return (current as Record<string, unknown>)[key];
      }, parsed);
      expect(value).not.toBeUndefined();
    }
    const broken = viralProfileConfigSchema.parse(payload.profile_snapshot);
    broken.detection.weights = {
      chat_zscore: 0,
      emote_density: 0,
      unique_chatter_zscore: 0,
      audio_rms_zscore: 0,
      keyword_burst: 0,
    };
    expect(viralProfileConfigSchema.safeParse(broken).success).toBe(false);
    broken.detection.weights.chat_zscore = 1;
    broken.detection.keywords = [".*"];
    expect(viralProfileConfigSchema.safeParse(broken).success).toBe(false);
  });
});
