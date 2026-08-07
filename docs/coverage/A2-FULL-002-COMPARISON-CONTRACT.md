# A2-FULL-002 — Comparison contract, tolerance gate and Pareto classification

## Purpose

This checkpoint codifies the Objective Master comparison semantics without inventing A2-specific tolerance values and without adding an aggregate score.

It is a benchmark/evidence contract only. It does not change Planner Next search, scoring, budgets, DB, UI or product publication.

## Non-compensable order

1. OptiPlan hard-gate failure classifies the candidate as `INVALID` immediately.
2. Quality comparison is only allowed when the human reference hard-gate assessment is resolved and passing.
3. A named/versioned policy must declare the exact comparison-signal surface for every primary KPI `P01` through `P10`.
4. The supplied human/OptiPlan signals must match that surface exactly: no missing, extra or cross-KPI signals.
5. Every required signal must have an explicit non-negative tolerance in the same versioned policy.
6. Only then are signal deltas classified.

This preserves the official rule that viability precedes quality and prevents a partial benchmark from declaring victory.

## Versioned comparison surface and tolerances

The Objective Master requires every KPI to have stable identity, formula/direction and tolerance, with tolerances explicit, versioned, identical for human and OptiPlan, and immutable for the purpose of favoring an iteration. It does not currently publish numeric A2 tolerance values.

Therefore `planningComparison.ts` contains **no numeric A2 tolerance defaults and no caller-selected KPI subset**. `ComparisonTolerancePolicy` must declare:

- a policy version;
- a non-empty exact list of required signal IDs for each P01–P10;
- a tolerance for every required signal.

The comparator blocks if a required signal is absent, if an unversioned extra signal is supplied, or if a signal is assigned to a different KPI than the policy declares. This is important for structured KPIs such as P03: a future policy cannot silently compare only the mean while omitting P90, maximum or individual effects unless that reduced surface is explicitly versioned and reviewed as a benchmark-policy change.

A delta exactly on the tolerance boundary is `EQUIVALENT`. Only a delta strictly beyond the band is materially `BETTER` or `WORSE`.

## Direction

Every signal declares its direction explicitly:

- `LOWER_IS_BETTER` for measures such as gaps, makespan, presence, avoidable waiting, fragmentation and avoidable moves;
- `HIGHER_IS_BETTER` for measures whose quality increases with value, such as robustness/slack signals.

No direction is inferred from the signal name.

## Classification

After all gates above pass:

- `PARITY`: no primary signal is outside its equivalence band;
- `PARETO_BETTER`: at least one primary signal is materially better and none is materially worse;
- `WORSE`: at least one primary signal is materially worse and none is materially better;
- `TRADEOFF`: at least one primary signal is materially better and at least one is materially worse;
- `INVALID`: OptiPlan fails a non-compensable hard gate.

Only `PARETO_BETTER` sets `mayClaimBetterThanHuman=true`.

A large improvement in one KPI never compensates a regression in another. There is no weighted sum or aggregate score in the classifier.

## Fail-closed states

The result is `BLOCKED_BY_CONFIGURATION` with `classification=null` when comparison inputs are incomplete or ambiguous, including:

- human-reference hard gates unresolved;
- OptiPlan hard gates unassessed;
- any P01–P10 comparison surface missing or empty;
- missing required signal;
- supplied signal outside the versioned surface;
- signal assigned to the wrong KPI;
- missing tolerance policy or version;
- missing, negative or non-finite signal tolerance;
- duplicate/cross-KPI signal identity;
- non-finite human or OptiPlan values.

This outer blocked state is deliberately not a sixth quality classification. The five official comparison classes remain unchanged.

## Current Full A2 consequence

A2-FULL-001 currently exposes measurable human baselines for P01, P02, P03, P07 and P09. P04, P05, P06, P08 and P10 remain blocked by missing effective configuration/semantics, and no official numeric tolerance/signal-surface policy has yet been supplied.

Accordingly the real Full A2 comparison must remain blocked. The contract exists now so that future work cannot claim `PARITY` or `PARETO_BETTER` by silently comparing only the KPI fields that happen to be available.

## Acceptance evidence

Focal tests cover:

- hard-invalid precedence;
- unresolved-reference blocking;
- mandatory non-empty P01–P10 signal surface;
- missing required signal;
- extra/unversioned signal rejection;
- cross-KPI signal mismatch rejection;
- mandatory versioned tolerances;
- tolerance boundary equivalence;
- lower-is-better and higher-is-better directions;
- `PARITY`;
- `PARETO_BETTER`;
- `WORSE`;
- `TRADEOFF`;
- no cross-KPI compensation;
- duplicate-signal fail-closed behavior;
- deterministic ordered, frozen Evidence.
