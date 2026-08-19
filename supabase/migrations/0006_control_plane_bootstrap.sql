-- Narrow administrative bootstrap access for Pegasus Control Plane.
-- Migration 0005 correctly denies tenant/browser identities, but the first
-- internal identity cannot be created through an internal-user-authorised RPC
-- because no internal user exists yet. The service role may insert and verify
-- identities; it receives no direct update/delete grant, so subsequent role
-- and status changes must use the audited transactional functions.

grant select, insert on internal_users to service_role;
grant select on internal_audit_events to service_role;

comment on table internal_users is
  'Control Plane identities. Bootstrap insert is service-role only; subsequent changes use audited RPC functions.';
