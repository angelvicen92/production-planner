#!/usr/bin/env python3
import json
import sys
from typing import Any, Dict, List, Optional, Tuple


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


def compute_main_zone_occupied_slots(
    engine_input: Dict[str, Any],
    planned: List[Dict[str, Any]],
    work_start: int,
    work_end: int,
    grid: int,
) -> int:
    horizon = max(1, (work_end - work_start) // grid)
    tasks_by_id = {int(t.get("id")): t for t in engine_input.get("tasks", [])}
    main_zone_raw = engine_input.get("optimizerMainZoneId")
    try:
        main_zone = int(main_zone_raw)
    except Exception:
        return 0
    if main_zone <= 0:
        return 0

    occupied = [0] * horizon
    for p in planned:
        tid = int(p.get("taskId") or -1)
        task = tasks_by_id.get(tid) or {}
        if int(task.get("zoneId") or 0) != main_zone:
            continue
        s = parse_hhmm(p.get("startPlanned"))
        e = parse_hhmm(p.get("endPlanned"))
        s_slot = max(0, (s - work_start) // grid)
        e_slot = min(horizon, (e - work_start + (grid - 1)) // grid)
        for slot in range(s_slot, e_slot):
            if 0 <= slot < horizon:
                occupied[slot] = 1
    return sum(occupied)


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
    locks_by_task: Dict[int, Dict[str, Any]] = {}
    for lock in engine_input.get("locks", []):
        task_id = int(lock.get("taskId") or -1)
        lock_type = str(lock.get("lockType") or "")
        if task_id <= 0 or lock_type not in ["time", "full"]:
            continue
        if task_id not in locks_by_task:
            locks_by_task[task_id] = lock

    def warm_with_message(message: str, technical: List[str]) -> int:
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
            "message": message,
            "technicalDetails": technical,
        }
        sys.stdout.write(json.dumps(out))
        return 0

    def lock_start_slot(lock: Dict[str, Any], tid: int, dur_slots: int) -> Tuple[Optional[int], Optional[List[str]]]:
        start_raw = lock.get("lockedStart")
        if not start_raw:
            return None, [f"lock_missing_lockedStart_task={tid}"]
        start_min = parse_hhmm(str(start_raw))
        if start_min < work_start or start_min > work_end:
            return None, [f"lock_outside_workday_task={tid}"]
        delta = start_min - work_start
        if delta % grid != 0:
            return None, [f"lock_unaligned_grid_task={tid}"]
        start_slot = delta // grid
        if start_slot < 0 or start_slot + dur_slots > horizon:
            return None, [f"lock_outside_horizon_task={tid}"]

        locked_end = lock.get("lockedEnd")
        if locked_end:
            end_min = parse_hhmm(str(locked_end))
            expected_end = start_min + dur_slots * grid
            if end_min != expected_end:
                return None, [f"lock_duration_mismatch_task={tid}"]
        return int(start_slot), None

    model = cp_model.CpModel()
    start_vars: Dict[int, Any] = {}
    end_vars: Dict[int, Any] = {}
    intervals: Dict[int, Any] = {}
    duration_slots_by_tid: Dict[int, int] = {}

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

        fixed_by_status = str(t.get("status") or "pending") in ["in_progress", "done", "cancelled"]
        lock = locks_by_task.get(tid)
        fixed_by_lock = lock is not None
        fixed = fixed_by_status or fixed_by_lock

        lock_slot = None
        if fixed_by_lock and lock is not None:
            lock_slot, lock_error = lock_start_slot(lock, tid, dur_slots)
            if lock_error:
                return warm_with_message(
                    "Lock incompatible con workday/grid; se devuelve Fase A.",
                    lock_error,
                )

        fixed_ws = lock_slot if lock_slot is not None else ws
        lb, ub = (fixed_ws, fixed_ws) if fixed else (0, max(0, horizon - dur_slots))

        s = model.NewIntVar(lb, ub, f"s_{tid}")
        e = model.NewIntVar(max(0, lb + dur_slots), min(horizon, ub + dur_slots), f"e_{tid}")
        iv = model.NewIntervalVar(s, dur_slots, e, f"iv_{tid}")
        start_vars[tid] = s
        end_vars[tid] = e
        intervals[tid] = iv
        duration_slots_by_tid[tid] = dur_slots
        if fixed_by_lock:
            model.Add(s == fixed_ws)
            model.Add(e == fixed_ws + dur_slots)

        if not fixed:
            movable_task_ids.append(tid)

        # warm start hint
        model.AddHint(s, ws)

    # No overlap by space and contestant
    by_space: Dict[int, List[Any]] = {}
    by_contestant: Dict[int, List[Any]] = {}
    by_resource: Dict[int, List[Any]] = {}
    for tid, iv in intervals.items():
        t = tasks_by_id.get(tid, {})
        sid = int(t.get("spaceId") or 0)
        cid = int(t.get("contestantId") or 0)
        assigned_resources = warm_by_id.get(tid, {}).get("assignedResources") or []
        if sid > 0:
            by_space.setdefault(sid, []).append(iv)
        if cid > 0:
            by_contestant.setdefault(cid, []).append(iv)
        for rid_raw in assigned_resources:
            rid = int(rid_raw or 0)
            if rid > 0:
                by_resource.setdefault(rid, []).append(iv)

    for items in by_space.values():
        if len(items) > 1:
            model.AddNoOverlap(items)
    for items in by_contestant.values():
        if len(items) > 1:
            model.AddNoOverlap(items)
    for items in by_resource.values():
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

    # near-hard level 10: keep level10-space tasks at warm start; allow configurable breaks
    degrade_bools: List[Tuple[int, Any]] = []
    grouping = engine_input.get("groupingBySpaceId") or {}
    try:
        near_hard_breaks_max = int(float(engine_input.get("optimizerNearHardBreaksMax") or 0))
    except Exception:
        near_hard_breaks_max = 0
    near_hard_breaks_max = max(0, min(10, near_hard_breaks_max))
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
        model.Add(sum(b for _, b in degrade_bools) <= near_hard_breaks_max)

    # Objective components
    abs_diffs = []
    for tid in movable_task_ids:
        ws = int((parse_hhmm(warm_by_id[tid].get("startPlanned")) - work_start) // grid)
        d = model.NewIntVar(0, horizon, f"d_{tid}")
        model.AddAbsEquality(d, start_vars[tid] - ws)
        abs_diffs.append(d)

    main_zone_id_raw = engine_input.get("optimizerMainZoneId")
    try:
        main_zone_id = int(main_zone_id_raw)
    except Exception:
        main_zone_id = 0
    main_zone_task_ids = [
        tid for tid in start_vars.keys()
        if int((tasks_by_id.get(tid) or {}).get("zoneId") or 0) == main_zone_id and main_zone_id > 0
    ]

    delta_slots = 12
    occ_slots_set = set()
    for tid in main_zone_task_ids:
        wp = warm_by_id.get(tid) or {}
        ws = int((parse_hhmm(wp.get("startPlanned")) - work_start) // grid)
        dur_slots = duration_slots_by_tid.get(tid, 1)
        we = ws + dur_slots
        lo = max(0, ws - delta_slots)
        hi = min(horizon - 1, we + delta_slots)
        for s in range(lo, hi + 1):
            occ_slots_set.add(s)
    occ_slots = sorted(list(occ_slots_set))
    occ_vars: Dict[int, Any] = {}
    occ_cover_vars: List[Any] = []
    for s in occ_slots:
        cover_bools = []
        for tid in main_zone_task_ids:
            dur_slots = duration_slots_by_tid.get(tid, 1)
            min_start = max(0, s - dur_slots + 1)
            max_start = min(horizon - dur_slots, s)
            if min_start > max_start:
                continue
            b = model.NewBoolVar(f"cover_{tid}_{s}")
            model.Add(start_vars[tid] <= s).OnlyEnforceIf(b)
            model.Add(start_vars[tid] >= s - dur_slots + 1).OnlyEnforceIf(b)
            cover_bools.append(b)
            occ_cover_vars.append(b)
        if not cover_bools:
            continue
        occ = model.NewBoolVar(f"occ_{s}")
        model.AddBoolOr(cover_bools).OnlyEnforceIf(occ)
        model.AddBoolAnd([b.Not() for b in cover_bools]).OnlyEnforceIf(occ.Not())
        model.AddBoolOr([occ.Not(), *cover_bools])
        for b in cover_bools:
            model.AddImplication(b, occ)
        occ_vars[s] = occ

    makespan = model.NewIntVar(0, horizon, "makespan")
    if end_vars:
        model.AddMaxEquality(makespan, list(end_vars.values()))
    else:
        model.Add(makespan == 0)

    total_slots_main = len(occ_vars)
    main_zone_empty_slots = model.NewIntVar(0, total_slots_main, "main_zone_empty_slots")
    if total_slots_main > 0:
        model.Add(main_zone_empty_slots == total_slots_main - sum(occ_vars.values()))
    else:
        model.Add(main_zone_empty_slots == 0)

    # Weighted objective: main-zone occupancy >> finish early >> warm-start distance >> near-hard breaks.
    W1 = 10000
    W2 = 100
    W3 = 1
    W4 = 5000
    objective_terms = [main_zone_empty_slots * W1, makespan * W2]
    if abs_diffs:
        objective_terms.append(sum(abs_diffs) * W3)
    if degrade_bools:
        for _, b in degrade_bools:
            objective_terms.append(b * W4)

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
    baseline_main_zone_occupied = compute_main_zone_occupied_slots(engine_input, warm_planned, work_start, work_end, grid)
    optimized_main_zone_occupied = compute_main_zone_occupied_slots(engine_input, optimized_planned, work_start, work_end, grid)
    baseline_makespan = max([parse_hhmm(p.get("endPlanned")) for p in warm_planned], default=work_start) - work_start
    optimized_makespan = max([parse_hhmm(p.get("endPlanned")) for p in optimized_planned], default=work_start) - work_start
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
        message += f" Se aplicaron {len(broken)} ruptura(s) de regla casi dura nivel 10 (máximo {near_hard_breaks_max})."

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
            f"mainZoneOccupiedSlotsBaseline={baseline_main_zone_occupied}",
            f"mainZoneOccupiedSlotsOptimized={optimized_main_zone_occupied}",
            f"makespanBaselineMinutes={baseline_makespan}",
            f"makespanOptimizedMinutes={optimized_makespan}",
            f"mainZoneSlotVars={total_slots_main}",
            f"mainZoneCoverVars={len(occ_cover_vars)}",
        ],
    }
    sys.stdout.write(json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
