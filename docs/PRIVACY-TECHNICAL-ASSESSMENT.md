# Privacy technical assessment

**Assessment date:** 2026-08-14  
**Scope:** Application code, database schema, browser storage, notifications, visitor insights, and deployment controls.  
**Method:** GDPR-oriented technical review using Regulation (EU) 2016/679, current EDPB consent guidance, and European Commission controller guidance.

This is an engineering assessment, not legal advice, a DPIA, or a guarantee of GDPR/UK GDPR compliance. The deployer is the controller and must determine territorial scope, lawful bases, notices, processors, international-transfer safeguards, retention periods, and local-law requirements for their use.

## Executive result

Anonchat has a strong privacy-oriented baseline: chat content and rich notes are end-to-end encrypted; visitor diagnostics are disabled by default, bounded, time-limited, and require an affirmative opt-in; notification payloads omit message content; visitors can revoke diagnostics and permanently erase their complete anonymous identity.

No critical code-level privacy defect remains from this review. Two high-priority deployment obligations cannot be completed generically in source code: the operator must publish a complete privacy notice and document a lawful basis for every processing purpose. The configurable privacy-policy URL makes that notice reachable before identity creation and from an active chat.

## Data-flow inventory

| Data | Purpose | Default / trigger | Storage or recipient | Deletion path |
| --- | --- | --- | --- | --- |
| Anonymous public ID and public keys | Authentication and E2EE key agreement | Identity creation | PostgreSQL | Visitor self-erasure or admin permanent delete |
| Message, reaction, attachment, and note ciphertext | 1:1 messaging | Person sends/saves content | PostgreSQL plus local/S3 object storage | Message deletion where applicable; complete identity erasure |
| Message metadata | Delivery, ordering, unread/read state | Messaging | PostgreSQL | Complete identity erasure |
| Anonymous session token hash; optional IP | Persistent authentication; abuse context when IP storage is enabled | Login/recovery | PostgreSQL; raw token only in HttpOnly cookie | Logout revokes; identity erasure deletes |
| Optional reply email | Notify on an admin reply | Separate visitor opt-in | PostgreSQL and configured SMTP/Resend provider | Clear through API; identity erasure deletes |
| Web Push endpoint and keys | Background message notification | Browser permission plus explicit enable | PostgreSQL and browser push service | Unsubscribe; identity erasure removes visitor ownership |
| Visitor diagnostics | Troubleshooting/context | Admin enables feature, then visitor opts in | PostgreSQL | Visitor revocation, feature disable, timed expiry, identity erasure |
| Optional IP-derived location/network | Coarse context | Diagnostics consent plus both operator flags | PostgreSQL; IP sent to ipwho.is | Same as diagnostics |
| Admin sessions, IP, user agent | Admin authentication and device management | Admin login | PostgreSQL | Logout/revoke; expiry is enforced |
| Admin audit log | Security/accountability | Admin mutations | PostgreSQL | Operator database retention process (not yet built in) |
| Device-local recovery secret | Restore anonymous identity | Identity creation/import | Browser IndexedDB | Visitor identity erasure; manual browser-data clearing |
| Device-local draft | Avoid losing unfinished text | Person types in composer | `localStorage`, encrypted and conversation-scoped | Successful matching send or identity erasure |

## Implemented safeguards

- Data content is E2EE with XChaCha20-Poly1305; the server stores ciphertext and metadata, not message/note plaintext. See `docs/SECURITY.md` and `packages/crypto/src/`.
- Visitor insights are off by default and require affirmative per-visitor consent. The UI names collected categories, excluded categories, retention, and withdrawal.
- Diagnostics exclude exact GPS, contacts, history, canvas/font fingerprinting, cookies, and decrypted content. Payload validation is bounded.
- Diagnostics expire after 1–365 configured days, are pruned hourly, can be revoked immediately, and are deleted globally when the feature is disabled.
- `STORE_IP_ADDRESSES` and `VISITOR_GEOLOCATION_PROVIDER` are separate operator-level gates; both default to non-collection/no lookup.
- Push permission follows a user action. Push and email notifications carry generic event text, not encrypted-message plaintext.
- Admin email is digested and visitor reply email is rate-limited to reduce unwanted notification volume.
- Permanent deletion removes the anonymous identity, email, sessions, push ownership, diagnostics, conversation, messages, reactions, note, and stored ciphertext media. A shared admin/visitor push endpoint retains only its admin ownership.
- Visitors can invoke permanent erasure themselves, including when blocked, after a typed destructive-action confirmation.
- Admin sessions enforce their recorded expiry; same-device sign-ins revoke older live sessions.
- A configurable privacy-policy URL is exposed on the public landing page and within chat.

## Findings and required actions

### P-01 — Operator privacy notice must be completed and published

