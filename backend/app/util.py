from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from .models import Counter


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def now() -> str:
    return iso(datetime.now(timezone.utc))


def parse(ts: str) -> datetime:
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def add_days(ts: str, days: float) -> str:
    return iso(parse(ts) + timedelta(days=days))


def months_between(a: str, b: str) -> float:
    return (parse(b) - parse(a)).total_seconds() / (86400 * 30.44)


def days_from_now(days: int, hour: int = 10) -> str:
    local = datetime.now().astimezone().replace(hour=hour, minute=0, second=0, microsecond=0)
    return iso(local + timedelta(days=days))


def next_id(db: Session, prefix: str) -> str:
    """One shared sequence keeps IDs unique and ordered across FND-, RT-, REG- and RUN- prefixes."""
    counter = db.get(Counter, "seq")
    if counter is None:
        counter = Counter(name="seq", value=0)
        db.add(counter)
    counter.value += 1
    db.flush()
    return f"{prefix}-{counter.value:04d}"
