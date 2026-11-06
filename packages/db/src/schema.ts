import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const tenant = pgTable("tenant", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  status: text("status").notNull().default("trial"),
  isInternal: boolean("is_internal").notNull().default(false),
  legalHold: boolean("legal_hold").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const membership = pgTable(
  "membership",
  {
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id").notNull(),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.userId] })],
);

export const candidate = pgTable(
  "candidate",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    origin: text("origin").notNull(),
    state: text("state").notNull().default("queued"),
    idempotencyKey: text("idempotency_key").notNull(),
    reason: jsonb("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("candidate_idem").on(table.tenantId, table.idempotencyKey)],
);

export const approval = pgTable("approval", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  candidateId: uuid("candidate_id").notNull(),
  renderId: uuid("render_id").notNull(),
  renderChecksum: text("render_checksum").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  approvedBy: uuid("approved_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const job = pgTable("job", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull(),
  state: text("state").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  fencingToken: integer("fencing_token").notNull().default(0),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
