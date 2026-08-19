import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "0005_control_plane_foundation.sql"),
  "utf8",
);
const bootstrapSql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "0006_control_plane_bootstrap.sql"),
  "utf8",
);

describe("Control Plane schema boundary", () => {
  it("does not derive internal access from organisation membership", () => {
    expect(sql).not.toMatch(/is_org_member|organisation_members/);
    expect(sql).toMatch(/is_active_internal_user/);
  });

  it("does not grant direct internal-user updates", () => {
    expect(sql).toMatch(/grant select on internal_users to authenticated/);
    expect(sql).not.toMatch(/grant select, update on internal_users/);
  });

  it("makes team changes and audit insertion transactional", () => {
    expect(sql).toMatch(/function change_internal_user_role/);
    expect(sql).toMatch(/function change_internal_user_status/);
    expect(sql).toMatch(/insert into internal_audit_events/);
    expect(sql).toMatch(/final active super admin cannot be changed/);
  });

  it("allows only narrow service-role bootstrap access", () => {
    expect(bootstrapSql).toMatch(/grant select, insert on internal_users to service_role/);
    expect(bootstrapSql).toMatch(/grant select on internal_audit_events to service_role/);
    expect(bootstrapSql).not.toMatch(/grant all|grant update|grant delete/i);
  });
});
