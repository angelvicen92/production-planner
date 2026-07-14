import test from "node:test"; import assert from "node:assert/strict";
import { resolveInitialConstructionAnchorBranchLimit } from "./initialConstructionAnchorBranchLimit";

test("initial construction anchor branch limit defaults to 6 and clamps to historical range",()=>{
  assert.equal(resolveInitialConstructionAnchorBranchLimit(null),6);
  assert.equal(resolveInitialConstructionAnchorBranchLimit({maxCandidates:1} as any),2);
  assert.equal(resolveInitialConstructionAnchorBranchLimit({maxCandidates:6} as any),6);
  assert.equal(resolveInitialConstructionAnchorBranchLimit({maxCandidates:99} as any),8);
});
