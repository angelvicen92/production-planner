"""Offline verification of saved receipts; no network or database access."""
import gzip
import hashlib
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parent
repo = root.parents[2]


def read(path):
    path = Path(path)
    if path.exists():
        return json.loads(path.read_text())
    return json.loads(gzip.decompress(Path(str(path) + ".gz").read_bytes()))


baseline = repo / "docs/evidence/p0-u00e/v2"
regressions = root / "regressions"
days = []
for scenario, labels in [("main", ["first", "second"]),
                         ("standalone", ["first", "second"]),
                         ("itinerant", ["technical", "auxiliary"])]:
    current = regressions / scenario
    prior = baseline / ("regression-" + scenario)
    assert read(current / "integration.json")["status"] == "PASS"
    for label in labels:
        old = read(prior / (label + "-preflight.json"))
        new = read(current / (label + "-preflight.json"))
        for field in ["problem", "problemFingerprint", "identityMapFingerprint"]:
            assert new[field] == old[field], (scenario, label, field)
        old = read(prior / (label + "-stage.json"))["activeStage"]
        new = read(current / (label + "-stage.json"))["activeStage"]
        assert new["snapshotJson"] == old["snapshotJson"]
        assert new["snapshotFingerprint"] == old["snapshotFingerprint"]
        days.append({"scenario": scenario, "day": label,
                     "stageFingerprint": new["snapshotFingerprint"]})

for scenario, label in [("main", "main"), ("standalone", "technical")]:
    old = read(baseline / ("regression-" + scenario) / (label + "-additions-rebootstrap.json"))
    new = read(regressions / scenario / (label + "-additions-rebootstrap.json"))
    for phase in ["before", "after"]:
        assert new[phase]["activeStage"]["snapshotJson"] == old[phase]["activeStage"]["snapshotJson"]
    assert new["historical"]["snapshot_json"] == old["historical"]["snapshot_json"]

assert read(regressions / "setup-base-frozen.json") == read(regressions / "setup-candidate-frozen.json")
for scenario in ["setup", "transport", "meals"]:
    assert read(regressions / scenario / "integration.json")["status"] == "PASS"
assert read(regressions / "transport-frozen.json")["status"] == "PASS"
for label, count in [("A", 2), ("B", 3)]:
    for stage in range(1, count + 1):
        name = f"{label}-S{stage}-stage.json"
        old = read(repo / "docs/evidence/p0-u00g/implementation/native" / name)["activeStage"]
        new = read(regressions / "meals" / name)["activeStage"]
        assert new["snapshotJson"] == old["snapshotJson"]
        assert new["snapshotFingerprint"] == old["snapshotFingerprint"]

summ = read(root / "native/summary.json")
assert summ["status"] == "PASS"
assert [day["completed"] for day in summ["days"]] == [4, 4]
assert [len(day["stages"]) for day in summ["days"]] == [1, 2]
assert all(day["resourceItemId"] != day["planResourceItemId"] for day in summ["days"])
assert read(root / "causal/causal.json")["status"] == "LOSS_REPRODUCED"
manifest = read(root / "native/source-manifest.json")
assert read(root / "causal/source-manifest.json")["head"] == "5256102bf5c7eb925fd24ab1d868c2d22bc91a6e"
assert hashlib.sha256((repo / "package-lock.json").read_bytes()).hexdigest() == manifest["lockfileSha256"]
for file, digest in manifest["sourceHashes"].items():
    assert hashlib.sha256((repo / file).read_bytes()).hexdigest() == digest, file

series = [root / "a2" / name for name in ["base", "candidate", "repeat"]]
runs = [read(folder / "run.json") for folder in series]
snapshots = [read(folder / "snapshots.json") for folder in series]
assert snapshots[0] == snapshots[1] == snapshots[2]


def without_times(value):
    return {**value, "iterations": [{k: v for k, v in stage.items() if k != "durationMs"}
                                    for stage in value["iterations"]]}


assert without_times(runs[0]) == without_times(runs[1]) == without_times(runs[2])
assert read(series[0] / "runtime.json") == read(series[1] / "runtime.json") == read(series[2] / "runtime.json")
assert all(run["status"] == "PASS" and run["completedObligationCount"] == 266
           and run["stageCount"] == 11 for run in runs)
audit = read(root / "a2/canonical-audit.json")
assert audit["status"] == "PASS" and audit["snapshotsUnchanged"]
assert len(audit["stagesBefore"]) == len(audit["stagesAfter"]) == 11
for side, run in [("before", runs[0]), ("after", runs[1])]:
    assert audit[side]["fingerprint"] == run["deterministicFingerprint"]
    assert audit[side]["durationMs"] == sum(stage["durationMs"] for stage in run["iterations"])
    assert audit[side]["branches"] == sum(stage["branchesExplored"] for stage in run["iterations"])
tap = gzip.decompress((root / "checks/full-suite.tap.gz").read_bytes()).decode()
counts = {key: int(re.findall(rf"^# {key} (\d+)$", tap, re.M)[-1])
          for key in ["tests", "pass", "fail", "skipped"]}
assert counts["tests"] == counts["pass"] and counts["fail"] == counts["skipped"] == 0
report = {"status": "PASS", "base": "5256102bf5c7eb925fd24ab1d868c2d22bc91a6e",
          "nativeDays": [4, 4], "regressions": days, "protectedHistoricalStagesIdentical": True,
          "mealStagesIdentical": 5, "a2": {"obligations": 266, "stages": 11,
          "fingerprint": runs[1]["deterministicFingerprint"],
          "branches": [sum(stage["branchesExplored"] for stage in run["iterations"]) for run in runs],
          "durationMs": [sum(stage["durationMs"] for stage in run["iterations"]) for run in runs],
          "allSnapshotsAndCertificatesIdentical": True}, "suite": counts}
(root / "verification.json").write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report))
