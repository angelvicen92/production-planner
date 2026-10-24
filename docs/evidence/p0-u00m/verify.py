"""Verify the causal receipts; optionally compare a fresh independent native run.

python3 docs/evidence/p0-u00m/verify.py [native-directory [repeat-native-directory]]
Default reads the committed gzip bundle. No database or network access.
"""
import gzip
import hashlib
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[3]
HERE = pathlib.Path(__file__).resolve().parent


def bundle(path=None):
    if path:
        return {p.name: json.loads(p.read_text()) for p in pathlib.Path(path).glob("*.json")}
    return json.loads(gzip.decompress((HERE / "native/receipts.json.gz").read_bytes()))


def verify(data):
    checks = []

    def check(condition, description):
        assert condition, description
        checks.append(description)

    integration = data["integration.json"]
    check(integration["status"] == "PASS", "native stack completed")
    check(integration["remoteWrites"] == 0, "no remote writes")
    check("PostgreSQL 17" in integration["postgresVersion"], "real PostgreSQL 17")
    check({int(m["file"][:3]) for m in integration["migrations"]} == set(range(1, 113)) and len(integration["migrations"]) == 115, "complete ledger: 115 historical files through 112")
    check(integration["journey"]["acceptedDiagnosticS2"] == 0, "no bypass Stage accepted")
    for day in data["days.json"]:
        label = day["label"]

        def get(name):
            return data[f"{label}-{name}.json"]

        s0, s1, after = get("S0"), get("S1"), get("after")
        old_ids, current_ids = set(day["snapshotTaskIds"]), set(day["currentTaskIds"])
        check(current_ids - old_ids == {day["addedTaskId"]}, f"{label}: exact new identity")
        check(s1 == after, f"{label}: literal session/Stage/revision equality after addition")
        check(s1["activeStage"]["ordinal"] == 1, f"{label}: actual accepted S1")
        check(get("control-rollback")["draft"] == s0["draft"] and get("control-redo")["activeStage"] == s1["activeStage"], f"{label}: exact rollback/redo before additions")
        check(len(s1["history"]) == day["stagesAfterProbes"] == 2, f"{label}: no probe Stage persisted")
        check(day["effectiveFingerprintBefore"] != day["effectiveFingerprintAfter"], f"{label}: effective identity changed")
        check(s0["currentConfigRevisionId"] == s1["currentConfigRevisionId"] == day["revisionIdUnchanged"], f"{label}: persisted revision unchanged")
        sources, new_sources = get("sources-S1"), get("sources-after")
        check([t for t in new_sources["daily_tasks"] if t["id"] != day["addedTaskId"]] == sources["daily_tasks"], f"{label}: pure addition after S1")
        check({k: v for k, v in sources.items() if k != "daily_tasks"} == {k: v for k, v in new_sources.items() if k != "daily_tasks"}, f"{label}: all other authorities identical")
        check(not new_sources["locks"] and all(t["status"] == "pending" for t in new_sources["daily_tasks"]), f"{label}: pending tasks, no artificial locks")
        check(get("new-task")["start_planned"] is None, f"{label}: addition remains unplanned")
        check(get("preview")["reason"] == "REBOOTSTRAP_ACCEPTED_STAGE", f"{label}: intentional first gate")
        for name, code in [("incorporate", "REBOOTSTRAP_ACCEPTED_STAGE"), ("new-run", "STALE_CONFIG_REVISION"), ("validate-after", "STALE_CONFIG_REVISION"), ("CAS", "STALE_DRAFT"), ("rollback", "TASK_SET_MISMATCH"), ("redo", "NO_REDO_AVAILABLE")]:
            check(get(name)["body"]["code"] == code, f"{label}: API {name} → {code}")
        check(get("permissions")["status"] == 403, f"{label}: viewer forbidden")
        check(get("existing-run-after-add")["status"] == "error" and "STALE_CONFIG_REVISION" in get("existing-run-after-add")["message"], f"{label}: old scope rejected before search")
        for name, code in [("running", "REBOOTSTRAP_PENDING_PROPOSAL"), ("modification", "REBOOTSTRAP_TASK_CHANGED_OR_REMOVED"), ("protected", "REBOOTSTRAP_PROTECTED_DAY")]:
            receipt = get(f"S0-{name}-negative")
            check(receipt["ok"] and receipt["value"]["reason"] == code, f"{label}: unmodified SQL negative {name}")
        for name, code in [("accept-after-old-apply", "TASK_SET_MISMATCH"), ("apply-snapshot", "TASK_SET_MISMATCH"), ("redo-across-task-set", "TASK_SET_MISMATCH"), ("manual-extend", "TASK_SET_MISMATCH"), ("expanded-draft-old-proposal", "STALE_DRAFT"), ("updated-revision-old-proposal", "STALE_CONFIG_REVISION"), ("CAS", "STALE_DRAFT"), ("stale-source-token", "REBOOTSTRAP_STALE_SOURCES")]:
            receipt = get(f"SQL-{name}")
            check(not receipt["ok"] and receipt["message"] == code, f"{label}: SQL {name} → {code}")
        check(get("SQL-writer-contention")["code"] == "55P03", f"{label}: concurrent writer rejected NOWAIT")
        check(get("SQL-old-proposal-apply")["ok"], f"{label}: old proposal can still apply before revision transition")
        check(get("expanded-draft-request")["code"] == "DIRTY_DRAFT", f"{label}: Draft enlargement alone rejected")
        cf = get("counterfactual-old-origin")["result"]
        check(cf["outcome"] == "PROPOSAL", f"{label}: feasible counterfactual")
        check(day["addedTaskId"] in {t["taskId"] for t in cf["proposal"]} and day["addedTaskId"] not in {t["taskId"] for t in cf["proposedDraftSnapshot"]["tasks"]}, f"{label}: origin projection drops calculated addition")
        check(cf["evidence"]["protectedPlacementsPreserved"] and cf["evidence"]["protectedPlacementCount"] == len(day["initialTaskIds"]), f"{label}: accepted placements protected without locks")
        protected = [t for t in s1["draft"]["tasks"] if t["startPlanned"]]
        for task in protected:
            check(task in cf["proposedDraftSnapshot"]["tasks"], f"{label}: preserved accepted task {task['taskId']}")
        expanded = get("expanded-working-snapshot")["snapshot"]
        check(set(t["taskId"] for t in expanded["tasks"]) == current_ids and all(t in expanded["tasks"] for t in s1["draft"]["tasks"]), f"{label}: working snapshot can expand without changing Stage")
        replacement = get("SQL-replacement-session")
        check(replacement["ok"], f"{label}: replacement-session probe executed")
        value = replacement["value"]
        check(int(value["link"]["previous_session_id"]) == day["sessionId"] and len(value["history"]) == 1 and value["rollbackError"] == "INVALID_STAGE_TARGET", f"{label}: replacement keeps DB link but severs operational history")
        for i, reason in [(1, "REBOOTSTRAP_PENDING_PROPOSAL"), (2, "REBOOTSTRAP_TASK_CHANGED_OR_REMOVED")]:
            ablation = get(f"guard-ablation-{i}")
            check(ablation["observation"]["reason"] == reason, f"{label}: ablation {i} → {reason}")
        definition = get("guard-definitions")["before"]
        for i in [1, 2]:
            ablation = get(f"guard-ablation-{i}")
            check(hashlib.sha256(definition.encode()).hexdigest() == ablation["beforeSha256"] and definition.count(ablation["from"]) == 1, f"{label}: exact ablation {i} before receipt")
            definition = definition.replace(ablation["from"], ablation["to"])
            check(hashlib.sha256(definition.encode()).hexdigest() == ablation["afterSha256"], f"{label}: exact ablation {i} after receipt")
        if label == "B":
            old = protected[0]
            new = next(t for t in cf["proposal"] if t["taskId"] == day["addedTaskId"])
            check(old["assignedResourceIds"] == new["assignedResourceIds"] and old["endPlanned"] <= new["startPlanned"], "B: competing physical resource scheduled around S1")
        check(get("effective-after")["readiness"]["status"] == "READY", f"{label}: representability READY does not prove Assisted continuity")
    return checks


