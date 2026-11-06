import { ClipppyError } from "@clipppy/contracts";
import type { Publisher, UploadInput, UploadResult } from "./types";

export function createMockPublisher(platform: "youtube" | "tiktok", calls: UploadInput[] = []): Publisher {
  return {
    mode: "mock",
    platform,
    async upload(input) {
      calls.push(input);
      return {
        providerPostId: `${platform}_mock_${input.idempotencyKey}`,
        status: input.visibility === "private" ? "private" : "uploaded",
        resumableSessionUri: platform === "youtube" ? `mock://youtube/resumable/${input.idempotencyKey}` : undefined,
      };
    },
  };
}

export function createLiveYouTubeAdapter(env: { clientId?: string; clientSecret?: string }): Publisher {
  return {
    mode: "live",
    platform: "youtube",
    async upload(): Promise<UploadResult> {
      if (!env.clientId || !env.clientSecret) {
        throw new ClipppyError("YOUTUBE_NOT_CONFIGURED", "YouTube OAuth client is not configured.", 503);
      }
      throw new ClipppyError(
        "YOUTUBE_TOKEN_REQUIRED",
        "A tenant YouTube refresh token is required. Resumable videos.insert is not called without one.",
        503,
      );
    },
  };
}

export function createLiveTikTokAdapter(env: { clientKey?: string; clientSecret?: string }): Publisher {
  return {
    mode: "live",
    platform: "tiktok",
    async upload(): Promise<UploadResult> {
      if (!env.clientKey || !env.clientSecret) {
        throw new ClipppyError("TIKTOK_NOT_CONFIGURED", "TikTok client credentials are not configured.", 503);
      }
      throw new ClipppyError(
        "TIKTOK_TOKEN_REQUIRED",
        "A creator token with approved video.upload and video.publish is required.",
        503,
      );
    },
  };
}

export const YOUTUBE_SCOPES = ["youtube.upload"] as const;
export const TIKTOK_SCOPES = ["video.upload", "video.publish"] as const;

export function assertGrantedScopes(granted: string[], required: readonly string[]): void {
  const missing = required.filter((scope) => !granted.includes(scope));
  if (missing.length > 0) {
    throw new ClipppyError("SCOPES_MISSING", `Connection is missing scopes: ${missing.join(", ")}`, 403);
  }
}
