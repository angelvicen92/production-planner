from pathlib import Path

spec = Path('engine/planner-next/transportGrouping.spec.ts')
text = spec.read_text()
text = text.replace(
  'assert.equal(first.kind, "EXACT_CONSTRUCTIVE"); assert.equal(first.result?.complete, true);',
  'assert.equal(first.kind, "EXACT_CONSTRUCTIVE"); assert.equal(first.result?.complete, true, JSON.stringify(first.result && { status: first.result.status, reasons: first.result.evidence.reasonCodes, coreReasons: first.result.evidence.coreReasonCodes, remaining: first.result.remainingTaskIds, branches: first.result.evidence.branchesExplored, coreBranches: first.result.evidence.coreBranchesExplored, standaloneBranches: first.result.evidence.standaloneBranchesExplored }));',
  1,
)
text = text.replace(
  'assert.equal(result.kind, "EXACT_CONSTRUCTIVE"); assert.equal(result.result?.complete, true);',
  'assert.equal(result.kind, "EXACT_CONSTRUCTIVE"); assert.equal(result.result?.complete, true, JSON.stringify(result.result && { status: result.result.status, reasons: result.result.evidence.reasonCodes, coreReasons: result.result.evidence.coreReasonCodes, remaining: result.result.remainingTaskIds, branches: result.result.evidence.branchesExplored, coreBranches: result.result.evidence.coreBranchesExplored, standaloneBranches: result.result.evidence.standaloneBranchesExplored }));',
  1,
)
spec.write_text(text)
