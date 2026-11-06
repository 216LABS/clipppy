import { describe, expect, it } from "vitest";
import { clonePreset } from "./profiles";
import { detectMoments, distributedBurst, mapComponent, robustZ, steadyChat, type AudioSample, type ChatInput } from "./scoring";

const chatters = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];

describe("viral profile detector", () => {
  it("documents the zero-dispersion robust-z fallback", () => {
    expect(robustZ(4, 1, 0)).toEqual({ z: 9, fallback: true });
    expect(robustZ(4, 1, 1).fallback).toBe(false);
    expect(robustZ(4, 1, 1).z).toBeCloseTo(0.6745 * 3);
    expect(mapComponent(3)).toBe(1);
    expect(mapComponent(-2)).toBe(0);
  });

  it("does not trigger on steady chat, a single spammer, or one emote", () => {
    const profile = clonePreset("busy_gameplay");
    const steady = detectMoments({ events: steadyChat(0, 360, chatters), profile });
    expect(steady.proposals).toHaveLength(0);

    const spammer = steadyChat(0, 300, chatters);
    for (let index = 0; index < 25; index += 1) {
      spammer.push({ occurredAtMs: 300_000 + index * 100, chatterKey: "only-one", text: "KEKW KEKW KEKW" });
    }
    expect(detectMoments({ events: spammer, profile }).proposals).toHaveLength(0);

    const tiny = steadyChat(0, 300, chatters);
    tiny.push({ occurredAtMs: 300_000, chatterKey: "solo", text: "KEKW" });
    expect(detectMoments({ events: tiny, profile }).proposals).toHaveLength(0);
  });

  it("triggers a distributed burst, keeps pre-roll, and merges the cooldown", () => {
    const profile = clonePreset("busy_gameplay");
    const events = [...steadyChat(0, 300, chatters), ...distributedBurst(300_000)];
    const detected = detectMoments({ events, profile });
    expect(detected.proposals).toHaveLength(1);
    const proposal = detected.proposals[0]!;
    expect(proposal.score).toBeGreaterThanOrEqual(profile.detection.score_threshold);
    expect(proposal.startOffsetMs).toBe(-15_000);
    expect(proposal.summary).not.toMatch(/viral|AI knows/i);
    expect(proposal.summary).toMatch(/unique chatters/);

    const second = [...events, ...distributedBurst(320_000, 15, 40)];
    const merged = detectMoments({ events: second, profile });
    expect(merged.proposals).toHaveLength(1);
    expect(merged.decisions.some((decision) => decision.status === "cooldown_merge")).toBe(true);
    expect(merged.proposals[0]!.anchorMs).toBe(detected.proposals[0]!.anchorMs);
  });

  it("lets a small-community profile trigger above its own baseline", () => {
    const small = clonePreset("small_community");
    const busy = clonePreset("busy_gameplay");
    const events: ChatInput[] = [];
    for (let index = 0; index < 10; index += 1) {
      events.push({ occurredAtMs: index * 7_000, chatterKey: `quiet-${index % 3}`, text: "hey" });
    }
    const burstAt = 70_000;
    for (let index = 0; index < 4; index += 1) {
      events.push({ occurredAtMs: burstAt + index * 400, chatterKey: `fan-${index}`, text: "no way" });
    }
    const audio: AudioSample[] = [];
    for (let at = 0; at < 70_000; at += 5_000) audio.push({ atMs: at, rms: 0.02 });
    audio.push({ atMs: burstAt, rms: 0.8 });
    const modest = detectMoments({ events, profile: small, audio });
    expect(modest.proposals.length).toBeGreaterThan(0);
    expect(detectMoments({ events, profile: busy, audio }).proposals).toHaveLength(0);
  });

  it("records missing audio explicitly and still accepts manual-time warm-up silence", () => {
    const profile = clonePreset("busy_gameplay");
    profile.detection.audio_enabled = true;
    profile.detection.score_threshold = 0.6;
    const events = [...steadyChat(0, 300, chatters), ...distributedBurst(300_000)];
    const detected = detectMoments({ events, profile });
    const scored = detected.decisions.find((decision) => decision.status === "triggered" || decision.warnings.includes("AUDIO_FEATURE_MISSING"));
    expect(detected.decisions.some((decision) => decision.warnings.includes("AUDIO_FEATURE_MISSING"))).toBe(true);
    const snapshot = detected.proposals[0]?.snapshot as { contributions?: { feature: string; missing?: boolean }[] } | undefined;
    const audio = snapshot?.contributions?.find((item) => item.feature === "audio_rms_zscore");
    expect(audio?.missing).toBe(true);
    expect(scored).toBeTruthy();

    const cold = detectMoments({ events: steadyChat(0, 5, chatters), profile: clonePreset("busy_gameplay") });
    expect(cold.proposals).toHaveLength(0);
    expect(cold.decisions.every((decision) => decision.status === "warming_up")).toBe(true);
  });
});
