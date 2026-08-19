# Pegasus Email Design System

Pegasus email uses one recognisable family with two presentations: compact transactional messages and personal correspondence inspired by the founder signature. Essential content is live, escaped HTML with a plain-text alternative; the signature is not a bitmap.

Transactional messages use a restrained Pegasus header, one clear purpose and action, security context, and a company footer. Personal messages add the navy/coral sender card. Outreach additionally requires a postal address, contact-source context where appropriate, and an HTTP(S) unsubscribe link.

Rendering is provider-neutral in `src/lib/email`. Delivery is deliberately disabled by default in `src/server/communications/system-email.ts`. A future adapter must preserve idempotency, approval identity, suppression/consent checks, audit events and provider IDs outside core entities. No open/click tracking is included.

Initial templates cover account invitation, password reset, security alerts, organisation provisioning, onboarding reminders, support access, personal correspondence and approved outreach.
