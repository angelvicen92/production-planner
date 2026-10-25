"""Verify the diagnostic receipts offline; never contacts services or changes product."""
import gzip
import hashlib
import json
import re
import subprocess
import io
from pathlib import Path

root = Path(__file__).resolve().parent
repo = root.parents[2]


def read(path):
    path = root / path
    if path.exists():
        return json.loads(path.read_text())
    return json.loads(gzip.decompress(Path(str(path) + ".gz").read_bytes()))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


manifest = read("manifest.json")
assert manifest["ref"] == "e79f8ee1a13ef5f5df58371abc851b4746385412"
assert manifest["baseTree"] == "ff9e1ee7ee70b8daa3c1e01bf0cb64714d76c7c1"
assert manifest["remoteWrites"] == 0
assert digest(repo / "package-lock.json") == manifest["lockfileSha256"]
# Historical receipt authority is its exact Git base, not today's implementation.
paths=list(manifest["sourceHashes"])
objects=subprocess.check_output(["git","cat-file","--batch"],cwd=repo,input="".join(manifest["ref"]+":"+path+"\n" for path in paths).encode())
stream=io.BytesIO(objects)
for path in paths:
    header=stream.readline().split();assert len(header)==3,(path,header)
    content=stream.read(int(header[2]));assert stream.read(1)==b"\n"
    assert hashlib.sha256(content).hexdigest()==manifest["sourceHashes"][path],path
for name, expected in manifest["diagnosticHashes"].items():
    assert digest(repo / "script/diagnostics" / name) == expected, name
# The preceding Git-object audit verifies this exact historical harness too.
assert manifest["sourceHashes"]["script/demo/smokeNewDayIntegration.ts"] == manifest["originalHarnessSha256"]

native = read("causal/integration.json")
assert native["status"] == "PASS" and native["remoteWrites"] == 0
assert native["journey"]["status"] == "PREFLIGHT_REJECTION_REPRODUCED"
expected_migrations = {Path(path).name: digest(repo / path) for path in paths if path.startswith("supabase/migrations/") and path.endswith(".sql")}
assert {row["file"]: row["sha256"] for row in native["migrations"]} == expected_migrations
rejected = read("causal/A-rejected.json")
assert rejected == {"status": 422, "body": {"code": "UNSUPPORTED_ENGINE_INPUT", "message": "UNSUPPORTED_ENGINE_INPUT"}}
before, after = read("causal/A-S0.json"), read("causal/A-after-rejection.json")
assert before["activeStage"] == after["activeStage"]
assert before["draft"] == after["draft"]
adapter = read("causal/A-adapter.json")
assert adapter["status"] == "UNSUPPORTED"
assert any(issue["code"] == "UNSUPPORTED_RESOURCE_REQUIREMENT" and
           issue["path"].endswith(".resourceRequirements.anyOf.0") for issue in adapter["issues"])
assert read("causal/A-readiness.json")["readiness"]["status"] != "READY"

original, counterfactual = read("causal/A-input.json"), read("causal/counterfactual-input.json")
flexible = next(task for task in original["tasks"] if task["resourceRequirements"].get("anyOf"))
critical = next(task for task in original["tasks"] if task["id"] != flexible["id"])
fixed = int(next(iter(critical["resourceRequirements"]["byItem"])))
other = next(item for item in flexible["resourceRequirements"]["anyOf"][0]["resourceItemIds"] if item != fixed)
expected = json.loads(json.dumps(original))
next(task for task in expected["tasks"] if task["id"] == flexible["id"])["resourceRequirements"] = {"byItem": {str(other): 1}}
assert expected == counterfactual
assert not original.get("itinerantTeamAvailability")
assert all(not task.get("assignedResourceIds") and not task.get("declaredResourceIds") for task in original["tasks"])

