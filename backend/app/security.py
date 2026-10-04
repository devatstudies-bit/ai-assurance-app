"""Caller identity and permission checks (section 10.5).

Local development: the client sends the role it is previewing in the X-Role header.
Production: replace `current_user` with Entra ID token validation that maps app roles
to the six framework roles; route handlers do not change.
"""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from .config import settings
from .framework import ROLES, Perm, can


@dataclass(frozen=True)
class User:
    role: str
    name: str

    def can(self, perm: Perm) -> bool:
        return can(self.role, perm)


def current_user(x_role: Annotated[str | None, Header()] = None) -> User:
    role = x_role if settings.allow_role_header and x_role else "AI platform engineer"
    if role not in ROLES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unknown role: {role}")
    return User(role=role, name=ROLES[role]["person"])


CurrentUser = Annotated[User, Depends(current_user)]


def require(user: User, perm: Perm, message: str | None = None) -> None:
    if not user.can(perm):
        raise HTTPException(status.HTTP_403_FORBIDDEN, message or f"{user.role} is not allowed to do this")
