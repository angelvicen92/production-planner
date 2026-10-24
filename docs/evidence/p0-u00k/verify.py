"""Verify frozen receipts and, optionally, compare a fresh run in full.

python3 docs/evidence/p0-u00k/verify.py [/tmp/fresh-run] [--extract /tmp/receipts]
Only *Ms timings and temporary-path call stacks are excluded from replay equality.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
parser = argparse.ArgumentParser()
parser.add_argument("replay", nargs="?", type=Path)
parser.add_argument("--extract", type=Path)
args = parser.parse_args()
receipts = json.loads(gzip.decompress((HERE / "receipts.json.gz").read_bytes()))
assert receipts["summary.json"]["status"] == "PASS"
for row in receipts["source-authority.json"]["files"]:
    assert hashlib.sha256((ROOT / row["path"]).read_bytes()).hexdigest() == row["sha256"], row["path"]
authority = receipts["source-authority.json"]
assert hashlib.sha256((ROOT / authority["unchangedA2Baseline"]).read_bytes()).hexdigest() == authority["a2BaselineSha256"]
for row in receipts["historical-replay.json"]:
    assert hashlib.sha256((ROOT / row["originalStage"]).read_bytes()).hexdigest() == row["originalStageSha256"]
for mode in ("A", "anyOf", "byType"):
    value = json.loads(json.dumps(receipts[f"input-{mode}.json"]))
    value["tasks"][1]["resourceRequirements"] = receipts["input-B.json"]["tasks"][1]["resourceRequirements"]
    assert value == receipts["input-B.json"], mode
assert receipts["current-B/validation.json"]["hardValid"]
assert len(receipts["current-B/assisted.json"]["proposal"]) == 11
assert receipts["current-A/execution.json"]["result"]["status"] == "INFEASIBLE"
for mode in ("anyOf", "byType"):
    assert receipts[f"current-{mode}/adapter.json"]["status"] == "UNSUPPORTED"
assert receipts["guard-only/preflight.json"]["status"] == "SUPPORTED"
assert receipts["both-guards/adapter.json"]["status"] == "UNSUPPORTED"
observed = receipts["both-guards/observed-adapted-problem.json"]
main = next(t for t in observed["tasks"] if t["id"] == "task:4")
assert main["nominalResourceChoice"]["fixedResourceIds"] == ["plan-resource:2"]
c = receipts["channel-projection/characterization.json"]
assert c["rawPlacement"]["firstRejectionReason"] == "NOMINAL_RESOURCE_ASSIGNMENT"
assert c["graphs"][0]["witness"]["status"] == "FEASIBLE"
assert not any(e["mainTaskId"] == "task:4" for e in c["graphs"][0]["edges"])
assert not receipts["channel-projection/search-taps.json"]["hardGate"]
assert c["variants"][0]["dynamicWithCritical"]["eligibleStartCount"] == 0
assert c["variants"][1]["dynamicWithCritical"]["eligibleStartCount"] == 3
assert c["graphs"][1]["reserved"] is None
assert c["graphs"][2]["reserved"] is not None
assert c["graphs"][2]["repaired"]["outcome"] == "PERFECT"
assert all(not f["validation"]["hardValid"] for f in c["forgeries"])
assert len(c["selectedControls"][1]["partial"]["proposal"]) == 1
assert len(c["selectedControls"][1]["partial"]["evidence"]["nominalPhysicalFutureWitness"]["tasks"]) == 11

def comparable(value):
    if isinstance(value, list):
        return [comparable(item) for item in value]
    if isinstance(value, dict):
        return {key: comparable(item) for key, item in value.items() if not key.endswith("Ms") and key != "stack"}
    return value

if args.replay:
    fresh = json.loads(gzip.decompress((args.replay / "receipts.json.gz").read_bytes()))
    assert receipts.keys() == fresh.keys()
    for name, value in receipts.items():
        assert comparable(value) == comparable(fresh[name]), f"Replay mismatch: {name}"
if args.extract:
    assert not args.extract.exists(), "Use a fresh extraction directory"
    for name, value in receipts.items():
        path = args.extract / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
print(json.dumps({"status": "PASS", "receipts": len(receipts), "sources": len(receipts["source-authority.json"]["files"]),
                  "fullReplayEqual": bool(args.replay)}))
