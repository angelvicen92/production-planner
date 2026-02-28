#!/usr/bin/env python3
import json
import sys
from typing import Any, Dict, List, Tuple


def parse_hhmm(v: str) -> int:
    h, m = str(v or "00:00").split(":")
    return int(h) * 60 + int(m)


def to_hhmm(minutes: int) -> str:
    h = minutes // 60
    m = minutes % 60
    return f"{h:02d}:{m:02d}"


def score_plan(engine_input: Dict[str, Any], planned: List[Dict[str, Any]]) -> Tuple[int, int, int]:
    main_zone = engine_input.get("optimizerMainZoneId")
    tasks_by_id = {int(t.get("id")): t for t in engine_input.get("tasks", [])}
    by_space: Dict[int, List[Tuple[int, int, int]]] = {}
    main_intervals: List[Tuple[int, int]] = []

    for p in planned:
      tid = int(p.get("taskId"))
      if tid < 0:
          continue
      t = tasks_by_id.get(tid, {})
      sid = int(t.get("spaceId") or 0)
      zid = int(t.get("zoneId") or 0)
      s = parse_hhmm(p.get("startPlanned"))
      e = parse_hhmm(p.get("endPlanned"))
      tpl = int(t.get("templateId") or 0)
      by_space.setdefault(sid, []).append((s, e, tpl))
      if main_zone and zid == int(main_zone):
          main_intervals.append((s, e))

    switches = 0
    for _sid, items in by_space.items():
        items.sort(key=lambda x: x[0])
        for i in range(1, len(items)):
            if items[i][2] != items[i - 1][2]:
                switches += 1

    gap = 0
    if main_intervals:
        main_intervals.sort(key=lambda x: x[0])
        for i in range(1, len(main_intervals)):
            g = main_intervals[i][0] - main_intervals[i - 1][1]
            if g > 0:
                gap += g

    score = gap * 10 + switches * 5
    return score, gap, switches


