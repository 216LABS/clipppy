import type { AppEnv } from "@clipppy/contracts";

export type PublishPlatform = "youtube" | "tiktok";

export type Publisher = {
  readonly mode: "mock" | "live";
  readonly platform: PublishPlatform;
  upload(input: UploadInput): Promise<UploadResult>;
};

export type UploadInput = {
  tenantId: string;
  publicationId: string;
  idempotencyKey: string;
  checksumSha256: string;
  title: string;
  description: string;
  tags: string[];
  objectKey: string;
  visibility: "public" | "unlisted" | "private";
  timeoutMs: number;
};

export type UploadResult = {
  providerPostId: string;
  status: "uploaded" | "processing" | "private";
  resumableSessionUri?: string;
};

export type PublishGateInput = {
  appEnv: AppEnv;
  adapter: Publisher;
  candidateState: string;
  approval: {
    id: string;
    renderId: string;
    renderChecksum: string;
    tenantId: string;
    title: string;
    description: string;
    tags: string[];
  } | null;
  render: {
    id: string;
    checksumSha256: string | null;
    tenantId: string;
    objectKey: string | null;
  } | null;
  publication: {
    id: string;
    status: string;
    providerPostId: string | null;
    idempotencyKey: string;
    destinationId: string;
  };
  destination: {
    id: string;
    platform: PublishPlatform;
    tenantId: string;
    status: string;
    appVisibility: "unaudited" | "audited";
    allowedVisibility: Array<"public" | "unlisted" | "private">;
  };
  entitlementAllowsPublish: boolean;
  killSwitch: boolean;
  requestedVisibility: "public" | "unlisted" | "private";
};
