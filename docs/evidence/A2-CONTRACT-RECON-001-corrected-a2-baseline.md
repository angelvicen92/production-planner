# A2-CONTRACT-RECON-001 — corrected A2 baseline

Date: 2026-09-13. Base: `dbab74cb499063520045a8fe925a49dca43279af`.

## OLD_CONTRACT (obsolete)

The historical Full A2 artifacts used 269 obligations, a global participant gap of 0, and three standalone technical tasks inferred from the orange Reality/EVA header (`Reality con EVA`, transfer/strike, and technical Totales Post). They are retained only as historical evidence and are not authority for this baseline.

## CURRENT_CONTRACT

* Canonical obligations: **266**, all participant-linked; additional technical obligations inferred from the Reality/EVA header: **0**.
* Participant transition: REQUIRED, default **5 minutes**. Task-level before/after overrides preserve explicit zero, use the sole override when one exists, and use `max` (never sum) when both exist.
* Reality identities remain A = CAM3+SON1, B = CAM4+SON2, C = CAM3+CAM4+SON1. Unit identity is not a resource.
* The five configured Unit C operations explicitly require EVA. EVA is available 16:00–21:00 and has REQUIRED concentration.
* Unit C carries an explicit REQUIRED one-block/zero-gap continuity contract. Alfombra phase order is represented by explicit dependencies. The generic continuous-space contract exists, but applying it to Alfombra together with synchronized joint operations is rejected by current Planner Next preflight (`JOINT_GROUP_IN_STRUCTURED_SPACE_UNSUPPORTED`); the measured baseline therefore did not project that one authority.

## Full A2 baseline — 5,000 branches

The Full A2 search was run with the existing `EXACT_CONSTRUCTIVE` search/order/scoring and a 5,000 branch budget. No search, ordering, scoring, phase-gating, MRV, or budget behavior was changed.

* Canonical template: VALID; EngineInput preflight: SUPPORTED; adapter: SUPPORTED.
* Deterministic problem fingerprint: `f2c95e2de0bf39e460100b430df8e5b0dd64f87bb5cb8db068c55f60cc17e61c`.
* Status: `BRANCH_BUDGET_EXHAUSTED`; published obligations: 0/266.
* CORE/STANDALONE branches: 4,791 / 209. Maximum core depth: 8; complete core leaves: 0; standalone search invocations: 0.
* First blocker evidence: forward-domain blockers `task:10006` (1) and `task:10207` (10). First causal transition capacity count: 17. The critical depth-8 rejection mix was coach transition (48) and coach overlap (33).
* First post-core decision and macro inventory: not reached; macro selections: 0. Reality A/B/C, EVA placements, Alfombra placements, participant-transition placement prunes, terminal meals, and terminal transport were consequently not reached.
* Meal timeline frontier: 1,008 candidates, 503 explored, 18 analytically eliminated, 487 pending at exhaustion.
* Determinism diagnostic: identical status and invariant counters with diagnostics enabled/disabled in the recorded runner evidence.
* Causal comparison only: unlike the obsolete topology, the corrected run exhausts in CORE at depth 8. The former frontier 129 is not numerically comparable to this changed universe/topology.

## Residual validation risk

The baseline correctly measures the corrected count, participant margins, explicit EVA availability/assignment, and Unit C contract. It does **not** close the full acceptance gate because lossless Alfombra REQUIRED continuity cannot currently coexist with the joint-operation projection. Per task scope, no search fix was attempted; this representability incompatibility must be resolved before treating this as the final one-click prerequisite.

`CANONICAL_CONTRACT_RECONCILED = NO`