def main() -> int:
    raw = sys.stdin.read()
    payload = json.loads(raw or "{}")
    engine_input = payload.get("engineInput") or {}
    warm = payload.get("warmStart") or {}
    time_limit_seconds = float(payload.get("timeLimitSeconds") or 0)

    warm_planned = list(warm.get("plannedTasks") or [])
    if time_limit_seconds <= 0 or not warm_planned:
        baseline_score, baseline_gap, baseline_switches = score_plan(engine_input, warm_planned)
        out = {
            "output": warm,
            "quality": {
                "improved": False,
                "baselineScore": baseline_score,
                "optimizedScore": baseline_score,
                "objectiveDelta": 0,
                "mainZoneGapMinutesDelta": 0,
                "spaceSwitchesDelta": 0,
            },
            "degradations": [],
            "message": "Optimización CP-SAT omitida por presupuesto 0 o sin warm start.",
            "technicalDetails": ["time_limit_seconds<=0 OR warm_start_empty"],
        }
        sys.stdout.write(json.dumps(out))
        return 0

    try:
        from ortools.sat.python import cp_model
    except Exception:
        baseline_score, baseline_gap, baseline_switches = score_plan(engine_input, warm_planned)
        out = {
            "output": warm,
            "quality": {
                "improved": False,
                "baselineScore": baseline_score,
                "optimizedScore": baseline_score,
                "objectiveDelta": 0,
                "mainZoneGapMinutesDelta": 0,
                "spaceSwitchesDelta": 0,
            },
            "degradations": [],
            "message": "OR-Tools no disponible; se devuelve Fase A.",
            "technicalDetails": ["ortools_import_failed"],
        }
        sys.stdout.write(json.dumps(out))
        return 0

    grid = 5
    work_start = parse_hhmm((engine_input.get("workDay") or {}).get("start", "00:00"))
    work_end = parse_hhmm((engine_input.get("workDay") or {}).get("end", "23:55"))
    horizon = max(1, (work_end - work_start) // grid)

    tasks_by_id = {int(t.get("id")): t for t in engine_input.get("tasks", [])}
    warm_by_id = {int(p.get("taskId")): p for p in warm_planned}

    model = cp_model.CpModel()
    start_vars: Dict[int, Any] = {}
    end_vars: Dict[int, Any] = {}
    intervals: Dict[int, Any] = {}

    movable_task_ids: List[int] = []

    for tid, p in warm_by_id.items():
        if tid < 0:
            continue
        t = tasks_by_id.get(tid)
        if not t:
            continue
        dur_min = int(t.get("durationOverrideMin") or t.get("durationMin") or max(5, parse_hhmm(p.get("endPlanned")) - parse_hhmm(p.get("startPlanned"))))
        dur_slots = max(1, dur_min // grid)

        ws = int((parse_hhmm(p.get("startPlanned")) - work_start) // grid)
        we = int((parse_hhmm(p.get("endPlanned")) - work_start) // grid)

        fixed = str(t.get("status") or "pending") in ["in_progress", "done", "cancelled"]
        lb, ub = (ws, ws) if fixed else (0, max(0, horizon - dur_slots))

        s = model.NewIntVar(lb, ub, f"s_{tid}")
        e = model.NewIntVar(max(0, lb + dur_slots), min(horizon, ub + dur_slots), f"e_{tid}")
        iv = model.NewIntervalVar(s, dur_slots, e, f"iv_{tid}")
        start_vars[tid] = s
        end_vars[tid] = e
        intervals[tid] = iv
        if not fixed:
            movable_task_ids.append(tid)

        # warm start hint
        model.AddHint(s, ws)

    # No overlap by space and contestant
    by_space: Dict[int, List[Any]] = {}
    by_contestant: Dict[int, List[Any]] = {}
    for tid, iv in intervals.items():
        t = tasks_by_id.get(tid, {})
        sid = int(t.get("spaceId") or 0)
        cid = int(t.get("contestantId") or 0)
        if sid > 0:
            by_space.setdefault(sid, []).append(iv)
        if cid > 0:
            by_contestant.setdefault(cid, []).append(iv)

    for items in by_space.values():
        if len(items) > 1:
            model.AddNoOverlap(items)
    for items in by_contestant.values():
        if len(items) > 1:
            model.AddNoOverlap(items)

    # Dependencies
    for tid in movable_task_ids:
        t = tasks_by_id.get(tid, {})
        deps = t.get("dependsOnTaskIds") or []
        dur_prev = 0
        for dep in deps:
            did = int(dep)
            if did in end_vars:
                model.Add(start_vars[tid] >= end_vars[did] + dur_prev)

    # near-hard level 10: keep level10-space tasks at warm start; allow breaking only one
    degrade_bools: List[Tuple[int, Any]] = []
    grouping = engine_input.get("groupingBySpaceId") or {}
    for tid in movable_task_ids:
        t = tasks_by_id.get(tid, {})
        sid = int(t.get("spaceId") or 0)
        level = int((grouping.get(str(sid)) or grouping.get(sid) or {}).get("level") or 0)
        if level < 10:
            continue
        ws = int((parse_hhmm(warm_by_id[tid].get("startPlanned")) - work_start) // grid)
        keep = model.NewBoolVar(f"keep_{tid}")
        model.Add(start_vars[tid] == ws).OnlyEnforceIf(keep)
        model.Add(start_vars[tid] != ws).OnlyEnforceIf(keep.Not())
        degrade_bools.append((tid, keep.Not()))

    if degrade_bools:
        model.Add(sum(b for _, b in degrade_bools) <= 1)

    # Objective: minimize weighted distance to warm start and compact main zone
    abs_diffs = []
    for tid in movable_task_ids:
        ws = int((parse_hhmm(warm_by_id[tid].get("startPlanned")) - work_start) // grid)
        d = model.NewIntVar(0, horizon, f"d_{tid}")
        model.AddAbsEquality(d, start_vars[tid] - ws)
        abs_diffs.append(d)

    objective_terms = list(abs_diffs)
    if degrade_bools:
        for _, b in degrade_bools:
            objective_terms.append(b * 50)

    model.Minimize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(1.0, float(time_limit_seconds))
    solver.parameters.num_search_workers = 8

    status = solver.Solve(model)

    if status not in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
        baseline_score, baseline_gap, baseline_switches = score_plan(engine_input, warm_planned)
        out = {
            "output": warm,
            "quality": {
                "improved": False,
                "baselineScore": baseline_score,
                "optimizedScore": baseline_score,
                "objectiveDelta": 0,
                "mainZoneGapMinutesDelta": 0,
                "spaceSwitchesDelta": 0,
            },
            "degradations": [],
            "message": "CP-SAT sin mejora factible; se devuelve Fase A.",
            "technicalDetails": [f"status={status}"],
        }
        sys.stdout.write(json.dumps(out))
        return 0

    optimized_planned: List[Dict[str, Any]] = []
    for p in warm_planned:
        tid = int(p.get("taskId"))
        if tid < 0 or tid not in start_vars:
            optimized_planned.append(p)
            continue
        s = int(solver.Value(start_vars[tid]))
        duration = parse_hhmm(p.get("endPlanned")) - parse_hhmm(p.get("startPlanned"))
        start_m = work_start + s * grid
        end_m = start_m + duration
        optimized_planned.append({
            **p,
            "startPlanned": to_hhmm(start_m),
            "endPlanned": to_hhmm(end_m),
        })

    baseline_score, baseline_gap, baseline_switches = score_plan(engine_input, warm_planned)
    optimized_score, optimized_gap, optimized_switches = score_plan(engine_input, optimized_planned)
    improved = optimized_score <= baseline_score

    broken = []
    for tid, b in degrade_bools:
        if solver.Value(b) == 1:
            task = tasks_by_id.get(tid, {})
            broken.append({
                "rule": "LEVEL10_KEEP_WARM_START",
                "taskId": tid,
                "spaceId": int(task.get("spaceId") or 0),
                "reason": "Se movió para desbloquear optimización global manteniendo hard constraints.",
            })

    output = dict(warm)
    output["plannedTasks"] = optimized_planned if improved else warm_planned

    message = "CP-SAT completado; se mantiene best-so-far."
    if broken:
        message += " Se aplicó una única ruptura de regla casi dura nivel 10."

    out = {
        "output": output,
        "quality": {
            "improved": bool(improved and optimized_score < baseline_score),
            "baselineScore": baseline_score,
            "optimizedScore": optimized_score if improved else baseline_score,
            "objectiveDelta": (optimized_score - baseline_score) if improved else 0,
            "mainZoneGapMinutesDelta": (optimized_gap - baseline_gap) if improved else 0,
            "spaceSwitchesDelta": (optimized_switches - baseline_switches) if improved else 0,
        },
        "degradations": broken,
        "message": message,
        "technicalDetails": [
            f"status={status}",
            f"wall_time_s={solver.WallTime():.3f}",
            f"branches={solver.NumBranches()}",
            f"conflicts={solver.NumConflicts()}",
        ],
    }
    sys.stdout.write(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