def deterministic_projection(data):
    return {
        label: {
            "snapshot": data[f"{label}-S1.json"]["draft"],
            "S1Fingerprint": data[f"{label}-S1.json"]["draftFingerprint"],
            "scopeProposal": data[f"{label}-S1-proposal.json"]["assisted_result_json"],
            "counterfactual": data[f"{label}-counterfactual-old-origin.json"]["result"],
            "expanded": data[f"{label}-expanded-working-snapshot.json"],
            "effectiveBefore": data[f"{label}-before-identity.json"]["identity"],
            "effectiveAfter": data[f"{label}-after-identity.json"]["identity"],
        } for label in ["A", "B"]
    }


def strip_runtime(value):
    if isinstance(value, list):
        return [strip_runtime(v) for v in value]
    if isinstance(value, dict):
        return {k: strip_runtime(v) for k, v in value.items() if k not in {"durationMs", "elapsedMs", "runtimeMs"}}
    return value


data = bundle(sys.argv[1] if len(sys.argv) > 1 else None)
checks = verify(data)
if len(sys.argv) > 2 or len(sys.argv) == 1:
    repeat = bundle(sys.argv[2]) if len(sys.argv) > 2 else json.loads(gzip.decompress((HERE / "native/repeat-receipts.json.gz").read_bytes()))
    verify(repeat)
    assert strip_runtime(deterministic_projection(data)) == strip_runtime(deterministic_projection(repeat)), "deterministic outputs differ"
    checks.append("independent repeat: identical snapshots, identities, proposals, evidence/work except runtime")
if not (len(sys.argv) > 1):
    manifest = json.loads((HERE / "manifest.json").read_text())
    for name, expected in manifest["productHashes"].items():
        assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected, name
    checks.append(f"{len(manifest['productHashes'])} product file hashes unchanged")
    authorities = json.loads((HERE / "authorities.json").read_text())
    for name, expected in authorities["hashes"].items():
        current = subprocess.check_output(["git", "show", f"{authorities['main']}:{name}"], cwd=ROOT)
        assert hashlib.sha256(current).hexdigest() == expected, name
    checks.append("authorities verified against real main base")
    for name, expected in authorities["a2Baseline"]["hashes"].items():
        assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == expected, name
    checks.append("U00l A2 artifacts unchanged; no full A2 rerun")
print(json.dumps({"status": "PASS", "checks": len(checks), "details": checks}, indent=2, ensure_ascii=False))
