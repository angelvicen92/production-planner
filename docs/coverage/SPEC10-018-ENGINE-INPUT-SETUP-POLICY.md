# SPEC10-018 — EngineInput setup policy

EngineInput now carries `TaskInput.setupFamilyId` and `EngineInput.setupPolicies` as the explicit setup contract. Families are semantic IDs scoped by space and are canonicalized through the `setup-family` namespace before reaching Planner Next.

`orderConstraint: "EXPLICIT"` projects a fixed `familyOrder` losslessly. `orderConstraint: "UNSPECIFIED"` remains unsupported and is rejected with `UNSUPPORTED_FLEXIBLE_SETUP_ORDER`; it is not converted into an invented order.

Preparation is modeled as space occupation between setup families. For a two-family explicit order with 10 minutes between families, only the later family receives a 10 minute setup-preparation entry.

The SPEC10-018 probe exercises EngineInput preflight, adapter projection, Planner Next preflight, setup planning and hard validation for both explicit orders, including determinism, array-set invariance and input immutability.

A2 remains blocked because its Sillón/Estrellas setup order is `UNSPECIFIED`; Planner Next does not yet evaluate both valid orders. The next blocker is `ADAPTER_COACH_ROUTE_TRANSITION_SCOPE_LOSS`.
