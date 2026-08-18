"""Regression tests for GET /api/tasks N+1 optimization.

Verifies today_status mapping (todo/pending/approved) and today_completion_id
still work correctly after the batch-query refactor.
"""
import io
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

PARENT = {"email": "papa@demo.fr", "password": "demo1234"}
KID = {"email": "lea@demo.fr", "password": "demo1234"}
PIN = "1234"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


@pytest.fixture(scope="module")
def parent_ctx(s):
    r = s.post(f"{API}/auth/login", json=PARENT, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    hdr = {"Authorization": f"Bearer {d['access_token']}"}
    pr = s.post(f"{API}/auth/pin/verify", json={"pin": PIN}, headers=hdr, timeout=15)
    assert pr.status_code == 200, pr.text
    return {"user": d["user"], "hdr": hdr,
            "hdr_pin": {**hdr, "X-Parent-Pin-Token": pr.json()["pin_token"]}}


@pytest.fixture(scope="module")
def kid_ctx(s):
    r = s.post(f"{API}/auth/login", json=KID, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    return {"user": d["user"], "hdr": {"Authorization": f"Bearer {d['access_token']}"}}


class TestTasksN1Regression:
    """Batch-query behavior for GET /api/tasks."""

    def test_lea_tasks_have_today_status_field(self, s, kid_ctx):
        r = s.get(f"{API}/tasks", headers=kid_ctx["hdr"], timeout=15)
        assert r.status_code == 200
        tasks = r.json()["tasks"]
        assert len(tasks) > 0, "Léa should see at least one seeded task"
        # Every task must have today_status and today_completion_id keys
        for t in tasks:
            assert "today_status" in t, f"Missing today_status on {t.get('title')}"
            assert "today_completion_id" in t, f"Missing today_completion_id on {t.get('title')}"
            assert t["today_status"] in ("todo", "pending", "approved", "rejected")

    def test_lea_sees_assigned_daily_and_weekly(self, s, kid_ctx):
        r = s.get(f"{API}/tasks", headers=kid_ctx["hdr"], timeout=15)
        tasks = r.json()["tasks"]
        titles = {t["title"] for t in tasks}
        # Seed data: Léa is assigned all daily tasks + weekly bathroom
        assert "Ranger sa chambre" in titles
        assert "Faire ses devoirs" in titles
        assert "Vider le lave-vaisselle" in titles  # Léa-only
        assert "Nettoyer la salle de bain" in titles  # weekly, all kids

    def test_complete_non_photo_updates_today_status_and_points(self, s, parent_ctx, kid_ctx):
        """Core regression: after completing, GET /api/tasks must show approved + completion_id."""
        kid_id = kid_ctx["user"]["id"]
        title = f"TEST_regress_{uuid.uuid4().hex[:6]}"
        # Create non-photo task assigned to Léa
        r = s.post(f"{API}/tasks", json={
            "title": title, "points_worth": 13, "penalty_points": 0,
            "frequency": "daily", "photo_required": False, "assigned_to": [kid_id]
        }, headers=parent_ctx["hdr_pin"], timeout=15)
        assert r.status_code == 200, r.text
        tid = r.json()["id"]

        try:
            # Before completion: today_status must be 'todo' and today_completion_id None
            r1 = s.get(f"{API}/tasks", headers=kid_ctx["hdr"], timeout=15)
            t_before = next(t for t in r1.json()["tasks"] if t["id"] == tid)
            assert t_before["today_status"] == "todo"
            assert t_before["today_completion_id"] is None

            # Points before
            pts_before = s.get(f"{API}/auth/me", headers=kid_ctx["hdr"], timeout=15).json()["points"]

            # Complete (auto-approve since photo_required=False)
            rc = s.post(f"{API}/tasks/{tid}/complete", headers=kid_ctx["hdr"], timeout=15)
            assert rc.status_code == 200, rc.text
            comp = rc.json()
            assert comp["status"] == "approved"
            comp_id = comp["id"]

            # After completion: GET /api/tasks must reflect approved + completion id
            r2 = s.get(f"{API}/tasks", headers=kid_ctx["hdr"], timeout=15)
            t_after = next(t for t in r2.json()["tasks"] if t["id"] == tid)
            assert t_after["today_status"] == "approved", f"expected approved, got {t_after['today_status']}"
            assert t_after["today_completion_id"] == comp_id, "today_completion_id must match created completion"

            # Points must have increased by exactly 13
            pts_after = s.get(f"{API}/auth/me", headers=kid_ctx["hdr"], timeout=15).json()["points"]
            assert pts_after == pts_before + 13, f"{pts_before} -> {pts_after}, expected +13"

            # Other tasks (not completed today) must remain 'todo' with None completion id
            other_todos = [t for t in r2.json()["tasks"]
                           if t["id"] != tid and t["today_status"] == "todo"]
            for t in other_todos:
                assert t["today_completion_id"] is None
        finally:
            s.delete(f"{API}/tasks/{tid}", headers=parent_ctx["hdr_pin"], timeout=15)

    def test_duplicate_same_day_returns_409(self, s, parent_ctx, kid_ctx):
        kid_id = kid_ctx["user"]["id"]
        r = s.post(f"{API}/tasks", json={
            "title": f"TEST_dup_{uuid.uuid4().hex[:6]}",
            "points_worth": 3, "penalty_points": 0,
            "frequency": "daily", "photo_required": False, "assigned_to": [kid_id]
        }, headers=parent_ctx["hdr_pin"], timeout=15)
        tid = r.json()["id"]
        try:
            r1 = s.post(f"{API}/tasks/{tid}/complete", headers=kid_ctx["hdr"], timeout=15)
            assert r1.status_code == 200
            r2 = s.post(f"{API}/tasks/{tid}/complete", headers=kid_ctx["hdr"], timeout=15)
            assert r2.status_code == 409, f"expected 409, got {r2.status_code} : {r2.text}"
        finally:
            s.delete(f"{API}/tasks/{tid}", headers=parent_ctx["hdr_pin"], timeout=15)

    def test_soft_deleted_task_excluded_from_list(self, s, parent_ctx, kid_ctx):
        # Create -> confirm present -> delete -> confirm absent
        r = s.post(f"{API}/tasks", json={
            "title": f"TEST_softdel_{uuid.uuid4().hex[:6]}",
            "points_worth": 1, "penalty_points": 0,
            "frequency": "daily", "photo_required": False, "assigned_to": []
        }, headers=parent_ctx["hdr_pin"], timeout=15)
        tid = r.json()["id"]

        r_list = s.get(f"{API}/tasks", headers=kid_ctx["hdr"], timeout=15).json()["tasks"]
        assert any(t["id"] == tid for t in r_list), "task should appear before delete"

        rd = s.delete(f"{API}/tasks/{tid}", headers=parent_ctx["hdr_pin"], timeout=15)
        assert rd.status_code == 200

        r_list2 = s.get(f"{API}/tasks", headers=kid_ctx["hdr"], timeout=15).json()["tasks"]
        assert not any(t["id"] == tid for t in r_list2), "soft-deleted task must be excluded"
        # And for parent too
        r_list3 = s.get(f"{API}/tasks", headers=parent_ctx["hdr"], timeout=15).json()["tasks"]
        assert not any(t["id"] == tid for t in r_list3), "soft-deleted excluded for parent too"


class TestSanityValidationFlow:
    """Confirm peer validation endpoints unchanged."""

    def test_pending_and_parent_vote(self, s, parent_ctx, kid_ctx):
        kid_id = kid_ctx["user"]["id"]
        r = s.post(f"{API}/tasks", json={
            "title": f"TEST_photo_{uuid.uuid4().hex[:6]}",
            "points_worth": 9, "penalty_points": 0,
            "frequency": "daily", "photo_required": True, "assigned_to": [kid_id]
        }, headers=parent_ctx["hdr_pin"], timeout=15)
        tid = r.json()["id"]
        try:
            png = bytes.fromhex(
                "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4"
                "890000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
            )
            files = {"photo": ("t.png", io.BytesIO(png), "image/png")}
            rc = s.post(f"{API}/tasks/{tid}/complete",
                        headers=kid_ctx["hdr"], files=files, timeout=60)
            assert rc.status_code == 200, rc.text
            comp = rc.json()
            assert comp["status"] == "pending"
            comp_id = comp["id"]

            # today_status should be 'pending' now
            tlist = s.get(f"{API}/tasks", headers=kid_ctx["hdr"], timeout=15).json()["tasks"]
            tt = next(t for t in tlist if t["id"] == tid)
            assert tt["today_status"] == "pending"
            assert tt["today_completion_id"] == comp_id

            # Pending list
            rp = s.get(f"{API}/completions/pending", headers=parent_ctx["hdr"], timeout=15)
            assert rp.status_code == 200
            assert any(c["id"] == comp_id for c in rp.json()["completions"])

            # Parent votes approve
            rv = s.post(f"{API}/completions/{comp_id}/vote", json={"approved": True},
                        headers=parent_ctx["hdr"], timeout=15)
            assert rv.status_code == 200
            assert rv.json()["resolved"] is True

            # today_status now approved
            tlist2 = s.get(f"{API}/tasks", headers=kid_ctx["hdr"], timeout=15).json()["tasks"]
            tt2 = next(t for t in tlist2 if t["id"] == tid)
            assert tt2["today_status"] == "approved"
            assert tt2["today_completion_id"] == comp_id
        finally:
            s.delete(f"{API}/tasks/{tid}", headers=parent_ctx["hdr_pin"], timeout=15)
