import { readFileSync } from "node:fs"; import { join } from "node:path"; import { describe, expect, it } from "vitest";
const sql=readFileSync(join(process.cwd(),"supabase/migrations/0007_control_plane_prospects.sql"),"utf8");
describe("Control prospect schema",()=>{
  it("keeps prospect identity separate from customer organisations",()=>{expect(sql).toMatch(/create table prospect_organisations/);expect(sql).not.toMatch(/prospect_organisations \([^]*organisation_id uuid references organisations/);});
  it("requires provenance on every extracted fact",()=>{for(const column of ["source_id","source_url","locator","authority","verification_state","extracted_at"]) expect(sql).toContain(column);});
  it("uses an atomic guarded research replacement",()=>{expect(sql).toMatch(/security definer/);expect(sql).toMatch(/cross-prospect research payload rejected/);expect(sql).toMatch(/is_active_internal_user/);});
  it("does not give every internal role prospect write access",()=>{expect(sql).toMatch(/prospects_select/);expect(sql).toMatch(/prospects_insert/);expect(sql).toMatch(/prospect:research capability required/);expect(sql).not.toMatch(/for all using \(is_active_internal_user\(\)\)/);});
});
