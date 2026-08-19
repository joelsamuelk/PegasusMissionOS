# Pegasus Control Plane Architecture

**Status:** CONTROL-0 through CONTROL-11 implemented; production migrations applied through CONTROL-10.  
**Deployment:** `control.pegasus-studio.co` (configuration: `NEXT_PUBLIC_CONTROL_URL`).  
**Related surfaces:** Mission OS at `app.pegasus-studio.co`, marketing at `mission.pegasus-studio.co`, studio at `www.pegasus-studio.co`.

## 1. Audit findings

The repository is a Next.js 15 application with a tenant-scoped asynchronous repository boundary, `RequestContext`, Supabase session membership resolution, RLS migrations, deterministic scoring, a provider-neutral AI layer, a Claims/Knowledge trust layer, Organisation Intelligence with source provenance and injection sanitisation, and tenant audit events. The live repository adapter is still in-memory; the existing audit accurately describes the application as a high-fidelity demonstration rather than production-ready.

These primitives should be reused by composition, not by collapsing security boundaries:

- Organisation Intelligence's source, authority, locator, conflict and verification semantics apply to prospect research.
- Knowledge/Claims semantics apply to public prospect facts and AI trace provenance.
- Deterministic pure functions remain the model for prospect fit, health and attention rules.
- Provider interfaces remain outside core business identities.
- Mission OS repositories and `RequestContext` remain tenant-owned and tenant-scoped.

The existing `MemberRole`, tenant membership and Mission OS capability map must **not** authorise Control Plane access. Internal users are not implicit tenant members. Existing `AuditEvent` is tenant-owned and insufficient for internal actions involving multiple or no tenants. Existing `ExternalOrganisation` and relationship entities belong to a customer tenant and must not become Pegasus prospect records.

## 2. Boundaries

```text
Browser on control host
  -> internal authentication resolver
  -> ControlRequestContext (internal actor, internal role, request id)
  -> capability gate
  -> Control service
  -> Control repository / append-only internal audit
       | metadata and aggregate adapters
       `-> explicit SupportAccessSession gate -> tenant repository

Browser on app host
  -> customer authentication resolver
  -> RequestContext (tenant, member, tenant role)
  -> Mission repository + tenant RLS
