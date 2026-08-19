# Pegasus commercial domain model

## Boundary

Commercial state extends the Control Centre's canonical `ProspectOrganisation`, `ProspectPerson`, interaction and customer identities. It does not create parallel Company, Contact, or Organisation records. A prospect is an organisation in a research lifecycle; an opportunity is created only after genuine commercial potential is established through engagement.

## Lifecycle and entities

`ICPProfile → ProspectOrganisation → ResearchClaim / CommercialSignal → ProspectPerson + BuyingRole → OutreachMessage / OutreachSequence → Meeting → SalesOpportunity → Proposal → CommercialOutcome → CustomerAccount`

- `ICPProfile` owns motion-specific targeting rules and versioned, human-approved weights.
- `ResearchClaim` is either a fact or hypothesis. Externally derived facts require source URL, observation time, confidence, origin and verification state.
- `CommercialSignal` is sourced evidence with confidence, relevance and decay. It never silently becomes a fact.
- Fit, intent and confidence are separate explainable projections. Missing data lowers confidence; it is not filled by AI.
- `BuyingRole` decorates the canonical person relationship and may be unknown.
- `OutreachMessage` is always draft-first. Cold outbound requires compliance review and human approval; provider delivery fails closed.
- `Meeting` keeps facts separate from hypotheses. AI-extracted outcomes remain proposed until reviewed.
- `SalesOpportunity` is separate from the account and begins only after engagement. Proposals are versioned children of an opportunity.
- `CommercialOutcome` records structured win, loss, nurture and rejection reasons for learning. Scoring changes are recommendations until approved.

## Provider ports

Discovery, organisation research, people discovery, signals, email, calendar and messaging are ports. Vendor identifiers live in integration records keyed to canonical entities. Deterministic manual/mock adapters are the initial implementation.

Discovery runs only through an explicit `DiscoveryJob`. Providers declare capabilities before use, and each request records provider, request, account, timestamp, cache state and cost where available. A provider failure produces a visible `research_failed` state and never an invented fallback result. Research is append-only: refreshes preserve prior claims and signals.

## Signal decay policy

Decay is deterministic and based on signal type: job postings 45 days; product launches 90; leadership departures 120; funding rounds, AI initiatives and market expansion 150; appointments, grants and programme expansion 180; strategy 270; annual and impact reports 365. Unknown types default to 90 days. AI cannot select or alter decay windows.

## Trust and privacy

All mutations carry actor, time and origin. AI output stores model/prompt provenance where relevant and cannot mark itself verified. Contact provenance, lawful basis, suppression, unsubscribe, retention and deletion are enforced before delivery. Commercial motions share infrastructure but never ICP rules or funnel reporting.
