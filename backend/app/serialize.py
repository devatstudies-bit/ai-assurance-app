"""Converts ORM rows into the camelCase JSON shapes the web client uses (web/src/domain/types.ts)."""

from typing import Any

from sqlalchemy import inspect

from .framework import Perm, can
from .models import Authorization, Finding, LibraryItem


def _camel(name: str) -> str:
    name = name.rstrip("_")
    head, *rest = name.split("_")
    return head + "".join(p.title() for p in rest)


def to_api(obj: Any) -> dict[str, Any]:
    mapper = inspect(obj).mapper
    return {_camel(attr.key): getattr(obj, attr.key) for attr in mapper.column_attrs}


def finding_out(f: Finding, role: str) -> dict[str, Any]:
    d = to_api(f)
    if not can(role, Perm.VIEW_ATTACK_CONTENT):
        # Product teams see a finding summary, never raw attack detail (section 10.5)
        d["evidence"] = f.evidence.split(";")[0]
    return d


def library_out(item: LibraryItem, role: str) -> dict[str, Any]:
    d = to_api(item)
    if item.restricted and not can(role, Perm.VIEW_ATTACK_CONTENT):
        d["items"] = None
        d["path"] = "restricted://…"
    return d


def authorization_out(a: Authorization) -> dict[str, Any]:
    return to_api(a)  # the from_ attribute is exposed as "from"
