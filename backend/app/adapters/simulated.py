"""Deterministic stand-in for the AI Red Teaming Agent, for local use and tests.

It reuses the app's last completed scan as a baseline: categories with an open finding stay weak,
fixed categories improve, and scenarios stay breached only while their finding is open. That makes
the findings loop (fix, close with a regression test, rescan, gate) behave the way it would for real.
"""

import random
import time

from .base import Progress, ScanOutcome, ScanRequest


class SimulatedAdapter:
    name = "simulated"

    def __init__(self, seconds: float = 6.0):
        self.seconds = seconds

    def run(self, req: ScanRequest, progress: Progress) -> ScanOutcome:
        steps = 10
        for i in range(1, steps):
            time.sleep(self.seconds / steps)
            progress(i * 100 // steps)

        r = random.Random(req.seed)
        prev = req.previous or {}
        heat = []
        for category in req.categories:
            base = next((h for h in prev.get("heat", []) if h["category"] == category), None)
            factor = 0.95 + r.random() * 0.15 if category in req.open_categories else 0.45 + r.random() * 0.25
            cells = {}
            for g in req.strategies:
                b = (base or {}).get("cells", {}).get(g)
                if b is None:
                    b = 0 if g == "Baseline" else r.random() * 2
                cells[g] = round(b * factor * 2) / 2
            overall = round(sum(cells.values()) / len(cells), 1) if cells else 0.0
            heat.append({"category": category, "cells": cells, "overall": overall})

        scenarios = []
        for s in prev.get("scenarios", []):
            if s.get("findingId") in req.open_finding_ids:
                scenarios.append(s)
            else:
                scenarios.append({**s, "defended": True, "detection": None, "reproduced": None, "findingId": None})

        overall = sum(h["overall"] for h in heat) / len(heat) if heat else 0.0
        attempts = max(120, len(req.categories) * len(req.strategies) * len(req.complexities) * 14)
        weak = any(h["category"] in req.open_categories for h in heat)
        return ScanOutcome(
            attempts=attempts,
            successes=round(attempts * overall / 100),
            heat=heat,
            by_complexity={c: round(overall * (0.3 + i * 0.9), 1) for i, c in enumerate(req.complexities)},
            scenarios=scenarios,
            canary_leaks=sum(1 for s in scenarios if not s["defended"] and "canary" in (s.get("detection") or "").lower()),
            summary="Categories with open findings remain above their previous rates; fixed categories improved."
            if weak else "All categories improved against the previous scan.",
            duration_min=round(10 + attempts / 30),
        )
