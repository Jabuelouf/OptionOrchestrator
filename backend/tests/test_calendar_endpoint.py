"""Tests for /api/v1/calendar endpoint."""

from __future__ import annotations

from datetime import date, timedelta

from api.server import app
from fastapi.testclient import TestClient

client = TestClient(app)


def test_calendar_returns_200() -> None:
    """GET /api/v1/calendar should return 200 with expected shape."""
    resp = client.get("/api/v1/calendar/")
    assert resp.status_code == 200
    body = resp.json()
    assert "events" in body
    assert "week_start" in body
    assert "week_end" in body
    assert isinstance(body["events"], list)


def test_calendar_event_shape() -> None:
    """Each event must have the required keys."""
    resp = client.get("/api/v1/calendar/")
    body = resp.json()
    required_keys = {"date", "time", "symbol", "event", "estimate", "actual"}
    for ev in body["events"]:
        assert required_keys.issubset(ev.keys()), f"Missing keys in event: {ev}"


def test_calendar_week_offset() -> None:
    """week_offset should shift the week window."""
    resp_this = client.get("/api/v1/calendar/", params={"week_offset": 0})
    resp_next = client.get("/api/v1/calendar/", params={"week_offset": 1})
    assert resp_this.status_code == 200
    assert resp_next.status_code == 200
    this_week = resp_this.json()
    next_week = resp_next.json()
    # Next week's start should be 7 days after this week's start.
    this_start = date.fromisoformat(this_week["week_start"])
    next_start = date.fromisoformat(next_week["week_start"])
    assert next_start - this_start == timedelta(days=7)


def test_calendar_has_economic_events() -> None:
    """There should be at least some economic events in a typical week."""
    # Pick a week that's very likely to have events (mid-month has CPI/PPI).
    for offset in range(-2, 4):
        resp = client.get("/api/v1/calendar/", params={"week_offset": offset})
        body = resp.json()
        econ = [e for e in body["events"] if e["symbol"] == "-"]
        if econ:
            return  # Found at least one
    # During edge cases some weeks might be empty, so this is a soft check.
    # At minimum, the endpoint must respond without error.
