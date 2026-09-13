# A2-CONTRACT-RECON-001 — corrected A2 baseline

Date: 2026-09-13. PR base: `9d733eaef737fe39e8992307ce695097f0fe4779`. Evidence candidate head: `ace8f234ca41ead50a27bcaefa11ef241ee8ad2b`.

## CANONICAL CONTRACT

* Canonical obligations: **266**, all participant-linked; technical obligations inferred from the Reality/EVA header: **0**.
* Participant transition is REQUIRED with a **5 minute** default. Explicit before/after zeroes are preserved, a sole override governs its boundary, and two overrides use `max` rather than addition.
* Reality identities are A = CAM3+SON1, B = CAM4+SON2 and C = CAM3+CAM4+SON1. Unit identity is not projected as a resource. The five configured Unit C operations explicitly require EVA; EVA is available from 16:00 and has REQUIRED concentration. Unit C retains REQUIRED one-block/zero-gap continuity.
* Alfombra is projected as a REQUIRED continuous space with the sequence C04 EVA → C13 EVA → joint C06+C10 → C16. The synchronized joint is one canonical physical occupation; its two participant tasks do not create a false gap or reentry.
* Setup is projected losslessly for Sillón/Estrellas: two families, one block per family, 10 preparation minutes, reentry FORBIDDEN and order UNSPECIFIED. Both hard-valid family orders remain reachable.

## Representability gate

The regenerated SPEC10-016 artifact reports `representabilityStatus=FULLY_REPRESENTABLE`, `jointGroupCapabilityProven=true`, `setupPolicyCapabilityProven=true`, `flexibleSetupOrderCapabilityProven=true`, and `roundSynchronizationCapabilityProven=true`. EngineInput preflight, adapter and Planner Next preflight are SUPPORTED, and the guarded executor is called exactly once. SPEC10-017 demonstrates synchronized joint A → individual external dependencies → synchronized joint B end-to-end; SPEC10-018 and SPEC10-020 demonstrate lossless setup and both flexible family orders.

## Full A2 baseline — 5,000 branches

The canonical execution used the unchanged `EXACT_CONSTRUCTIVE` search/order/scoring and one 5,000-branch baseline budget. Command-harness wall-clock was approximately **10 seconds**.

Diagnostic-on/off equivalence was **not evaluated** in this baseline because the reconciliation permits only one Full A2 execution. Accordingly, `searchInvariance` is `null`; determinism and order-invariance claims are retained only where independent focused probes establish them.

* Canonical template: VALID; EngineInput preflight: SUPPORTED; adapter: SUPPORTED; Planner Next execution route: EXACT_CONSTRUCTIVE.
* Deterministic problem fingerprint: `ce3c113b10e0e7e700a92a2b4a40a71ba5c1cbc1dc209e08c39df2f7fa526e29`.
* Status: `BRANCH_BUDGET_EXHAUSTED`; published obligations: 0/266.
* CORE/STANDALONE branches: **4,791 / 209**. Maximum core depth: **8**; complete core leaves: **0**; standalone search invocations: **0**.
* First forward-domain blockers: `task:10006` (1) and `task:10207` (10). At critical depth 8, the first causal rejection mix is coach transition (48) and coach overlap (33); the dominant placed blocker is `task:10203` (66/81 critical rejections).
* First post-core decision was not reached. Reality C/EVA, Alfombra, setup, participant-transition terminal placements, meals and transport were therefore not reached by the search; no claim about their optimization is made.
* Meal timeline frontier: 1,008 candidates, 503 explored, 18 analytically eliminated and 487 pending when CORE exhausted. The exact exhaustion phase is `CORE`, with `FEEDER_SLOT_MATCHING_BUDGET_EXHAUSTED` / `CORE_BRANCH_BUDGET_EXHAUSTED`.

This PR records that causal baseline without attempting to improve it and without changing search, ordering, scoring, MRV, phase gating or branch budgets.

`CANONICAL_CONTRACT_RECONCILED = YES`
