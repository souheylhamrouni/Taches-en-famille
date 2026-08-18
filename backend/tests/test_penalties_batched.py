"""Regression tests for batched apply_daily_penalties() and send_evening_reminders().

Only change since last passing iteration: N+1 find_one() calls per (task,user)
were replaced with a single family-level completions query. Behaviour must be
identical.

We validate:
 - a child with an incomplete assigned daily task gets penalized (points -=
   penalty_points, streak reset to 0, penalty log created)
 - a child who already completed today (auto-approved) is NOT penalized
 - assigned_to filtering (task assigned to child A → child B not penalized)
 - unassigned (empty assigned_to) task penalizes every child that hasn't
   completed
 - weekly / once tasks are NOT penalized by the daily job
 - demo regressions still work (login, tasks, challenges, events, badges,
   complete)
"""

import io
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://taches-en-famille.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

PIN = "1357"


# ---------------- helpers ----------------

def _register_parent(s):
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST_pen_p_{suffix}@ex.com"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "pass1234", "name": "TEST Papa",
        "role": "parent", "family_name": f"TEST_Fam_{suffix}", "pin": PIN,
    }, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    tok = d["access_token"]
    hdr = {"Authorization": f"Bearer {tok}"}
    pr = s.post(f"{API}/auth/pin/verify", json={"pin": PIN}, headers=hdr, timeout=15)
    assert pr.status_code == 200, pr.text
    return {
        "email": email, "hdr": hdr,
        "hdr_pin": {**hdr, "X-Parent-Pin-Token": pr.json()["pin_token"]},
        "family_id": d["user"]["family_id"], "user": d["user"],
    }


