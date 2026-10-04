"""Adapter for the Azure AI Foundry AI Red Teaming Agent (azure-ai-evaluation[redteam]), per Appendix B.

Install with `pip install -r requirements-azure.txt`, then register an attack model with provider
"azure-redteam-service" and its Foundry project endpoint (Models page). Authentication uses DefaultAzureCredential.
The hosted service generates attacks and scores responses itself.

The SDK surface (enum members and result fields) has changed between releases and several categories
are in preview. Verify this mapping against the pinned SDK version before relying on it for gating.
"""

import asyncio
import time
from collections import defaultdict
from typing import Any

from .base import Progress, ScanOutcome, ScanRequest
from .target import call_target

# Framework category name -> RiskCategory member name
CATEGORY_MAP = {
    "Hate and unfairness": "HateUnfairness", "Violence": "Violence", "Sexual": "Sexual", "Self-harm": "SelfHarm",
    "Protected material": "ProtectedMaterial", "Code vulnerability": "CodeVulnerability",
    "Ungrounded attributes": "UngroundedAttributes", "Sensitive data leakage": "SensitiveDataLeakage",
    "Task adherence": "TaskAdherence", "Prohibited actions": "ProhibitedActions",
}

# Framework strategy group -> AttackStrategy member names (section 7.2)
STRATEGY_MAP = {
    "Baseline": ["Baseline"],
    "Encoding": ["Base64", "ROT13", "CharSwap", "UnicodeConfusable", "Leetspeak", "Morse"],
    "Jailbreak": ["Jailbreak"],
    "Indirect": ["IndirectJailbreak"],
    "Multi-turn": ["MultiTurn", "Crescendo"],
}


def _group_of(technique: str) -> str:
    t = technique.lower().replace("_", "")
    for group, names in STRATEGY_MAP.items():
        if any(n.lower() in t for n in names):
            return group
    return "Encoding" if t not in ("", "baseline") else "Baseline"


class AzureRedTeamAdapter:
    name = "azure"

    def __init__(self, project_endpoint: str | None, num_objectives: int = 10):
        if not project_endpoint:
            raise RuntimeError("This Azure AI Red Teaming Agent model has no Foundry project endpoint configured")
        self.project = project_endpoint
        self.num_objectives = num_objectives

    def run(self, req: ScanRequest, progress: Progress) -> ScanOutcome:
        started = time.monotonic()
        progress(5)
        details = asyncio.run(self._scan(req))
        progress(95)
        return self._summarize(req, details, round((time.monotonic() - started) / 60))

    async def _scan(self, req: ScanRequest) -> list[dict[str, Any]]:
        from azure.ai.evaluation.red_team import AttackStrategy, RedTeam, RiskCategory  # noqa: PLC0415
        from azure.identity import DefaultAzureCredential  # noqa: PLC0415

        categories = [getattr(RiskCategory, CATEGORY_MAP[c]) for c in req.categories if hasattr(RiskCategory, CATEGORY_MAP.get(c, ""))]
        strategies = [getattr(AttackStrategy, n) for g in req.strategies for n in STRATEGY_MAP[g] if hasattr(AttackStrategy, n)]

        def target(query: str) -> str:
            # Calls the application's sandbox endpoint and returns the answer text
            return call_target(req.target, [{"role": "user", "content": query}])

        red_team = RedTeam(
            azure_ai_project=self.project, credential=DefaultAzureCredential(),
            risk_categories=categories, num_objectives=self.num_objectives,
        )
        result = await red_team.scan(target=target, scan_name=f"{req.app_id}-{req.version}-{req.scan_id}", attack_strategies=strategies)
        return list(getattr(result, "attack_details", None) or [])

    def _summarize(self, req: ScanRequest, details: list[dict[str, Any]], minutes: int) -> ScanOutcome:
        tally: dict[tuple[str, str], list[int]] = defaultdict(lambda: [0, 0])
        cx_tally: dict[str, list[int]] = defaultdict(lambda: [0, 0])
        reverse = {v.lower(): k for k, v in CATEGORY_MAP.items()}
        for d in details:
            cat = reverse.get(str(d.get("risk_category", "")).replace("_", "").lower(), str(d.get("risk_category")))
            group = _group_of(str(d.get("attack_technique", "")))
            ok = bool(d.get("attack_success"))
            tally[(cat, group)][0] += 1
            tally[(cat, group)][1] += ok
            cx = str(d.get("attack_complexity", "")).title()
            cx_tally[cx][0] += 1
            cx_tally[cx][1] += ok

        heat = []
        for cat in req.categories:
            cells, tot, succ = {}, 0, 0
            for g in req.strategies:
                n, s = tally.get((cat, g), (0, 0))
                if n:
                    cells[g] = round(s / n * 100, 1)
                tot, succ = tot + n, succ + s
            heat.append({"category": cat, "cells": cells, "overall": round(succ / tot * 100, 1) if tot else 0.0})

        attempts = len(details)
        successes = sum(1 for d in details if d.get("attack_success"))
        # Scenario attacks run through the evaluation harness; carry the latest results forward
        scenarios = (req.previous or {}).get("scenarios", [])
        return ScanOutcome(
            attempts=attempts, successes=successes, heat=heat,
            by_complexity={k: round(v[1] / v[0] * 100, 1) for k, v in cx_tally.items() if v[0]},
            scenarios=scenarios,
            canary_leaks=sum(1 for s in scenarios if not s.get("defended") and "canary" in (s.get("detection") or "").lower()),
            summary=f"Azure AI Red Teaming Agent: {attempts} attempts across {len(req.categories)} categories.",
            duration_min=minutes,
        )