- **Severity:** High
- **Confidence:** High
- **Status:** Product mechanism implemented; operator content required
- **Evidence:** Settings and the public UI expose a policy link, but Anonchat cannot know the deployer's controller identity, jurisdiction, purposes, legal bases, recipients, transfers, retention choices, or rights contact.
- **Risk:** Inline feature explanations are not a complete Articles 12–14 notice.
- **Required action:** Publish a clear notice before production and configure its URL in Settings. Include controller/contact details, purpose and lawful basis per data category, recipients/processors, international transfers, retention, rights/request channel, complaint right, whether provision is required, and automated decision-making if any.
- **References:** [GDPR Articles 12–14](https://eur-lex.europa.eu/eli/reg/2016/679/oj), [European Commission transparency obligations](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/obligations_en).

### P-02 — Lawful bases and necessity tests are deployment decisions

- **Severity:** High
- **Confidence:** High
- **Status:** Open operator obligation
- **Evidence:** Diagnostics and reply email use affirmative opt-ins; core messaging, abuse-prevention IP storage, admin security logs, and operational metadata do not share one universal lawful basis.
- **Risk:** Treating consent as the basis for processing that cannot genuinely be withdrawn, or enabling IP retention without a documented necessity/balancing test, can make processing unlawful.
- **Required action:** Record the Article 6 basis for each purpose. If relying on legitimate interests for security/abuse prevention, document necessity and balancing. Keep diagnostics consent separate, specific, informed, and as easy to withdraw as to give. Assess whether the deployment requires a DPIA.
- **References:** [EDPB lawful-processing guidance](https://www.edpb.europa.eu/sme/be-compliant/process-personal-data-lawfully_en), [EDPB Guidelines 05/2020 on consent](https://www.edpb.europa.eu/documents/guideline/guidelines-052020-on-consent-under-regulation-2016679_en), GDPR Articles 5, 6, 7, 25 and 35.

### P-03 — Core-data retention is purpose-driven but not automated

- **Severity:** Medium
- **Confidence:** High
- **Status:** Open
- **Evidence:** Visitor insights have enforced expiry. Anonymous identities, encrypted conversations, attachment ciphertext, anonymous session history, and audit logs otherwise persist until an explicit action or operator database process.
- **Risk:** Indefinite storage can exceed the period necessary for the purpose even when content is encrypted; metadata and linkable identifiers remain personal data.
- **Required action:** Define retention periods for active/inactive identities, revoked sessions, deleted-message tombstones, audit logs, backups, and object storage. Add a deployment-specific scheduled job only after periods and legal-hold rules are chosen. Verify backup expiry and object-store lifecycle policies.
- **References:** GDPR Article 5(1)(c) and 5(1)(e), Article 25.

### P-04 — One-click access/portability package is not implemented

- **Severity:** Medium
- **Confidence:** High
- **Status:** Open
- **Evidence:** An authenticated visitor can retrieve and decrypt their messages, attachments, and note through scoped APIs and can erase the identity, but there is no single downloadable package combining content and server-held metadata.
- **Risk:** Operators must assemble access or portability responses manually, increasing delay and omission risk.
- **Required action:** Add a client-side export that decrypts the transcript and note locally, downloads attachments, and combines server-held metadata in a structured format. Until then, document a manual request procedure and identity verification based on recovery-key possession.
- **References:** [European Commission guidance on data-subject requests](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/dealing-requests-individuals_en), GDPR Articles 12, 15 and 20.

### P-05 — Processor, transfer, and subprocessor governance is external

- **Severity:** Medium
- **Confidence:** High
- **Status:** Open operator obligation
- **Evidence:** Optional integrations can disclose data to hosting/PostgreSQL providers, S3-compatible storage, SMTP or Resend, browser push services, and ipwho.is. Code cannot determine the chosen vendor, region, contract, or onward transfers.
- **Risk:** Undocumented recipients, missing Article 28 terms, or unsupported international transfers.
- **Required action:** Maintain a processor/subprocessor register, sign appropriate processing terms, configure regions, assess transfer mechanisms, limit credentials/permissions, and list actual recipients in the notice. Enabling `VISITOR_GEOLOCATION_PROVIDER=ipwhois` sends the visitor IP to that external provider after consent.
- **References:** GDPR Articles 13(1)(e)–(f), 28, 32 and Chapter V.

### P-06 — Consent-version changes do not trigger re-consent

- **Severity:** Low
- **Confidence:** High
- **Status:** Open
- **Evidence:** `VisitorInsight.consentVersion` is recorded, but the active version is currently a code constant and the UI does not compare it to require renewed consent after a material purpose/category change.
- **Risk:** Existing consent may be treated as covering materially changed processing.
- **Required action:** Increment a central consent version whenever purposes or collected categories materially change and require a fresh action when stored and active versions differ.
- **References:** EDPB Guidelines 05/2020; GDPR Articles 4(11) and 7.

## Evidence gaps outside this repository

- Deployed notice, controller identity, rights contact, and jurisdiction-specific disclosures.
- Records of processing, legitimate-interest assessments, DPIA decision/result, and consent evidence beyond the stored technical timestamp/version.
- Processor contracts, subprocessor lists, data locations, transfer safeguards, and provider account settings.
- TLS termination, host hardening, database/object-store encryption and access logs, secret rotation, backup retention/restore tests, incident response, and breach procedures.
- Whether children are likely users and, if so, the applicable age/parental-consent design.
- Production retention jobs and legal-hold rules for core records, audit logs, infrastructure logs, and backups.

## Pre-production operator checklist

1. Publish and configure the privacy-policy URL.
2. Complete a purpose/data/basis/retention/recipient record for every inventory row.
3. Leave IP storage, geolocation, email, push, and external storage disabled unless needed and documented.
4. Review every configured vendor under Articles 28 and 44–49 and disclose it.
5. Establish electronic access, correction, restriction, portability, objection, and erasure request handling; test the one-month workflow.
6. Define and automate retention for core data, revoked sessions, audit logs, infrastructure logs, objects, and backups.
7. Test diagnostics withdrawal and identity erasure in deployment, including object storage and downstream providers.
8. Document breach response, security contacts, restore tests, and key/secret rotation.
