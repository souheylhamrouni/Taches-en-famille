"""Tests for parent participation, leaderboard, kid access, multi-day events."""
import os
import requests
from datetime import datetime, timedelta, timezone

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")
if not BASE:
    BASE = "https://taches-en-famille.preview.emergentagent.com"
API = f"{BASE}/api"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    return r.json()


def _pin(token, pin="123456"):
    r = requests.post(f"{API}/auth/pin/verify", json={"pin": pin},
                      headers={"Authorization": f"Bearer {token}"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["pin_token"]


# -------- Parent login + PIN --------
def test_parent_login_and_pin():
    d = _login("papa@demo.fr", "demo1234")
    assert d["user"]["role"] == "parent"
    pt = _pin(d["access_token"])
    assert isinstance(pt, str) and len(pt) > 10


# -------- Parent participation: create task assigned to parent, complete, verify points --------
def test_parent_task_participation_and_leaderboard():
    d = _login("papa@demo.fr", "demo1234")
    tok = d["access_token"]
    pt = _pin(tok)
    parent_id = d["user"]["id"]
    starting_pts = d["user"]["points"]

    # Assignee list must include parent (via /family members)
    fam = requests.get(f"{API}/family", headers={"Authorization": f"Bearer {tok}"}, timeout=30).json()
    member_ids = [m["id"] for m in fam["members"]]
    assert parent_id in member_ids
    parent_roles = [m["role"] for m in fam["members"] if m["id"] == parent_id]
    assert parent_roles == ["parent"]

    # Create task assigned to parent, no photo required
    payload = {
        "title": "TEST_ParentChore", "points_worth": 25, "penalty_points": 0,
        "frequency": "once", "photo_required": False, "assigned_to": [parent_id],
    }
    r = requests.post(f"{API}/tasks", json=payload,
                      headers={"Authorization": f"Bearer {tok}", "X-Parent-Pin-Token": pt}, timeout=30)
    assert r.status_code == 200, r.text
    task_id = r.json()["id"]

    # Complete as parent (no photo, no PIN required)
    r = requests.post(f"{API}/tasks/{task_id}/complete",
                      headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "approved"

    # Verify /auth/me points increased
    me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=30).json()
    assert me["points"] >= starting_pts + 25, f"expected +25, got {me['points']} from {starting_pts}"

    # Leaderboard contains parent
    lb = requests.get(f"{API}/family/leaderboard",
                      headers={"Authorization": f"Bearer {tok}"}, timeout=30).json()
    members = lb["members"]
    ids = [m["id"] for m in members]
    assert parent_id in ids, "parent missing from leaderboard"
    # sorted desc by points
    pts_list = [m.get("points", 0) for m in members]
    assert pts_list == sorted(pts_list, reverse=True)

    # cleanup: delete the task (soft delete)
    requests.delete(f"{API}/tasks/{task_id}",
                    headers={"Authorization": f"Bearer {tok}", "X-Parent-Pin-Token": pt}, timeout=30)


# -------- Parent claim reward --------
def test_parent_claim_reward():
    d = _login("papa@demo.fr", "demo1234")
    tok = d["access_token"]
    pt = _pin(tok)

    # Ensure a cheap reward exists (create one with cost 1)
    r = requests.post(f"{API}/rewards",
                      json={"title": "TEST_Cheap", "point_cost": 1, "icon": "🎁"},
                      headers={"Authorization": f"Bearer {tok}", "X-Parent-Pin-Token": pt}, timeout=30)
    assert r.status_code == 200, r.text
    rid = r.json()["id"]

    me1 = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=30).json()
    if me1["points"] < 1:
        # Ensure parent has enough points via a quick auto-approve task
        p = requests.post(f"{API}/tasks",
                          json={"title": "TEST_pointsboost", "points_worth": 5, "penalty_points": 0,
                                "frequency": "once", "photo_required": False, "assigned_to": [d["user"]["id"]]},
                          headers={"Authorization": f"Bearer {tok}", "X-Parent-Pin-Token": pt}, timeout=30).json()
        requests.post(f"{API}/tasks/{p['id']}/complete", headers={"Authorization": f"Bearer {tok}"}, timeout=30)

    r = requests.post(f"{API}/rewards/{rid}/claim",
                     headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["reward_title"] == "TEST_Cheap"

    # cleanup reward
    requests.delete(f"{API}/rewards/{rid}",
                    headers={"Authorization": f"Bearer {tok}", "X-Parent-Pin-Token": pt}, timeout=30)


# -------- Child can list events AND create --------
def test_child_can_read_and_create_events():
    dc = _login("lea@demo.fr", "demo1234")
    tokc = dc["access_token"]

    # Read events (should have some seeded events)
    r = requests.get(f"{API}/events", headers={"Authorization": f"Bearer {tokc}"}, timeout=30).json()
    assert "events" in r

    # Create an event as child
    start = (datetime.now(timezone.utc) + timedelta(days=10)).isoformat()
    r = requests.post(f"{API}/events",
                      json={"title": "TEST_KidEvent", "start_time": start},
                      headers={"Authorization": f"Bearer {tokc}"}, timeout=30)
    assert r.status_code == 200, r.text
    eid = r.json()["id"]

    # cleanup
    requests.delete(f"{API}/events/{eid}", headers={"Authorization": f"Bearer {tokc}"}, timeout=30)


# -------- Child can add shopping --------
def test_child_can_add_shopping():
    dc = _login("lea@demo.fr", "demo1234")
    tokc = dc["access_token"]
    r = requests.post(f"{API}/shopping", json={"item_name": "TEST_Chocolat"},
                      headers={"Authorization": f"Bearer {tokc}"}, timeout=30)
    assert r.status_code == 200, r.text
    iid = r.json()["id"]

    # toggle
    r = requests.patch(f"{API}/shopping/{iid}",
                       headers={"Authorization": f"Bearer {tokc}"}, timeout=30)
    assert r.status_code == 200

    # cleanup
    requests.delete(f"{API}/shopping/{iid}", headers={"Authorization": f"Bearer {tokc}"}, timeout=30)


# -------- Multi-day event round-trips with end_time (frontend renders dots per day) --------
def test_multiday_event_persists_end_time():
    d = _login("papa@demo.fr", "demo1234")
    tok = d["access_token"]
    start = "2026-08-22T09:00:00+00:00"
    end = "2026-08-25T18:00:00+00:00"
    r = requests.post(f"{API}/events",
                      json={"title": "TEST_Vacances", "start_time": start, "end_time": end,
                            "color": "#1CB0F6", "recurrence": "none"},
                      headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    assert r.status_code == 200, r.text
    eid = r.json()["id"]
    assert r.json()["end_time"] == end
    assert r.json()["recurrence"] == "none"

    all_events = requests.get(f"{API}/events",
                              headers={"Authorization": f"Bearer {tok}"}, timeout=30).json()["events"]
    match = [e for e in all_events if e["id"] == eid]
    assert match and match[0]["end_time"] == end

    requests.delete(f"{API}/events/{eid}", headers={"Authorization": f"Bearer {tok}"}, timeout=30)


# -------- Child assignment regression --------
def test_child_task_assignment_still_works():
    d = _login("papa@demo.fr", "demo1234")
    tok = d["access_token"]
    pt = _pin(tok)
    dc = _login("lea@demo.fr", "demo1234")
    child_id = dc["user"]["id"]

    r = requests.post(f"{API}/tasks",
                      json={"title": "TEST_ChildOnly", "points_worth": 10, "penalty_points": 0,
                            "frequency": "once", "photo_required": False, "assigned_to": [child_id]},
                      headers={"Authorization": f"Bearer {tok}", "X-Parent-Pin-Token": pt}, timeout=30)
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    assert r.json()["assigned_to"] == [child_id]

    requests.delete(f"{API}/tasks/{tid}",
                    headers={"Authorization": f"Bearer {tok}", "X-Parent-Pin-Token": pt}, timeout=30)