boundary, released = read("boundary.json"), read("guard-released.json")
assert boundary["status"] == released["status"] == "BOUNDARY_REPRODUCED"
assert not boundary["guardReleased"] and released["guardReleased"]
assert boundary["completeWithA"]["proposal"] is None
assert boundary["completeWithB"]["evidence"]["completeForScope"]
assert boundary["completeWithB"]["evidence"]["hardValid"]
assert boundary["completeWithB"]["evidence"]["requiredValid"]
placements = boundary["completeWithB"]["proposal"]
assert len(placements) == 2
assert all(task["start"] == 540 and task["end"] == 560 for task in placements)
for key, global_id in [("fixed", fixed), ("other", other)]:
    daily_id = next(item["id"] for item in original["planResourceItems"] if item["resourceItemId"] == global_id)
    assert daily_id != global_id and daily_id == boundary["dailyIds"][key]
    task_id = critical["id"] if key == "fixed" else flexible["id"]
    assert next(task for task in placements if task["id"] == f"task:{task_id}")["requiredResourceIds"] == [f"plan-resource:{daily_id}"]
future = boundary["differentParticipantFuture"]
assert future["analyticalFutureTaskIds"] == [f"task:{critical['id']}"]
assert future["A"]["first"]["evidence"]["completeForScope"]
assert not future["A"]["second"]["evidence"]["completeForScope"]
assert future["B"]["first"]["evidence"]["completeForScope"]
assert future["B"]["second"]["evidence"]["completeForScope"]
integrity = boundary["ordinaryResultIntegrity"]
assert integrity["omittedValidation"]["hardValid"] and integrity["fingerprintsEqual"]
assert integrity["originalFingerprint"] == integrity["omittedFingerprint"]
loss = released["released"]
assert loss["adapter"]["status"] == "SUPPORTED"
assert loss["result"]["evidence"]["completeForScope"]
assert not next(task for task in loss["result"]["proposal"] if task["id"] == f"task:{flexible['id']}").get("requiredResourceIds")
assert not any(item["id"] == loss["lostAlternativeResourceId"] for item in loss["adapter"]["problem"]["resources"])

summary = read("summary.json")
assert summary["status"] == "DIAGNOSTIC_PASS_IMPLEMENTATION_BLOCKED"
assert summary["productUnchanged"] and summary["remoteWrites"] == 0
assert summary["productFileCount"] == len(manifest["sourceHashes"])
validation = read("validation.json")
assert validation["status"] == "DIAGNOSTIC_PASS_IMPLEMENTATION_BLOCKED"
assert validation["remoteWrites"] == 0 and not validation["mergePerformed"]
assert all(check["exitCode"] == 0 for check in validation["checks"])
suite_log = gzip.decompress((root / "checks/product-suite.log.gz").read_bytes()).decode()
diagnostic_log = (root / "checks/diagnostic-tests.log").read_text()
for text, recorded in [(suite_log, validation["productSuite"]), (diagnostic_log, validation["diagnosticTests"])]:
    for key in ["tests", "pass", "fail"]:
        assert int(re.findall(r"(?:#|ℹ) " + key + r" (\d+)", text)[-1]) == recorded[key]
    assert recorded["tests"] == recorded["pass"] and recorded["fail"] == 0
print(json.dumps({"status": "DIAGNOSTIC_PASS_IMPLEMENTATION_BLOCKED", "base": manifest["ref"],
                  "productFilesUnchanged": len(manifest["sourceHashes"]),
                  "nativeRejection": 422, "concreteWitness": "B/A simultaneous, 2/2",
                  "crossScopePhysicalFutureGap": "REPRODUCED", "ordinaryIdentityIntegrityGap": "REPRODUCED",
                  "guardOnlyProjectionLoss": "REPRODUCED", "migrationFilesExecuted": len(expected_migrations),
                  "productTestsPassed": validation["productSuite"]["pass"],
                  "diagnosticTestsPassed": validation["diagnosticTests"]["pass"],
                  "remoteWrites": 0}, indent=2))
