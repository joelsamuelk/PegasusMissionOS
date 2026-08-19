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

## First acceptance journey

Build the Green Futures journey incrementally across CONTROL-2–7. Use one prospect ID through research, qualification, pipeline, person, outreach approval, interaction, win and conversion. Assert that conversion creates one mapping on retry; provisioning creates one tenant or rolls back; onboarding/activation link to the customer account; and Command Centre changes lifecycle treatment without losing the prospect history.

## Verification matrix

Critical suites must cover internal RBAC, tenant isolation, support expiry/scope/exact organisation, conversion idempotency, provisioning rollback, required audit creation, deterministic prospect/health scoring, mandatory override reasons, analytics privacy, safe feature evaluation and cross-customer isolation. Run `typecheck`, unit/contract tests, e2e and production build for every completed vertical slice.

## Explicit deferrals

Full billing, forecasting, mass automation, SMS/WhatsApp, call recording, enrichment suites, customer support portal, experimentation, warehouse/report builder, full project management and autonomous outreach remain outside these slices. Add provider boundaries only when a current slice needs them.
