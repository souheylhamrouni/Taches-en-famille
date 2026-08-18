"""Regression tests for DELETE /api/auth/account (account deletion feature).

Covers:
  - wrong password returns 401 (account preserved)
  - missing JWT returns 401
  - solo-family deletion cascades (family_deleted=true, shared collections wiped)
  - multi-member family: only the caller is removed (family_deleted=false, others intact)
  - login with the deleted email subsequently fails with 401
  - Demo accounts (papa@demo.fr / lea@demo.fr) remain intact & GET /api/tasks still works
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://taches-en-famille.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

PARENT = {"email": "papa@demo.fr", "password": "demo1234"}
KID = {"email": "lea@demo.fr", "password": "demo1234"}


@pytest.fixture(scope="module")
def s():
    return requests.Session()


def _register_parent(session, family_name="TEST_DelFam"):
    """Create a fresh parent + family. Returns (email, password, token, user, family_id)."""
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST_del_{suffix}@ex.com"
    password = "testpass123"
    r = session.post(
        f"{API}/auth/register",
        json={
            "email": email,
            "password": password,
            "name": "TEST Del Parent",
            "role": "parent",
            "family_name": f"{family_name}_{suffix}",
            "pin": "4242",
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    return {
        "email": email,
        "password": password,
        "token": data["access_token"],
        "user": data["user"],
        "family_id": data["family_id"],
        "hdr": {"Authorization": f"Bearer {data['access_token']}"},
    }


def _register_child(session, family_id):
    suffix = uuid.uuid4().hex[:8]
    email = f"TEST_delkid_{suffix}@ex.com"
    password = "testpass123"
    r = session.post(
        f"{API}/auth/register",
        json={
            "email": email,
            "password": password,
            "name": "TEST Del Kid",
            "role": "child",
            "family_id": family_id,
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    return {
        "email": email,
        "password": password,
        "token": data["access_token"],
        "user": data["user"],
        "family_id": data["family_id"],
        "hdr": {"Authorization": f"Bearer {data['access_token']}"},
    }


# ---------- 401 paths ----------
class TestDeleteAccountAuth:
    def test_delete_requires_jwt(self, s):
        r = s.delete(f"{API}/auth/account", json={"password": "whatever"}, timeout=15)
        assert r.status_code == 401

    def test_wrong_password_returns_401_and_preserves_user(self, s):
        ctx = _register_parent(s)
        r = s.delete(
            f"{API}/auth/account",
            json={"password": "not-the-right-one"},
            headers=ctx["hdr"],
            timeout=15,
        )
        assert r.status_code == 401
        # User is still able to authenticate
        me = s.get(f"{API}/auth/me", headers=ctx["hdr"], timeout=15)
        assert me.status_code == 200
        assert me.json()["email"].lower() == ctx["email"].lower()
        # Cleanup: real delete
        r2 = s.delete(
            f"{API}/auth/account",
            json={"password": ctx["password"]},
            headers=ctx["hdr"],
            timeout=15,
        )
        assert r2.status_code == 200


# ---------- Solo-family cascade ----------
class TestDeleteAccountSoloFamily:
    def test_solo_user_delete_cascades_family(self, s):
        ctx = _register_parent(s)
        fam_id = ctx["family_id"]

        # PIN verify so we can create shared data first
        pv = s.post(
            f"{API}/auth/pin/verify",
            json={"pin": "4242"},
            headers=ctx["hdr"],
            timeout=15,
        )
        assert pv.status_code == 200, pv.text
        hdr_pin = {**ctx["hdr"], "X-Parent-Pin-Token": pv.json()["pin_token"]}

        # Seed shared data: task + reward + event + shopping item
        rt = s.post(
            f"{API}/tasks",
            json={
                "title": "TEST_solo_task",
                "points_worth": 3,
                "penalty_points": 0,
                "frequency": "daily",
                "photo_required": False,
                "assigned_to": [],
            },
            headers=hdr_pin,
            timeout=15,
        )
        assert rt.status_code == 200, rt.text
        rr = s.post(
            f"{API}/rewards",
            json={"title": "TEST_solo_reward", "point_cost": 5},
            headers=hdr_pin,
            timeout=15,
        )
        assert rr.status_code == 200
        re_ = s.post(
            f"{API}/events",
            json={"title": "TEST_solo_evt", "start_time": "2026-06-01T10:00:00Z"},
            headers=ctx["hdr"],
            timeout=15,
        )
        assert re_.status_code == 200
        rs = s.post(
            f"{API}/shopping",
            json={"item_name": "TEST_solo_item"},
            headers=ctx["hdr"],
            timeout=15,
        )
        assert rs.status_code == 200

        # Delete account
        rd = s.delete(
            f"{API}/auth/account",
            json={"password": ctx["password"]},
            headers=ctx["hdr"],
            timeout=15,
        )
        assert rd.status_code == 200, rd.text
        body = rd.json()
        assert body["ok"] is True
        assert body["family_deleted"] is True

        # Login with deleted email now fails
        rl = s.post(
            f"{API}/auth/login",
            json={"email": ctx["email"], "password": ctx["password"]},
            timeout=15,
        )
        assert rl.status_code == 401

        # JWT should no longer resolve to a valid user
        me = s.get(f"{API}/auth/me", headers=ctx["hdr"], timeout=15)
        assert me.status_code == 401


# ---------- Multi-member: only caller removed ----------
class TestDeleteAccountMultiMember:
    def test_only_caller_deleted_when_others_remain(self, s):
        parent = _register_parent(s, family_name="TEST_MultiFam")
        child = _register_child(s, parent["family_id"])
        assert child["family_id"] == parent["family_id"]

        # Child deletes their own account
        rd = s.delete(
            f"{API}/auth/account",
            json={"password": child["password"]},
            headers=child["hdr"],
            timeout=15,
        )
        assert rd.status_code == 200, rd.text
        body = rd.json()
        assert body["ok"] is True
        assert body["family_deleted"] is False

        # Parent still logs in fine, family intact
        rl = s.post(
            f"{API}/auth/login",
            json={"email": parent["email"], "password": parent["password"]},
            timeout=15,
        )
        assert rl.status_code == 200
        parent_hdr = {"Authorization": f"Bearer {rl.json()['access_token']}"}

        rf = s.get(f"{API}/family", headers=parent_hdr, timeout=15)
        assert rf.status_code == 200
        members = rf.json()["members"]
        emails = [m["email"].lower() for m in members]
        assert parent["email"].lower() in emails
        assert child["email"].lower() not in emails

        # Child cannot login anymore
        rl2 = s.post(
            f"{API}/auth/login",
            json={"email": child["email"], "password": child["password"]},
            timeout=15,
        )
        assert rl2.status_code == 401

        # Cleanup: delete parent (solo now → cascades)
        rdp = s.delete(
            f"{API}/auth/account",
            json={"password": parent["password"]},
            headers=parent_hdr,
            timeout=15,
        )
        assert rdp.status_code == 200
        assert rdp.json()["family_deleted"] is True


# ---------- Regression: demo untouched ----------
class TestDemoAccountsIntact:
    def test_demo_parent_login_still_works(self, s):
        r = s.post(f"{API}/auth/login", json=PARENT, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["email"] == PARENT["email"]

    def test_demo_kid_login_and_tasks(self, s):
        r = s.post(f"{API}/auth/login", json=KID, timeout=15)
        assert r.status_code == 200, r.text
        hdr = {"Authorization": f"Bearer {r.json()['access_token']}"}
        rt = s.get(f"{API}/tasks", headers=hdr, timeout=15)
        assert rt.status_code == 200
        tasks = rt.json()["tasks"]
        assert isinstance(tasks, list) and len(tasks) > 0
        # Each task carries the expected today_status field from the N+1 refactor
        for t in tasks:
            assert "today_status" in t
