"""Backend API tests for TâcheHéros."""
import io
import os
import time
import uuid
import pytest
import requests
 
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://taches-en-famille.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
 
PARENT = {"email": "papa@demo.fr", "password": "demo1234"}
KID = {"email": "lea@demo.fr", "password": "demo1234"}
PIN = "123456"
 
 
@pytest.fixture(scope="session")
def s():
    return requests.Session()
 
 
@pytest.fixture(scope="session")
def parent_ctx(s):
    r = s.post(f"{API}/auth/login", json=PARENT, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    token = d["access_token"]
    hdr = {"Authorization": f"Bearer {token}"}
    pr = s.post(f"{API}/auth/pin/verify", json={"pin": PIN}, headers=hdr, timeout=15)
    assert pr.status_code == 200, pr.text
    pin_tok = pr.json()["pin_token"]
    return {"token": token, "user": d["user"], "pin_token": pin_tok,
            "hdr": hdr, "hdr_pin": {**hdr, "X-Parent-Pin-Token": pin_tok}}
 
 
@pytest.fixture(scope="session")
def kid_ctx(s):
    r = s.post(f"{API}/auth/login", json=KID, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    return {"token": d["access_token"], "user": d["user"],
            "hdr": {"Authorization": f"Bearer {d['access_token']}"}}
 
 
# ----- Auth -----
class TestAuth:
    def test_login_parent(self, parent_ctx):
        assert parent_ctx["user"]["role"] == "parent"
        assert parent_ctx["user"]["email"] == "papa@demo.fr"
 
    def test_login_kid(self, kid_ctx):
        assert kid_ctx["user"]["role"] == "child"
 
    def test_login_wrong_password(self, s):
        r = s.post(f"{API}/auth/login", json={"email": "papa@demo.fr", "password": "wrong"}, timeout=15)
        assert r.status_code == 401
 
    def test_me(self, s, parent_ctx):
        r = s.get(f"{API}/auth/me", headers=parent_ctx["hdr"], timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == "papa@demo.fr"
 
    def test_me_unauth(self, s):
        r = s.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401
 
    def test_pin_wrong(self, s, parent_ctx):
        r = s.post(f"{API}/auth/pin/verify", json={"pin": "9999"}, headers=parent_ctx["hdr"], timeout=15)
        assert r.status_code == 401
 
    def test_pin_kid_forbidden(self, s, kid_ctx):
        r = s.post(f"{API}/auth/pin/verify", json={"pin": "123456"}, headers=kid_ctx["hdr"], timeout=15)
        assert r.status_code == 403
 
    def test_register_family_and_child(self, s):
        suffix = uuid.uuid4().hex[:6]
        parent_email = f"TEST_parent_{suffix}@ex.com"
        r = s.post(f"{API}/auth/register", json={
            "email": parent_email, "password": "pass1234", "name": "TEST P",
            "role": "parent", "family_name": "TEST_Fam", "pin": "5678"
        }, timeout=15)
        assert r.status_code == 200, r.text
        fam_id = r.json()["family_id"]
        # Duplicate
        r2 = s.post(f"{API}/auth/register", json={
            "email": parent_email, "password": "pass1234", "name": "x",
            "role": "parent", "pin": "5678"
        }, timeout=15)
        assert r2.status_code == 409
        # Child join
        child_email = f"TEST_child_{suffix}@ex.com"
        r3 = s.post(f"{API}/auth/register", json={
            "email": child_email, "password": "pass1234", "name": "TEST C",
            "role": "child", "family_id": fam_id
        }, timeout=15)
        assert r3.status_code == 200
        assert r3.json()["user"]["family_id"] == fam_id
 
 
# ----- Parent PIN gating -----
class TestPinGating:
    def test_create_task_without_pin(self, s, parent_ctx):
        r = s.post(f"{API}/tasks", json={"title": "no pin", "assigned_to": []},
                   headers=parent_ctx["hdr"], timeout=15)
        assert r.status_code == 403
 
    def test_create_reward_kid_forbidden(self, s, kid_ctx):
        r = s.post(f"{API}/rewards", json={"title": "x", "point_cost": 10},
                   headers=kid_ctx["hdr"], timeout=15)
        assert r.status_code == 403
 
 
# ----- Tasks -----
class TestTasks:
    def test_list_tasks(self, s, kid_ctx):
        r = s.get(f"{API}/tasks", headers=kid_ctx["hdr"], timeout=15)
        assert r.status_code == 200
        tasks = r.json()["tasks"]
        assert len(tasks) > 0
        assert "today_status" in tasks[0]
 
    def test_create_and_delete_task(self, s, parent_ctx):
        r = s.post(f"{API}/tasks", json={
            "title": "TEST_task", "points_worth": 5, "penalty_points": 5,
            "frequency": "daily", "photo_required": False, "assigned_to": []
        }, headers=parent_ctx["hdr_pin"], timeout=15)
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        # Verify persisted
        r2 = s.get(f"{API}/tasks", headers=parent_ctx["hdr"], timeout=15)
        assert any(t["id"] == tid for t in r2.json()["tasks"])
        # Delete (soft)
        r3 = s.delete(f"{API}/tasks/{tid}", headers=parent_ctx["hdr_pin"], timeout=15)
        assert r3.status_code == 200
 
 
# ----- Completions -----
class TestCompletions:
    def test_non_photo_auto_approve_and_duplicate(self, s, parent_ctx, kid_ctx):
        # Create no-photo task assigned to kid
        kid_id = kid_ctx["user"]["id"]
        r = s.post(f"{API}/tasks", json={
            "title": f"TEST_nophoto_{uuid.uuid4().hex[:4]}",
            "points_worth": 7, "penalty_points": 0,
            "frequency": "daily", "photo_required": False, "assigned_to": [kid_id]
        }, headers=parent_ctx["hdr_pin"], timeout=15)
        assert r.status_code == 200
        tid = r.json()["id"]
 
        me_before = s.get(f"{API}/auth/me", headers=kid_ctx["hdr"], timeout=15).json()
        pts_before = me_before.get("points", 0)
 
        r2 = s.post(f"{API}/tasks/{tid}/complete", headers=kid_ctx["hdr"], timeout=15)
        assert r2.status_code == 200, r2.text
        assert r2.json()["status"] == "approved"
 
        me_after = s.get(f"{API}/auth/me", headers=kid_ctx["hdr"], timeout=15).json()
        assert me_after["points"] == pts_before + 7
 
        # Duplicate
        r3 = s.post(f"{API}/tasks/{tid}/complete", headers=kid_ctx["hdr"], timeout=15)
        assert r3.status_code == 409
 
        # Cleanup
        s.delete(f"{API}/tasks/{tid}", headers=parent_ctx["hdr_pin"], timeout=15)
 
    def test_photo_pending_and_vote(self, s, parent_ctx, kid_ctx):
        kid_id = kid_ctx["user"]["id"]
        r = s.post(f"{API}/tasks", json={
            "title": f"TEST_photo_{uuid.uuid4().hex[:4]}",
            "points_worth": 11, "penalty_points": 0,
            "frequency": "daily", "photo_required": True, "assigned_to": [kid_id]
        }, headers=parent_ctx["hdr_pin"], timeout=15)
        assert r.status_code == 200
        tid = r.json()["id"]
 
        # PNG 1x1
        png = bytes.fromhex(
            "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4"
            "890000000A49444154789C6300010000000500010D0A2DB40000000049454E44AE426082"
        )
        files = {"photo": ("t.png", io.BytesIO(png), "image/png")}
        r2 = s.post(f"{API}/tasks/{tid}/complete", headers=kid_ctx["hdr"], files=files, timeout=60)
        assert r2.status_code == 200, r2.text
        comp = r2.json()
        assert comp["status"] == "pending"
        comp_id = comp["id"]
 
        # Can't vote on own
        rown = s.post(f"{API}/completions/{comp_id}/vote", json={"approved": True},
                      headers=kid_ctx["hdr"], timeout=15)
        assert rown.status_code == 400
 
        # Pending list
        rp = s.get(f"{API}/completions/pending", headers=parent_ctx["hdr"], timeout=15)
        assert rp.status_code == 200
        assert any(c["id"] == comp_id for c in rp.json()["completions"])
 
        # Parent approves
        me_before = s.get(f"{API}/auth/me", headers=kid_ctx["hdr"], timeout=15).json()
        pts_before = me_before["points"]
        rv = s.post(f"{API}/completions/{comp_id}/vote", json={"approved": True},
                    headers=parent_ctx["hdr"], timeout=15)
        assert rv.status_code == 200
        assert rv.json()["resolved"] is True
 
        me_after = s.get(f"{API}/auth/me", headers=kid_ctx["hdr"], timeout=15).json()
        assert me_after["points"] == pts_before + 11
 
        # Photo GET
        if comp.get("photo_path"):
            rph = s.get(f"{API}/photos/{comp['photo_path']}", headers=parent_ctx["hdr"], timeout=30)
            assert rph.status_code == 200
            assert len(rph.content) > 0
 
        # Cleanup
        s.delete(f"{API}/tasks/{tid}", headers=parent_ctx["hdr_pin"], timeout=15)
 
 
# ----- Rewards -----
class TestRewards:
    def test_list_rewards(self, s, kid_ctx):
        r = s.get(f"{API}/rewards", headers=kid_ctx["hdr"], timeout=15)
        assert r.status_code == 200
        assert len(r.json()["rewards"]) > 0
 
    def test_claim_insufficient(self, s, parent_ctx, kid_ctx):
        # create expensive reward
        r = s.post(f"{API}/rewards", json={"title": "TEST_expensive", "point_cost": 999999},
                   headers=parent_ctx["hdr_pin"], timeout=15)
        assert r.status_code == 200
        rid = r.json()["id"]
        rc = s.post(f"{API}/rewards/{rid}/claim", headers=kid_ctx["hdr"], timeout=15)
        assert rc.status_code == 400
        s.delete(f"{API}/rewards/{rid}", headers=parent_ctx["hdr_pin"], timeout=15)
 
    def test_claim_success(self, s, parent_ctx, kid_ctx):
        r = s.post(f"{API}/rewards", json={"title": "TEST_cheap", "point_cost": 1},
                   headers=parent_ctx["hdr_pin"], timeout=15)
        rid = r.json()["id"]
        me = s.get(f"{API}/auth/me", headers=kid_ctx["hdr"], timeout=15).json()
        pts_before = me["points"]
        rc = s.post(f"{API}/rewards/{rid}/claim", headers=kid_ctx["hdr"], timeout=15)
        assert rc.status_code == 200
        me2 = s.get(f"{API}/auth/me", headers=kid_ctx["hdr"], timeout=15).json()
        assert me2["points"] == pts_before - 1
        # Claims list
        cl = s.get(f"{API}/claims", headers=kid_ctx["hdr"], timeout=15)
        assert cl.status_code == 200
        assert any(c["reward_id"] == rid for c in cl.json()["claims"])
        s.delete(f"{API}/rewards/{rid}", headers=parent_ctx["hdr_pin"], timeout=15)
 
 
# ----- Family / Leaderboard -----
class TestFamily:
    def test_family(self, s, parent_ctx):
        r = s.get(f"{API}/family", headers=parent_ctx["hdr"], timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["family"] is not None
        assert len(d["members"]) >= 4
 
    def test_leaderboard_sorted(self, s, kid_ctx):
        r = s.get(f"{API}/family/leaderboard", headers=kid_ctx["hdr"], timeout=15)
        assert r.status_code == 200
        members = r.json()["members"]
        pts = [m["points"] for m in members]
        assert pts == sorted(pts, reverse=True)
 
 
# ----- Calendar / Shopping -----
class TestCalendar:
    def test_event_crud(self, s, kid_ctx):
        r = s.post(f"{API}/events", json={
            "title": "TEST_evt", "start_time": "2026-06-01T10:00:00Z"
        }, headers=kid_ctx["hdr"], timeout=15)
        assert r.status_code == 200
        eid = r.json()["id"]
        r2 = s.get(f"{API}/events", headers=kid_ctx["hdr"], timeout=15)
        assert any(e["id"] == eid for e in r2.json()["events"])
        r3 = s.delete(f"{API}/events/{eid}", headers=kid_ctx["hdr"], timeout=15)
        assert r3.status_code == 200
 
 
class TestShopping:
    def test_shopping_flow(self, s, kid_ctx):
        r = s.post(f"{API}/shopping", json={"item_name": "TEST_item"},
                   headers=kid_ctx["hdr"], timeout=15)
        assert r.status_code == 200
        iid = r.json()["id"]
        r2 = s.patch(f"{API}/shopping/{iid}", headers=kid_ctx["hdr"], timeout=15)
        assert r2.status_code == 200
        r3 = s.get(f"{API}/shopping", headers=kid_ctx["hdr"], timeout=15)
        it = next(x for x in r3.json()["items"] if x["id"] == iid)
        assert it["is_bought"] is True
        r4 = s.delete(f"{API}/shopping/{iid}", headers=kid_ctx["hdr"], timeout=15)
        assert r4.status_code == 200
 
 
# ----- Penalties -----
class TestPenalties:
    def test_penalties_list(self, s, kid_ctx):
        r = s.get(f"{API}/penalties", headers=kid_ctx["hdr"], timeout=15)
        assert r.status_code == 200
        assert "penalties" in r.json()
 
    def test_run_penalties(self, s, parent_ctx):
        r = s.post(f"{API}/dev/run-penalties", headers=parent_ctx["hdr_pin"], timeout=30)
        assert r.status_code == 200
 
 
# ----- Push -----
class TestPush:
    def test_register_push(self, s, kid_ctx):
        r = s.post(f"{API}/register-push", json={
            "user_id": kid_ctx["user"]["id"], "platform": "ios", "device_token": "TEST_token"
        }, headers=kid_ctx["hdr"], timeout=15)
        assert r.status_code == 201