# A2 Assisted — stage-invariant pending-work pressure

- Base: `125a9f8406c99163d722c71b8dd243fac23cfa56`
- Scenario: canonical A2 Assisted, unchanged budgets and hard authorities.
- Counterfactual: anonymous entry pressure reads the union of pending tasks in the explicit current scope, analytical future participant work, and analytical future technical work. Task identity deduplicates the union; protected placements and the participant's own pipeline are excluded.

## Result

The counterfactual preserves the first four accepted stages and their 65/266 obligations:

| Stage | Operational unit | Result | Completed |
|---|---|---:|---:|
| S1 | Main pipeline | PROPOSAL | 19 |
| S2 | Main feeders | PROPOSAL | 38 |
| S3 | Reality C + EVA continuity | PROPOSAL | 46 |
| S4 | Totales rounds | PROPOSAL | 65 |
| S5 / P15 | P15 operations | NO_PROPOSAL | 65 |

At P15 the reconstructed fixed Main bundle is now hard-valid:

- 19 protected Main placements and 19 prepared matching edges;
- one perfect matching found;
- zero participant-edge prunes;
- one fixed-bundle hard-gate pass and zero hard-gate rejects;
- 109 reconstructed core tasks (71 auxiliary, 19 vocal, 19 Main).

This confirms that the CURRENT/FUTURE discontinuity in pressure was causal for the previously observed reconstructed-supporting hard-gate rejection.

## First next blocker

The initial participant-future result is `ABSTAIN / INCONCLUSIVE_SHAPE`. Its unresolved dependencies are exactly the 36 P15 obligations in `remainingStandalone`; `outside` is empty. The callback therefore defers it correctly and enters standalone search. It is not the rejection cause.

The first real dead-end was instead an incomplete round reachability check: it required every task in the retained Totales policy to remain pending, although all those round tasks were already present as protected core context. This returned before macro selection and consumed zero standalone branches. The correction treats round identities already present in immutable core as represented hard context and creates a round macro only when the policy still has pending members.

After that correction P15 performs real search (`coreBranches=19`, `standaloneBranches=99,981`). Its first macro is resource task `task:10001`, with exact domain size 16; prerequisite reservation passes, participant-future ABSTAIN is deferred, participant-meal and operational-meal future checks pass, recursion enters another macro and eventually ordinary/terminal search. The first descendant dead-end is `SETUP_SEARCH_DEAD_END` for Croma unit `setup:space:3009`: 82 hard-valid top-level candidates were evaluated at depth 19. Across the run the setup authority executed 18 times, explored 2,523 starts and produced 1,445 complete candidates before the unchanged 100,000-branch budget was exhausted. P15 remains `NO_PROPOSAL` at 65/266.

The single next causal classification is therefore **SETUP_SEARCH_DEAD_END**, under `probeExactSetupMacroDomain` for the complete 17-task Croma setup unit. This change does not optimize that new blocker, soften hard authorities, or increase budgets.

## Regression evidence

Focused tests cover classification invariance, identity deduplication, protected-work exclusion, input-order invariance, material availability/load pressure, and the existing grouped ARRIVAL/opening behavior. Temporary diagnostic instrumentation was not retained.
