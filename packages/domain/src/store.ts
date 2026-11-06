import type { CandidateOrigin, CandidateState, RejectReason, ViralProfileConfig } from "@clipppy/contracts";
import type { JobRecord } from "@clipppy/jobs";

export type Role = "owner" | "editor" | "viewer";
export type TenantStatus = "trial" | "active" | "past_due" | "suspended" | "canceled";
export type PermissionBasis = "owned" | "customer_contract" | "written_permission" | "campaign";
export type Visibility = "public" | "unlisted" | "private";

export type PlanCaps = {
  concurrentStreams: number;
  storedMinutes: number;
  rendersPerMonth: number;
  uploadDestinations: number;
  maxClipSeconds: number;
  candidatesPerHour: number;
  gpuMinutes: number;
};

export type Tenant = {
  id: string;
  slug: string;
  displayName: string;
  status: TenantStatus;
  isInternal: boolean;
  legalHold: boolean;
  createdAt: string;
};

export type User = { id: string; email: string; displayName: string };
export type Membership = { tenantId: string; userId: string; role: Role };

export type AuthorizedSource = {
  id: string;
  tenantId: string;
  platform: "twitch" | "kick";
  platformChannelId: string;
  channelLogin: string;
  permissionBasis: PermissionBasis;
  permissionReference: string | null;
  permissionGrantedAt: string;
  revokedAt: string | null;
  senderPolicy: { mode: "broadcaster_and_mods" | "broadcaster" | "allowlist"; allowlist: string[] };
  createdAt: string;
};

export type ViralProfile = {
  id: string;
  tenantId: string;
  sourceId: string | null;
  name: string;
  version: number;
  isActive: boolean;
  config: ViralProfileConfig;
  createdBy: string | null;
  createdAt: string;
};

export type StreamSession = {
  id: string;
  tenantId: string;
  sourceId: string;
  providerSessionId: string | null;
  title: string;
  gameId: string | null;
  gameName: string | null;
  language: string;
  startedAt: string;
  endedAt: string | null;
  status: "connecting" | "live" | "degraded" | "ended" | "error";
  profileId: string;
  profileVersion: number;
  recorderWorker: string | null;
  recorderLeaseUntil: string | null;
  recorderEpoch: number;
};

export type MediaSegment = {
  id: string;
  tenantId: string;
  sessionId: string;
  sequence: number;
  objectKey: string;
  startedAtMs: number;
  durationMs: number;
  sha256: string;
  expiresAt: string;
};

export type Candidate = {
  id: string;
  tenantId: string;
  sessionId: string;
  origin: CandidateOrigin;
  anchorAt: string | null;
  segmentCursor: { sequences: number[]; pendingPostRoll: boolean; discontinuities: number };
  startOffsetMs: number;
  endOffsetMs: number;
  state: CandidateState;
  score: number | null;
  reason: Record<string, unknown>;
  signalSnapshot: Record<string, unknown>;
  requestId: string | null;
  requestedBy: string | null;
  note: string | null;
  actorLabel: string | null;
  profileId: string | null;
  profileVersion: number | null;
  idempotencyKey: string;
  createdAt: string;
};

export type RenderArtifact = {
  id: string;
  tenantId: string;
  candidateId: string;
  version: number;
  profileVersion: number;
  timeline: Record<string, unknown>;
  objectKey: string | null;
  checksumSha256: string | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
  status: "queued" | "rendering" | "succeeded" | "failed";
  errorCode: string | null;
  warnings: string[];
  engineVersion: string;
  createdAt: string;
};

export type Destination = {
  id: string;
  tenantId: string;
  platform: "youtube" | "tiktok";
  label: string;
  tokenCiphertext: string;
  scopes: string[];
  status: "connected" | "disconnected" | "error";
  appVisibility: "unaudited" | "audited";
  allowedVisibility: Visibility[];
  createdAt: string;
};

export type Approval = {
  id: string;
  tenantId: string;
  candidateId: string;
  renderId: string;
  renderChecksum: string;
  title: string;
  description: string;
  tags: string[];
  destinationIds: string[];
  approvedBy: string;
  createdAt: string;
};

export type Publication = {
  id: string;
  tenantId: string;
  approvalId: string;
  destinationId: string;
  providerPostId: string | null;
  status: "queued" | "uploading" | "published" | "failed" | "cancelled";
  attempts: number;
  lastErrorCode: string | null;
  retryable: boolean;
  idempotencyKey: string;
  requestedVisibility: Visibility;
  createdAt: string;
};

export type Entitlement = {
  tenantId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  priceId: string | null;
  status: TenantStatus;
  currentPeriodEnd: string | null;
  seats: number;
  caps: PlanCaps;
  graceDays: number;
  updatedAt: string;
};

