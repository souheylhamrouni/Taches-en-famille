"""Tests for the NEW badges feature (GET /api/badges + task-completion unlocks)."""
import io
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://taches-en-famille.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

EXPECTED_LEA_UNLOCKED = {"first_quest", "getting_started", "task_machine", "streak_3", "earn_100", "earn_500"}


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _pin_hdr(tok, pin="123456"):
    r = requests.post(f"{API}/auth/pin/verify", json={"pin": pin}, headers=_hdr(tok), timeout=15)
    assert r.status_code == 200, r.text
    return {**_hdr(tok), "X-Parent-Pin-Token": r.json()["pin_token"]}


# ----- GET /api/badges -----
class TestBadgesEndpoint:
    def test_lea_has_6_of_10_expected_badges(self):
        d = _login("lea@demo.fr", "demo1234")
        tok = d["access_token"]
        r = requests.get(f"{API}/badges", headers=_hdr(tok), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["total"] == 10
        assert body["unlocked_count"] == 6, body
        ids = {b["id"] for b in body["badges"] if b["unlocked"]}
        assert ids == EXPECTED_LEA_UNLOCKED, ids
        # shape check
        first = body["badges"][0]
        for k in ("id", "title", "emoji", "description", "type", "threshold",
                  "unlocked", "current", "progress"):
            assert k in first, f"missing key {k}"

    def test_badges_endpoint_shape_for_any_user(self):
        d = _login("hugo@demo.fr", "demo1234")
        r = requests.get(f"{API}/badges", headers=_hdr(d["access_token"]), timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 10
        assert 0 <= body["unlocked_count"] <= 10
        for b in body["badges"]:
            assert isinstance(b["progress"], (int, float))
            assert 0 <= b["progress"] <= 1


# ----- Fresh child unlock flow -----
@pytest.fixture(scope="module")
def fresh_family():
    """Register a brand-new parent + child, return {parent, child, family_id}."""
    suffix = uuid.uuid4().hex[:8]
    p_email = f"TEST_badge_p_{suffix}@ex.com"
    c_email = f"TEST_badge_c_{suffix}@ex.com"
    rp = requests.post(f"{API}/auth/register", json={
        "email": p_email, "password": "pass1234", "name": "TEST P",
        "role": "parent", "family_name": "TEST_BadgeFam", "pin": "123456",
    }, timeout=15)
    assert rp.status_code == 200, rp.text
    parent = rp.json()
    fam_id = parent["family_id"]

    rc = requests.post(f"{API}/auth/register", json={
        "email": c_email, "password": "pass1234", "name": "TEST C",
        "role": "child", "family_id": fam_id,
    }, timeout=15)
    assert rc.status_code == 200, rc.text
    child = rc.json()

    yield {"parent": parent, "child": child, "family_id": fam_id,
           "p_email": p_email, "c_email": c_email}


class TestFreshChildBadgeUnlock:
    def test_zero_state(self, fresh_family):
        child_tok = fresh_family["child"]["access_token"]
        me = requests.get(f"{API}/auth/me", headers=_hdr(child_tok), timeout=15).json()
        assert me.get("tasks_completed", 0) == 0
        assert me.get("total_earned", 0) == 0
        r = requests.get(f"{API}/badges", headers=_hdr(child_tok), timeout=15).json()
        assert r["unlocked_count"] == 0

    def test_non_photo_completion_unlocks_first_quest_and_returns_new_badges(self, fresh_family):
        p_tok = fresh_family["parent"]["access_token"]
        c_tok = fresh_family["child"]["access_token"]
        child_id = fresh_family["child"]["user"]["id"]
        p_hdr = _pin_hdr(p_tok, "123456")

        # Parent creates a non-photo task assigned to child
        rt = requests.post(f"{API}/tasks", json={
            "title": f"TEST_zero_{uuid.uuid4().hex[:4]}",
            "points_worth": 8, "penalty_points": 0,
            "frequency": "daily", "photo_required": False,
            "assigned_to": [child_id],
        }, headers=p_hdr, timeout=15)
        assert rt.status_code == 200, rt.text
        tid = rt.json()["id"]

        # Child completes it
        rc = requests.post(f"{API}/tasks/{tid}/complete", headers=_hdr(c_tok), timeout=15)
        assert rc.status_code == 200, rc.text
        body = rc.json()
        assert body["status"] == "approved"
        assert "new_badges" in body, body
        ids = [b["id"] for b in body["new_badges"]]
        assert "first_quest" in ids, f"expected first_quest in new_badges, got {ids}"

        # Stats updated
        me = requests.get(f"{API}/auth/me", headers=_hdr(c_tok), timeout=15).json()
        assert me["tasks_completed"] == 1
        assert me["total_earned"] == 8
        assert me["points"] == 8

        # Badges endpoint reflects unlock
        rb = requests.get(f"{API}/badges", headers=_hdr(c_tok), timeout=15).json()
        assert rb["unlocked_count"] >= 1
        first_q = next(b for b in rb["badges"] if b["id"] == "first_quest")
        assert first_q["unlocked"] is True
        assert first_q["current"] >= 1

    def test_photo_task_completion_returns_empty_new_badges_and_pending_status(self, fresh_family):
        p_tok = fresh_family["parent"]["access_token"]
        c_tok = fresh_family["child"]["access_token"]
        child_id = fresh_family["child"]["user"]["id"]
        p_hdr = _pin_hdr(p_tok, "123456")

        rt = requests.post(f"{API}/tasks", json={
            "title": f"TEST_photo_{uuid.uuid4().hex[:4]}",
            "points_worth": 6, "penalty_points": 0,
            "frequency": "daily", "photo_required": True,
            "assigned_to": [child_id],
        }, headers=p_hdr, timeout=15)
        assert rt.status_code == 200, rt.text
        tid = rt.json()["id"]

        png = bytes.fromhex(
            "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4"
            "890000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
        )
        files = {"photo": ("t.png", io.BytesIO(png), "image/png")}
        rc = requests.post(f"{API}/tasks/{tid}/complete", headers=_hdr(c_tok), files=files, timeout=60)
        assert rc.status_code == 200, rc.text
        body = rc.json()
        assert body["status"] == "pending"
        assert body.get("new_badges") == [], f"expected empty new_badges, got {body.get('new_badges')}"


# ----- Vote-approval unlock persistence -----
class TestVoteApprovalUnlocksBadges:
    def test_parent_approves_child_photo_awards_and_unlocks(self):
        # Fresh parent+child so we deterministically unlock "first_quest" via photo path
        suffix = uuid.uuid4().hex[:8]
        p_email = f"TEST_vote_p_{suffix}@ex.com"
        c_email = f"TEST_vote_c_{suffix}@ex.com"
        rp = requests.post(f"{API}/auth/register", json={
            "email": p_email, "password": "pass1234", "name": "TEST VP",
            "role": "parent", "family_name": "TEST_VoteFam", "pin": "123456",
        }, timeout=15)
        assert rp.status_code == 200, rp.text
        parent = rp.json()
        fam_id = parent["family_id"]
        rc = requests.post(f"{API}/auth/register", json={
            "email": c_email, "password": "pass1234", "name": "TEST VC",
            "role": "child", "family_id": fam_id,
        }, timeout=15)
        assert rc.status_code == 200, rc.text
        child = rc.json()

        p_tok = parent["access_token"]
        c_tok = child["access_token"]
        child_id = child["user"]["id"]
        p_hdr = _pin_hdr(p_tok, "123456")

        # Create photo task
        rt = requests.post(f"{API}/tasks", json={
            "title": f"TEST_votePhoto_{uuid.uuid4().hex[:4]}",
            "points_worth": 9, "penalty_points": 0,
            "frequency": "daily", "photo_required": True,
            "assigned_to": [child_id],
        }, headers=p_hdr, timeout=15)
        assert rt.status_code == 200, rt.text
        tid = rt.json()["id"]

        # Child submits photo completion -> pending, no new_badges yet
        png = bytes.fromhex(
            "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4"
            "890000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
        )
        files = {"photo": ("t.png", io.BytesIO(png), "image/png")}
        rcomp = requests.post(f"{API}/tasks/{tid}/complete", headers=_hdr(c_tok), files=files, timeout=60)
        assert rcomp.status_code == 200
        comp = rcomp.json()
        assert comp["status"] == "pending"
        assert comp.get("new_badges") == []
        comp_id = comp["id"]

        # Kid has 0 badges at this point
        b_before = requests.get(f"{API}/badges", headers=_hdr(c_tok), timeout=15).json()
        assert b_before["unlocked_count"] == 0

        # Parent approves
        rv = requests.post(f"{API}/completions/{comp_id}/vote", json={"approved": True},
                           headers=_hdr(p_tok), timeout=15)
        assert rv.status_code == 200, rv.text
        assert rv.json().get("resolved") is True

        # Child's stats + badges updated
        me = requests.get(f"{API}/auth/me", headers=_hdr(c_tok), timeout=15).json()
        assert me["tasks_completed"] == 1
        assert me["total_earned"] == 9
        assert me["points"] == 9

        b_after = requests.get(f"{API}/badges", headers=_hdr(c_tok), timeout=15).json()
        assert b_after["unlocked_count"] >= 1
        first_q = next(b for b in b_after["badges"] if b["id"] == "first_quest")
        assert first_q["unlocked"] is True


# ----- Regression: demo logins & core endpoints still work -----
class TestRegression:
    def test_demo_parent_login(self):
        d = _login("papa@demo.fr", "demo1234")
        assert d["user"]["role"] == "parent"

    def test_demo_kid_login_and_tasks(self):
        d = _login("lea@demo.fr", "demo1234")
        tok = d["access_token"]
        r = requests.get(f"{API}/tasks", headers=_hdr(tok), timeout=15)
        assert r.status_code == 200
        assert len(r.json()["tasks"]) > 0

    def test_leaderboard_still_sorted(self):
        d = _login("lea@demo.fr", "demo1234")
        r = requests.get(f"{API}/family/leaderboard", headers=_hdr(d["access_token"]), timeout=15)
        assert r.status_code == 200
        pts = [m["points"] for m in r.json()["members"]]
        assert pts == sorted(pts, reverse=True)

    def test_delete_account_endpoint_exists(self):
        # register+delete a throwaway user to ensure DELETE /api/auth/account regression
        suffix = uuid.uuid4().hex[:8]
        email = f"TEST_reg_del_{suffix}@ex.com"
        rp = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "pass1234", "name": "TEST X",
            "role": "parent", "family_name": "TEST_R", "pin": "123456",
        }, timeout=15).json()
        tok = rp["access_token"]
        rd = requests.delete(f"{API}/auth/account", json={"password": "pass1234"},
                             headers=_hdr(tok), timeout=15)
        assert rd.status_code == 200, rd.text
        assert rd.json().get("ok") is True
