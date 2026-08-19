# Pegasus Control Plane Implementation Plan

Each slice follows: contracts → pure logic → persistence → service/capabilities → UI → unit/integration tests → e2e → full regression → verification record. Do not advance with a broken gate.

## Delivery gates

| Slice | Outcome | Exit evidence |
|---|---|---|
| CONTROL-0 | Architecture and security model | Architecture documents reviewed; boundaries/invariants mapped |
| CONTROL-1 | Internal auth, RBAC, shell, audit | Separate internal session; deny-by-default tables; capability mutation tests; audit append tests |
| CONTROL-2 | Prospects, people, research | Provenance/conflict tests; injection fixtures; no auto-verification |
| CONTROL-3 | Qualification, pipeline, tasks | Weighted scorer tests including missing data/override; stage rules; lost reason |
| CONTROL-4 | Outreach foundation | Provider contract; suppression/consent enforcement; approval-required send tests |
| CONTROL-5 | Conversion and provisioning | Idempotent double conversion; transactional rollback; complete audit trail |
| CONTROL-6 | Onboarding and activation | Configurable criteria; setup separated from value events; time-to-value |
| CONTROL-7 | Customer 360 and health | Metadata/content split; deterministic snapshots and reasoned overrides |
| CONTROL-8 | Support access | Expiry, exact-tenant and scope mutation tests; banner; access audit |
| CONTROL-9 | Usage and feedback | Payload allow-list/privacy rejection; aggregate isolation; feedback views |
| CONTROL-10 | AI ops, flags, system health | Redacted traces; safe flag fallback; adapter truthfulness |
| CONTROL-11 | Control intelligence | Authorised structured tools; provenance-bearing answers; no invented metrics |

## Immediate work

CONTROL-0 is complete. CONTROL-1 now includes a fail-closed internal identity resolver, session-bound Supabase repository, RLS-isolated internal identities, capability-enforced role/status services, append-only audit persistence, protected shell, Team and Audit views, narrow service-role bootstrap access, and mutation-style authorisation tests. Remaining before CONTROL-2: provision the first production internal identity through the administrative bootstrap, add invitation delivery/session-cookie audience hardening at the deployment edge, and add a browser journey against a test Supabase project. Only then replace the foundation preview with live attention adapters.

CONTROL-2 is implemented in code: enduring prospect organisations, linked people, provider-neutral website research, provenance-bearing facts, conflict retention, prompt-injection review state, capability enforcement, role-narrowed RLS, list/detail/create UI, and the Green Futures browser journey. Migration `0007_control_plane_prospects.sql` must be applied to the production Supabase project before live use. Human fact approval remains explicit and is not performed by research.

CONTROL-3 is implemented in code: the versioned deterministic prospect-fit scorer exposes eleven weighted factors with reasons, evidence, assumptions and missing information; human overrides preserve the computed category and require a reason. Sales opportunities support all defined stages, table/Kanban views and filtering, with a required reason for lost opportunities. Lightweight internal tasks are linked to typed entities and cannot execute external actions. Migration `0008_control_plane_qualification_pipeline_tasks.sql` must be applied before live use.

CONTROL-4 is implemented in code: provider-neutral templates, sequenced steps and enrolments; contact-source provenance, lawful-basis records, suppression and unsubscribe enforcement; idempotent send requests; and mandatory human approval for initial outbound contact. The database approval guard repeats the consequential compliance checks so direct table access cannot bypass the application service. No delivery provider is configured, so approved requests remain inert and fail closed. Migration `0009_control_plane_outreach.sql` must be applied before live use.

CONTROL-5 is implemented in code: only won opportunities can be converted; one transactional security-definer operation creates the Mission OS organisation, customer account, enduring prospect mapping, provisioning run, pending administrator invitation and internal audit record. Unique prospect and operation keys make retries return the original mapping, while PostgreSQL transaction rollback prevents partial tenants. Migration `0010_control_plane_conversion.sql` must be applied before live use.

CONTROL-6 is implemented in code: versioned onboarding plans and required setup steps are distinct from configurable activation criteria and idempotent customer value events. Deterministic snapshots require all configured value criteria and calculate first value plus time-to-value from customer-account creation. Migration `0011_control_plane_onboarding_activation.sql` must be applied before live use.

CONTROL-7 is implemented in code: Customer 360 reads only Control Plane operational metadata projections. Versioned deterministic health snapshots expose score, category, signal reasons and missing information; human overrides preserve the computed category and require both an actor and reason with an internal audit event. Tenant documents, answers, evidence and report content remain outside this repository. Migration `0012_control_plane_customer_health.sql` must be applied before live use.

CONTROL-8 is implemented in code: support sessions bind requester, exact Mission OS organisation, customer account, case, reason, approved scope and hard expiry. Resource checks deny wrong actor, wrong organisation, inactive/expired sessions and insufficient scope; allowed and denied attempts are persisted. Active access is visibly disclosed and can be ended immediately. Migration `0013_control_plane_support_access.sql` must be applied before live use.

CONTROL-9 is implemented in code: usage ingestion accepts only named events with exact, typed non-content properties, enforced in both TypeScript and PostgreSQL. Unknown keys, prose, prompts and arbitrary URLs are rejected. Idempotent events and aggregates retain the customer-account key; structured feedback is bounded and separately classified. Migration `0014_control_plane_usage_feedback.sql` must be applied before live use.

CONTROL-10 is implemented in code: feature flags fail disabled when missing, inactive or unavailable and customer targets require reasons. AI operation traces retain operational counts, state and source references without prompts, answers or evidence content. System adapters report `not_configured` or `unknown` unless backed by an observation. Migration `0015_control_plane_ai_flags_system.sql` must be applied before live use.

CONTROL-11 is implemented in code as a read-only orchestration layer over existing authoritative repositories. Fixed intents call capability-checked structured tools for pipeline, customer attention and system health. Every metric carries tool, entity type, record IDs and generation time; missing datasets render unavailable rather than estimated values. No additional persistence or duplicate fact store is introduced.

## First acceptance journey

Build the Green Futures journey incrementally across CONTROL-2–7. Use one prospect ID through research, qualification, pipeline, person, outreach approval, interaction, win and conversion. Assert that conversion creates one mapping on retry; provisioning creates one tenant or rolls back; onboarding/activation link to the customer account; and Command Centre changes lifecycle treatment without losing the prospect history.

## Verification matrix

Critical suites must cover internal RBAC, tenant isolation, support expiry/scope/exact organisation, conversion idempotency, provisioning rollback, required audit creation, deterministic prospect/health scoring, mandatory override reasons, analytics privacy, safe feature evaluation and cross-customer isolation. Run `typecheck`, unit/contract tests, e2e and production build for every completed vertical slice.

## Explicit deferrals

Full billing, forecasting, mass automation, SMS/WhatsApp, call recording, enrichment suites, customer support portal, experimentation, warehouse/report builder, full project management and autonomous outreach remain outside these slices. Add provider boundaries only when a current slice needs them.
