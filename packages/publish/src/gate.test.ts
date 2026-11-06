import { describe, expect, it } from "vitest";
import { createMockPublisher, createLiveYouTubeAdapter } from "./adapters";
import { executePublish } from "./gate";
import type { PublishGateInput } from "./types";

const checksum = "a".repeat(64);

function base(overrides: Partial<PublishGateInput> = {}): PublishGateInput {
  const calls: Parameters<ReturnType<typeof createMockPublisher>["upload"]>[0][] = [];
  const adapter = createMockPublisher("youtube", calls);
  return {
    appEnv: "test",
    adapter,
    candidateState: "approved",
    approval: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      renderId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      renderChecksum: checksum,
      tenantId: "11111111-1111-4111-8111-111111111111",
      title: "Heist exit",
      description: "Draft from an authorized test stream.",
      tags: ["gta"],
    },
    render: {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      checksumSha256: checksum,
      tenantId: "11111111-1111-4111-8111-111111111111",
      objectKey: "tenants/11111111-1111-4111-8111-111111111111/renders/cut.mp4",
    },
    publication: {
      id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
      status: "queued",
      providerPostId: null,
      idempotencyKey: "pub:1",
      destinationId: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
    },
    destination: {
      id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1",
      platform: "youtube",
      tenantId: "11111111-1111-4111-8111-111111111111",
      status: "connected",
      appVisibility: "unaudited",
      allowedVisibility: ["unlisted", "private"],
    },
    entitlementAllowsPublish: true,
    killSwitch: false,
    requestedVisibility: "unlisted",
    ...overrides,
  };
}

describe("publish gate", () => {
  it("uploads once and replays the provider id", async () => {
    const calls: Parameters<ReturnType<typeof createMockPublisher>["upload"]>[0][] = [];
    const adapter = createMockPublisher("youtube", calls);
    const input = base({ adapter });
    const first = await executePublish(input);
    expect(first.duplicate).toBe(false);
    expect(first.providerPostId).toBe("youtube_mock_pub:1");
    input.publication.providerPostId = first.providerPostId;
    const second = await executePublish(input);
    expect(second.duplicate).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.checksumSha256).toBe(checksum);
  });

  it("never uploads a rejection, a stale checksum, or a live adapter outside production", async () => {
    const calls: Parameters<ReturnType<typeof createMockPublisher>["upload"]>[0][] = [];
    const adapter = createMockPublisher("youtube", calls);
    await expect(executePublish(base({ adapter, candidateState: "rejected" }))).rejects.toThrow(/never uploaded/);
    await expect(
      executePublish(base({ adapter, render: { ...base().render!, checksumSha256: "b".repeat(64) } })),
    ).rejects.toThrow(/does not match/);
    await expect(executePublish(base({ adapter, approval: null }))).rejects.toThrow(/must approve/);
    await expect(executePublish(base({ adapter: createLiveYouTubeAdapter({ clientId: "x", clientSecret: "y" }), appEnv: "staging" }))).rejects.toThrow(
      /hard-blocked/,
    );
    expect(calls).toHaveLength(0);
  });

  it("keeps unaudited TikTok private and honors the kill switch", async () => {
    const calls: Parameters<ReturnType<typeof createMockPublisher>["upload"]>[0][] = [];
    const adapter = createMockPublisher("tiktok", calls);
    const posted = await executePublish(
      base({
        adapter,
        requestedVisibility: "public",
        destination: {
          ...base().destination,
          platform: "tiktok",
          appVisibility: "unaudited",
          allowedVisibility: ["private"],
        },
      }),
    );
    expect(posted.status).toBe("private");
    expect(calls[0]?.visibility).toBe("private");
    await expect(executePublish(base({ adapter, killSwitch: true }))).rejects.toThrow(/kill switch/);
  });
});
