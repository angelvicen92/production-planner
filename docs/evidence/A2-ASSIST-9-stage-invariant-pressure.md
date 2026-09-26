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

This confirms that the CURRENT/FUTURE discontinuity in pressure was causal for the previously observed reconstructed-supporting hard-gate rejection. P15 still does not enter standalone: `coreBranches=19`, `standaloneBranches=0`.

## First next blocker

The first blocker is the participant future-reservation gate immediately after the fixed Main bundle hard gate:

- `firstFixedMainBundleRejection = FUTURE_FEASIBILITY_REJECTED`;
- one participant-future check over 19 affected participants, 102 future tasks and 19 meals;
- 185 individual-domain checks and 83 task/meal compatibility checks;
- no zero-domain, task/meal, collective, or explicit prune;
- the check returns one abstention, zero passes and zero prunes;
- technical-chain and operational-meal future gates are not reached;
- standalone remains at zero branches.

Therefore the remaining failure is not supporting geometry or fixed Main hard validation. It is an inconclusive participant-future reservation result being treated as rejection before standalone. Resolving that is a separate causal delta; this change does not soften that gate, alter hard domains, or increase budgets.

## Regression evidence

Focused tests cover classification invariance, identity deduplication, protected-work exclusion, input-order invariance, material availability/load pressure, and the existing grouped ARRIVAL/opening behavior. Temporary diagnostic instrumentation was not retained.