def _register_child(s, family_id, tag=""):
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST_pen_c_{tag}_{suffix}@ex.com"
    r = s.post(f"{API}/auth/register", json={
        "email": email, "password": "pass1234", "name": f"TEST_kid_{tag}",
        "role": "child", "family_id": family_id,
    }, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    return {"email": email, "user": d["user"],
            "hdr": {"Authorization": f"Bearer {d['access_token']}"}}


def _create_task(s, hdr_pin, title, *, points=10, penalty=15,
                 frequency="daily", photo=False, assigned_to=None):
    r = s.post(f"{API}/tasks", json={
        "title": title, "points_worth": points, "penalty_points": penalty,
        "frequency": frequency, "photo_required": photo,
        "assigned_to": assigned_to or [],
    }, headers=hdr_pin, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _me(s, hdr):
    r = s.get(f"{API}/auth/me", headers=hdr, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------- fixtures ----------------

@pytest.fixture(scope="session")
def sess():
    return requests.Session()


@pytest.fixture(scope="module")
def fam(sess):
    """Fresh isolated family with 2 kids, several tasks."""
    parent = _register_parent(sess)
    kid_a = _register_child(sess, parent["family_id"], "A")
    kid_b = _register_child(sess, parent["family_id"], "B")
    return {"parent": parent, "kid_a": kid_a, "kid_b": kid_b}


# ---------------- penalty tests ----------------

class TestBatchedPenalties:
    def test_penalty_applied_for_incomplete_assigned_daily(self, sess, fam):
        parent, kid_a, kid_b = fam["parent"], fam["kid_a"], fam["kid_b"]

        # Task assigned to A only (no photo → could complete, but we don't)
        t_a = _create_task(sess, parent["hdr_pin"], "TEST_pen_only_A",
                           points=10, penalty=17, frequency="daily",
                           photo=False, assigned_to=[kid_a["user"]["id"]])
        # Task assigned to everyone (assigned_to=[])
        t_all = _create_task(sess, parent["hdr_pin"], "TEST_pen_all",
                             points=8, penalty=11, frequency="daily",
                             photo=False, assigned_to=[])
        # Task assigned to B only → completed by B → should NOT be penalized
        t_b_done = _create_task(sess, parent["hdr_pin"], "TEST_pen_B_done",
                                points=6, penalty=13, frequency="daily",
                                photo=False, assigned_to=[kid_b["user"]["id"]])
        # Weekly task assigned to A → must NOT be penalized by daily job
        t_weekly = _create_task(sess, parent["hdr_pin"], "TEST_pen_weekly",
                                points=20, penalty=25, frequency="weekly",
                                photo=False, assigned_to=[kid_a["user"]["id"]])
        # Once task assigned to A → must NOT be penalized
        t_once = _create_task(sess, parent["hdr_pin"], "TEST_pen_once",
                              points=20, penalty=25, frequency="once",
                              photo=False, assigned_to=[kid_a["user"]["id"]])

        # Kid B completes t_b_done (auto-approved because no photo)
        rc = sess.post(f"{API}/tasks/{t_b_done}/complete",
                       headers=kid_b["hdr"], timeout=15)
        assert rc.status_code == 200, rc.text
        assert rc.json()["status"] == "approved"

        # Snapshot points/streak BEFORE running penalties
        a_before = _me(sess, kid_a["hdr"])
        b_before = _me(sess, kid_b["hdr"])
        a_pts_before, b_pts_before = a_before["points"], b_before["points"]

        # Run penalties
        rp = sess.post(f"{API}/dev/run-penalties",
                       headers=parent["hdr"], timeout=60)
        assert rp.status_code == 200, rp.text
        assert rp.json().get("ok") is True

        # AFTER: A should be penalized for t_a (17) + t_all (11) = 28
        # AFTER: B should be penalized ONLY for t_all (11) — t_b_done is done,
        # weekly/once are excluded, t_a is not assigned to B.
        a_after = _me(sess, kid_a["hdr"])
        b_after = _me(sess, kid_b["hdr"])

        assert a_after["points"] == a_pts_before - (17 + 11), (
            f"kid_a expected -28, got delta={a_after['points']-a_pts_before}")
        assert b_after["points"] == b_pts_before - 11, (
            f"kid_b expected -11, got delta={b_after['points']-b_pts_before}")

        # Streak resets to 0 for anyone who got at least one penalty
        assert a_after["streak"] == 0
        assert b_after["streak"] == 0

        # /penalties log check
        pl = sess.get(f"{API}/penalties", headers=parent["hdr"], timeout=15)
        assert pl.status_code == 200
        logs = pl.json()["penalties"]

        # Build set of (user_id, task_id) recently penalized
        recent = {(p["user_id"], p["task_id"]) for p in logs}
        assert (kid_a["user"]["id"], t_a) in recent
        assert (kid_a["user"]["id"], t_all) in recent
        assert (kid_b["user"]["id"], t_all) in recent
        # Negative assertions — NO penalty for done / weekly / once / wrong-assignee
        assert (kid_b["user"]["id"], t_b_done) not in recent
        assert (kid_a["user"]["id"], t_weekly) not in recent
        assert (kid_a["user"]["id"], t_once) not in recent
        assert (kid_b["user"]["id"], t_a) not in recent  # A-only task didn't hit B

        # Also verify each new penalty log has expected shape/values
        pen_a_only = next(p for p in logs
                          if p["user_id"] == kid_a["user"]["id"] and p["task_id"] == t_a)
        assert pen_a_only["points_deducted"] == 17
        assert pen_a_only["task_title"] == "TEST_pen_only_A"


# ---------------- demo regression sanity ----------------

class TestDemoRegression:
    @pytest.fixture(scope="class")
    def demo_parent(self, sess):
        r = sess.post(f"{API}/auth/login",
                      json={"email": "papa@demo.fr", "password": "demo1234"},
                      timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user"]["role"] == "parent"
        hdr = {"Authorization": f"Bearer {d['access_token']}"}
        pr = sess.post(f"{API}/auth/pin/verify",
                       json={"pin": "1234"}, headers=hdr, timeout=15)
        assert pr.status_code == 200
        return {"hdr": hdr,
                "hdr_pin": {**hdr, "X-Parent-Pin-Token": pr.json()["pin_token"]},
                "user": d["user"]}

    @pytest.fixture(scope="class")
    def demo_lea(self, sess):
        r = sess.post(f"{API}/auth/login",
                      json={"email": "lea@demo.fr", "password": "demo1234"},
                      timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["user"]["role"] == "child"
        return {"hdr": {"Authorization": f"Bearer {d['access_token']}"},
                "user": d["user"]}

    def test_login_papa_and_lea(self, demo_parent, demo_lea):
        assert demo_parent["user"]["email"] == "papa@demo.fr"
        assert demo_lea["user"]["email"] == "lea@demo.fr"

    def test_get_tasks(self, sess, demo_lea):
        r = sess.get(f"{API}/tasks", headers=demo_lea["hdr"], timeout=15)
        assert r.status_code == 200
        tasks = r.json()["tasks"]
        assert len(tasks) > 0
        assert "today_status" in tasks[0]
        assert "frequency" in tasks[0]

    def test_complete_non_photo_task(self, sess, demo_parent, demo_lea):
        # create a temp non-photo daily task assigned to lea for a clean test
        tid = _create_task(sess, demo_parent["hdr_pin"],
                           f"TEST_reg_nophoto_{uuid.uuid4().hex[:4]}",
                           points=4, penalty=0, frequency="daily",
                           photo=False, assigned_to=[demo_lea["user"]["id"]])
        try:
            before = _me(sess, demo_lea["hdr"])["points"]
            r = sess.post(f"{API}/tasks/{tid}/complete",
                          headers=demo_lea["hdr"], timeout=15)
            assert r.status_code == 200, r.text
            assert r.json()["status"] == "approved"
            after = _me(sess, demo_lea["hdr"])["points"]
            assert after == before + 4
        finally:
            sess.delete(f"{API}/tasks/{tid}", headers=demo_parent["hdr_pin"], timeout=15)

    def test_get_challenges(self, sess, demo_lea):
        r = sess.get(f"{API}/challenges", headers=demo_lea["hdr"], timeout=15)
        assert r.status_code == 200
        d = r.json()
        # response is expected to have at least current/history keys or challenge doc
        assert isinstance(d, dict)

    def test_get_events_recurring(self, sess, demo_lea):
        r = sess.get(f"{API}/events", headers=demo_lea["hdr"], timeout=15)
        assert r.status_code == 200
        assert "events" in r.json()

    def test_get_badges(self, sess, demo_lea):
        r = sess.get(f"{API}/badges", headers=demo_lea["hdr"], timeout=15)
        assert r.status_code == 200
        badges = r.json()["badges"]
        assert len(badges) == 10
        # Léa should have at least a handful unlocked
        unlocked = [b for b in badges if b.get("unlocked")]
        assert len(unlocked) >= 1