```

The surfaces may share a codebase, identity provider, tokens and pure trust/intelligence libraries. They do not share sessions, role derivation, repository context or data-access policy. Production should use host-scoped cookies with separate names and audience checks. Requests for the wrong host fail closed. Internal tables are server-only and are not exposed to browser Supabase roles.

## 3. Internal authorisation

Initial roles are `super_admin`, `operations`, `sales`, `customer_success`, `support`, `product`, `finance`, and `read_only`. Roles map centrally to explicit `ControlCapability` values. UI visibility improves usability but is never enforcement; services require capabilities server-side.

`super_admin` receives all internal capabilities but does not receive tenant access. Customer-content access additionally requires an active, unexpired `SupportAccessSession` matching the target organisation and adequate approved scope. Ordinary support access cannot perform dangerous administrative actions.

Role assignments are internal records, not JWT/client input. Changes require a reason and an audit event. Separation-of-duty and approval requirements can later be applied to elevated access without changing service contracts.

## 4. Customer-access model

Metadata (plan, activation state, aggregate event counts, owners and health signals) is stored/read through Control Plane projections. Customer content remains behind Mission OS isolation.

A support session records requester, organisation, reason, case reference, requested and approved scope, start, expiry, end and status. Access requires all of:

1. internal capability;
2. active session for the exact organisation;
3. unexpired time window;
4. sufficient approved scope;
5. resource classification permitted for that scope.

Reads and attempted/performed mutations are audit inputs. A persistent banner identifies active organisation, scope and expiry. Ending or expiry removes access immediately. Future customer approval is represented as an approval policy/record, not embedded in the session shape.

## 5. Connected identity lifecycle

`ProspectOrganisation` is the enduring pre-customer identity. Research sources, facts, people, interactions, opportunity, notes, tasks and feedback reference it. Winning creates a single idempotent `CustomerConversion` that maps the prospect to `CustomerAccount`, then to the Mission OS `Organisation`, administrator invitation and onboarding plan. Records are linked, not copied into unrelated histories.

The conversion key is unique per prospect and the provisioning operation uses a transaction/idempotency key. Retrying returns the existing mapping. A failed transaction leaves no partially usable tenant. Provider IDs live only in integration-reference tables.

## 6. Data model groups

- **Identity and access:** `InternalUser`, role assignment, `SupportAccessSession`.
- **Growth:** prospect organisation/person, research source/fact/conflict, qualification/override, opportunity/stage, interaction, outreach template/sequence/enrolment/send request, suppression and consent metadata.
- **Conversion:** customer account, conversion, provisioning run and resource mapping.
- **Success:** onboarding plan/step, activation event/criteria, health snapshot/signal/override, support case.
- **Product:** privacy-safe usage event and organisation summary, feedback, feature flag/target, AI usage/trace, system status.
- **Operations:** internal task and append-only internal audit event.
- **Commercial:** provider-neutral account and subscription reference; detailed billing deferred.

All mutable entities carry timestamps and actor stamps. Public facts carry source URL, retrieval time, locator, authority, verification state and conflicts. Sensitive payloads have an explicit classification and retention rule.

## 7. Repository and service contracts

Control repositories are asynchronous and accept `ControlRequestContext`. Suggested ports: `InternalIdentityRepository`, `ProspectRepository`, `SalesRepository`, `OutreachRepository`, `CustomerAccountRepository`, `ProvisioningRepository`, `OnboardingRepository`, `SupportRepository`, `UsageRepository`, `FeedbackRepository`, `FeatureFlagRepository`, `AIOperationsRepository`, `TaskRepository`, and `InternalAuditRepository`.

Services own transactions, authorisation and audit orchestration. Adapters own persistence scoping. External boundaries are provider-neutral: `ProspectResearchProvider`, `CommunicationProvider`, observability adapters, billing adapter and flag adapter. Core entities use Pegasus IDs; integration references map provider and external ID separately.

## 8. Intelligence

Attention, qualification, health, activation and flag evaluation are deterministic, versioned functions returning reasons, evidence/signals, assumptions and missing information. Human overrides require a reason and preserve the computed result. AI may retrieve authorised structured tool results and synthesise explanations or drafts. It cannot establish facts, assign scores/health, approve research or send initial outbound communication.

Prospect research reuses Organisation Intelligence sanitisation and provenance semantics. Customer data is never a research input for another organisation. AI traces distinguish sources offered from sources actually cited/used. Full trace context follows the same support-access gate as customer content.

## 9. Privacy, communications and analytics

Collect public organisational facts only for a legitimate business purpose; minimise personal information, record contact source and lawful-basis/consent state where applicable, honour suppression/unsubscribe before every send, and retain evidence of approval. AI drafts always enter a human approval state.

Analytics accepts an allow-list of meaningful event names and schema-validated non-content properties. No application answers, report prose, evidence text, prompts, beneficiary data or arbitrary URLs belong in analytics. Views distinguish activity, customer outcomes and Pegasus-attributed outcomes and never infer causation from correlation.

## 10. Audit and failure behaviour

Internal audit records actor, action, target, related organisation, timestamp, reason, safe before/after metadata, support session and request/correlation ID. It is append-only. Reasons are mandatory for provisioning, suspension, role changes, support/customer-data access, feature overrides, billing changes, user disablement and health overrides.

Feature flags evaluate server-side for security-sensitive behaviour and fail to the safest disabled state on provider error. Outbound communication fails closed on missing permission/compliance. Customer access fails closed on any missing session property. No UI labels a mock adapter as live.

## 11. Current foundation

Implemented now: configuration-driven Control origin, separate route and visual shell, internal roles/capabilities, `ControlRequestContext`, support-session expiry helper, audit contract/reason enforcement, and deny-by-default database foundation. The Command Centre deliberately renders unavailable values instead of invented metrics. Internal authentication, repositories and consequential actions remain disabled until CONTROL-1 persistence is connected.

CONTROL-2 adds Pegasus-owned prospect organisations and people plus research sources and facts. It reuses Organisation Intelligence extraction semantics without placing prospect records in a customer tenant. Every extracted fact retains source URL, locator, authority, confidence, method and verification state; conflicts remain grouped and injection-shaped content is forced to review. Research never promotes a fact to verified.
