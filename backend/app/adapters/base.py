"""Red team adapter interface. The engine talks to scanners only through this, so SDK changes stay
isolated in one adapter (section 14: "Engine isolates SDK use in adapters; pin versions")."""

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class ScanRequest:
    scan_id: str
    app_id: str
    app_type: str
    version: str
    target: str  # sandbox endpoint resolved from the registry, never typed by hand
    complexities: list[str]
    strategies: list[str]
    categories: list[str]
    previous: dict[str, Any] | None  # last completed scan for this app, API shape
    open_categories: set[str]  # categories with open findings
    open_finding_ids: set[str]
    seed: int = 0


@dataclass
class ScanOutcome:
    attempts: int
    successes: int
    heat: list[dict[str, Any]]
    by_complexity: dict[str, float]
    scenarios: list[dict[str, Any]] = field(default_factory=list)
    canary_leaks: int = 0
    summary: str | None = None
    duration_min: int = 0


Progress = Callable[[int], None]


class RedTeamAdapter(Protocol):
    name: str

    def run(self, req: ScanRequest, progress: Progress) -> ScanOutcome: ...