export type ClipHook = {
  id: string;
  publicId: string;
  tenantId: string;
  sourceId: string;
  name: string;
  secretCiphertext: string;
  secretHash: string;
  disabledAt: string | null;
  createdAt: string;
};

export type AuditEvent = {
  id: number;
  tenantId: string | null;
  actorUserId: string | null;
  actorType: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type UsageReservation = {
  id: string;
  tenantId: string;
  kind: "render" | "capture" | "upload";
  amount: number;
  status: "reserved" | "settled" | "refunded";
  createdAt: string;
};

export type DiscoveryHit = {
  id: string;
  tenantId: string;
  platform: "twitch" | "kick";
  platformChannelId: string;
  login: string;
  gameId: string;
  viewerCount: number;
  language: string;
  authorized: false;
  createdAt: string;
};

export type Onboarding = {
  tenantId: string;
  attestation: null | { basis: PermissionBasis; reference: string; acceptedAt: string; acceptedBy: string };
  channel: null | { platform: "twitch" | "kick"; platformChannelId: string; login: string };
  ingestConnected: boolean;
  grantedScopes: string[];
  profileId: string | null;
  activatedSourceId: string | null;
};

export type ChatRecord = {
  id: string;
  tenantId: string;
  sessionId: string;
  providerEventId: string;
  occurredAt: string;
  chatterKey: string;
  messageRedacted: string | null;
  rawRef: string | null;
};

export type StoreData = {
  users: User[];
  tenants: Tenant[];
  memberships: Membership[];
  sources: AuthorizedSource[];
  profiles: ViralProfile[];
  sessions: StreamSession[];
  segments: MediaSegment[];
  candidates: Candidate[];
  renders: RenderArtifact[];
  destinations: Destination[];
  approvals: Approval[];
  publications: Publication[];
  jobs: JobRecord[];
  entitlements: Entitlement[];
  hooks: ClipHook[];
  replays: string[];
  audits: AuditEvent[];
  reservations: UsageReservation[];
  discoveries: DiscoveryHit[];
  stripeEvents: string[];
  providerEvents: string[];
  outbox: { id: string; type: string; payload: Record<string, unknown>; createdAt: string }[];
  onboardings: Onboarding[];
  killSwitch: { global: boolean; destinations: Record<string, boolean> };
  chat: ChatRecord[];
  chatRate: { key: string; at: string }[];
  adminEmails: string[];
};

export type Actor = { type: "user"; userId: string; tenantId: string };

export class MemoryStore {
  data: StoreData;

  constructor(data: StoreData) {
    this.data = data;
  }

  transaction<T>(fn: () => T): T {
    const backup = structuredClone(this.data);
    try {
      return fn();
    } catch (error) {
      this.data = backup;
      throw error;
    }
  }
}

export function emptyStore(): MemoryStore {
  return new MemoryStore({
    users: [],
    tenants: [],
    memberships: [],
    sources: [],
    profiles: [],
    sessions: [],
    segments: [],
    candidates: [],
    renders: [],
    destinations: [],
    approvals: [],
    publications: [],
    jobs: [],
    entitlements: [],
    hooks: [],
    replays: [],
    audits: [],
    reservations: [],
    discoveries: [],
    stripeEvents: [],
    providerEvents: [],
    outbox: [],
    onboardings: [],
    killSwitch: { global: false, destinations: {} },
    chat: [],
    chatRate: [],
    adminEmails: ["flip@216labs.test"],
  });
}

export function defaultCaps(overrides: Partial<PlanCaps> = {}): PlanCaps {
  return {
    concurrentStreams: 1,
    storedMinutes: 600,
    rendersPerMonth: 120,
    uploadDestinations: 2,
    maxClipSeconds: 60,
    candidatesPerHour: 30,
    gpuMinutes: 300,
    ...overrides,
  };
}

export function audit(
  store: MemoryStore,
  event: Omit<AuditEvent, "id" | "createdAt"> & { createdAt?: string },
): void {
  store.data.audits.push({
    id: store.data.audits.length + 1,
    createdAt: event.createdAt ?? new Date().toISOString(),
    tenantId: event.tenantId,
    actorUserId: event.actorUserId,
    actorType: event.actorType,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    metadata: event.metadata,
  });
}

export const ENGINE_VERSION = "clipppy-render-0.1.0";

export function rejectReasonOrThrow(value: string): RejectReason {
  const allowed: RejectReason[] = [
    "not_interesting",
    "wrong_window",
    "too_short",
    "bad_crop",
    "bad_captions",
    "music_risk",
    "duplicate",
    "other",
  ];
  if (!allowed.includes(value as RejectReason)) {
    throw new Error(`Unknown reject reason ${value}`);
  }
  return value as RejectReason;
}
