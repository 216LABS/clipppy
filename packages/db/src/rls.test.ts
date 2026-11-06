import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrationSql } from "./index";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const viewer = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const sourceA = "33333333-3333-4333-8333-333333333331";
const sessionA = "55555555-5555-4555-8555-555555555551";
const profileA = "44444444-4444-4444-8444-444444444441";
const candidateA = "66666666-6666-4666-8666-666666666661";
const renderA = "77777777-7777-4777-8777-777777777771";

let db: PGlite;

async function setActor(userId: string | null, role = "member") {
  await db.exec(`set role clipppy_app`);
  await db.query(`select set_config('app.user_id', $1, false)`, [userId ?? ""]);
  await db.query(`select set_config('app.role', $1, false)`, [role]);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(migrationSql());
  await db.exec(`
    insert into auth.users (id, email) values
      ('${userA}', 'flip@216labs.test'),
      ('${userB}', 'harbor@example.test'),
      ('${viewer}', 'viewer@216labs.test');
    insert into tenant (id, slug, display_name, status, is_internal) values
      ('${tenantA}', 'gta6-flip-test', 'GTA 6 launch test', 'active', true),
      ('${tenantB}', 'harbor-synthetic', 'Harbor synthetic', 'trial', false);
    insert into membership (tenant_id, user_id, role) values
      ('${tenantA}', '${userA}', 'owner'),
      ('${tenantA}', '${viewer}', 'viewer'),
      ('${tenantB}', '${userB}', 'owner');
    insert into authorized_source (id, tenant_id, platform, platform_channel_id, channel_login, permission_basis, permission_reference, permission_granted_at)
      values ('${sourceA}', '${tenantA}', 'twitch', 'flip-gta6-test', 'flip_gta6_test', 'owned', 'owned fixture', now());
    insert into viral_profile (id, tenant_id, source_id, name, version, config)
      values ('${profileA}', '${tenantA}', '${sourceA}', 'busy', 1, '{}'::jsonb);
    insert into stream_session (id, tenant_id, source_id, started_at, profile_id, profile_version, status)
      values ('${sessionA}', '${tenantA}', '${sourceA}', now(), '${profileA}', 1, 'live');
    insert into candidate (id, tenant_id, session_id, origin, segment_cursor, start_offset_ms, end_offset_ms, idempotency_key, state)
      values ('${candidateA}', '${tenantA}', '${sessionA}', 'dashboard', '{}'::jsonb, -15000, 30000, 'dash:seed', 'review');
    insert into render (id, tenant_id, candidate_id, version, profile_version, timeline, checksum_sha256, status)
      values ('${renderA}', '${tenantA}', '${candidateA}', 1, 1, '{}'::jsonb, '${"ab".repeat(32)}', 'succeeded');
    insert into job (tenant_id, kind, payload, idempotency_key) values
      ('${tenantA}', 'clip.render', '{}'::jsonb, 'job-a');
  `);
});

afterAll(async () => {
  await db.close();
});

describe("postgres rls", () => {
  it("hides tenant A from tenant B and blocks viewer approvals", async () => {
    await setActor(userB);
    const candidates = await db.query<{ id: string }>(`select id from candidate`);
    expect(candidates.rows).toHaveLength(0);
    const tenants = await db.query<{ slug: string }>(`select slug from tenant order by slug`);
    expect(tenants.rows.map((row) => row.slug)).toEqual(["harbor-synthetic"]);
    await expect(
      db.exec(`insert into candidate (tenant_id, session_id, origin, segment_cursor, start_offset_ms, end_offset_ms, idempotency_key)
        values ('${tenantA}', '${sessionA}', 'dashboard', '{}'::jsonb, -15000, 30000, 'stolen')`),
    ).rejects.toThrow();

    await setActor(viewer);
    await expect(
      db.exec(`insert into approval (tenant_id, candidate_id, render_id, render_checksum, title, description, approved_by)
        values ('${tenantA}', '${candidateA}', '${renderA}', '${"ab".repeat(32)}', 'Nope', 'Nope', '${viewer}')`),
    ).rejects.toThrow();

    await setActor(userA);
    await db.exec(`insert into approval (tenant_id, candidate_id, render_id, render_checksum, title, description, approved_by)
      values ('${tenantA}', '${candidateA}', '${renderA}', '${"ab".repeat(32)}', 'Exact cut', 'Approved fixture', '${userA}')`);
    const visible = await db.query(`select id from candidate`);
    expect(visible.rows).toHaveLength(1);
    const blocked = await db.query(`update approval set title = 'changed' returning id`);
    expect(blocked.rows).toHaveLength(0);
    await db.exec(`reset role`);
    await expect(db.exec(`update approval set title = 'changed'`)).rejects.toThrow(/insert-only/);
    await expect(db.exec(`update render set checksum_sha256 = '${"cd".repeat(32)}'`)).rejects.toThrow(/immutable/);
  });

  it("leases a job once and rejects a second owner while the lease is live", async () => {
    await setActor(null, "service");
    const first = await db.query<{ fencing_token: string }>(`select fencing_token from lease_job('worker-a', 60)`);
    expect(first.rows).toHaveLength(1);
    const second = await db.query(`select id from lease_job('worker-b', 60)`);
    expect(second.rows).toHaveLength(0);
    const token = Number(first.rows[0]?.fencing_token);
    expect(token).toBe(1);
  });

  it("refuses a discovery row that claims authorization", async () => {
    await setActor(null, "service");
    await expect(
      db.exec(`insert into discovery_hit (tenant_id, platform, platform_channel_id, login, authorized)
        values ('${tenantA}', 'twitch', 'stranger', 'stranger', true)`),
    ).rejects.toThrow();
  });
});
