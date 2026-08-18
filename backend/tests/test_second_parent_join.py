"""Iteration 7 — Second-parent join family flow + regressions."""
import os
import time
import uuid
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://taches-en-famille.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _email(prefix: str) -> str:
    return f"TEST_{prefix}_{uuid.uuid4().hex[:8]}@example.com"


# --- Auth: new-family parent path still works ---
def test_register_parent_new_family_creates_family():
    email = _email("p1new")
    r = requests.post(f"{API}/auth/register", json={
        "email": email, "password": "pass1234", "name": "Papa1",
        "role": "parent", "family_name": "TEST Famille A", "pin": "1234",
    })
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token" in data
    assert data["user"]["role"] == "parent"
    assert data["user"]["family_id"] == data["family_id"]
    # Verify GET /api/family shows exactly one member (this parent)
    fam = requests.get(f"{API}/family", headers={"Authorization": f"Bearer {data['access_token']}"})
    assert fam.status_code == 200
    fam_json = fam.json()
    assert fam_json["family"]["id"] == data["family_id"]
    assert len(fam_json["members"]) == 1


# --- Auth: second parent joining an existing family ---
def test_second_parent_join_full_flow():
    # 1) First parent creates family
    p1_email = _email("p1")
    r1 = requests.post(f"{API}/auth/register", json={
        "email": p1_email, "password": "pass1234", "name": "Papa",
        "role": "parent", "family_name": "TEST Famille Join", "pin": "1234",
    })
    assert r1.status_code == 200, r1.text
    fam_id = r1.json()["family_id"]

    # 2) Second parent joins that family with their own PIN 2222
    p2_email = _email("p2")
    r2 = requests.post(f"{API}/auth/register", json={
        "email": p2_email, "password": "pass1234", "name": "Maman",
        "role": "parent", "family_id": fam_id, "pin": "2222",
    })
    assert r2.status_code == 200, r2.text
    d2 = r2.json()
    assert d2["user"]["role"] == "parent"
    # (a) same family
    assert d2["user"]["family_id"] == fam_id
    p2_token = d2["access_token"]

    # (b) Verify own PIN 2222
    pin_ok = requests.post(f"{API}/auth/pin/verify", json={"pin": "2222"},
                           headers={"Authorization": f"Bearer {p2_token}"})
    assert pin_ok.status_code == 200, pin_ok.text
    p2_pin_token = pin_ok.json()["pin_token"]
    assert p2_pin_token

    # Wrong PIN 1111 should be rejected for parent 2
    pin_bad = requests.post(f"{API}/auth/pin/verify", json={"pin": "1111"},
                            headers={"Authorization": f"Bearer {p2_token}"})
    assert pin_bad.status_code == 401

    # (c) Parent-only action: create a task with pin_token
    task_res = requests.post(f"{API}/tasks", json={
        "title": "TEST Ranger sac", "description": "", "points_worth": 10,
        "penalty_points": 5, "frequency": "daily", "assigned_to": [],
        "photo_required": False, "due_time": "19:00",
    }, headers={
        "Authorization": f"Bearer {p2_token}",
        "X-Parent-Pin-Token": p2_pin_token,
    })
    assert task_res.status_code == 200, task_res.text
    task = task_res.json()
    assert task["title"] == "TEST Ranger sac"
    assert task["family_id"] == fam_id
    assert task["created_by"] == d2["user"]["id"]

    # (d) GET /api/family lists both parents
    fam = requests.get(f"{API}/family", headers={"Authorization": f"Bearer {p2_token}"})
    assert fam.status_code == 200
    members = fam.json()["members"]
    parents = [m for m in members if m["role"] == "parent"]
    emails = {m["email"] for m in parents}
    # backend lowercases emails
    assert p1_email.lower() in emails
    assert p2_email.lower() in emails
    assert len(parents) >= 2


# --- Negative: register parent join with nonexistent family_id ---
def test_join_nonexistent_family_returns_404():
    r = requests.post(f"{API}/auth/register", json={
        "email": _email("orphan"), "password": "pass1234", "name": "Orphelin",
        "role": "parent", "family_id": "does-not-exist-xyz", "pin": "1234",
    })
    assert r.status_code == 404
    assert "introuvable" in r.text.lower()


# --- Negative: register parent without pin returns 400 ---
def test_parent_register_without_pin_returns_400():
    r = requests.post(f"{API}/auth/register", json={
        "email": _email("nopin"), "password": "pass1234", "name": "SansPIN",
        "role": "parent", "family_name": "TEST NoPin Fam",
    })
    assert r.status_code == 400


# --- Regression: child registration still requires family_id ---
def test_child_registration_requires_valid_family():
    # First create a valid family via a parent
    p_email = _email("cp")
    rp = requests.post(f"{API}/auth/register", json={
        "email": p_email, "password": "pass1234", "name": "ParentC",
        "role": "parent", "family_name": "TEST Fam Child", "pin": "1234",
    })
    assert rp.status_code == 200
    fam_id = rp.json()["family_id"]

    # Child with valid family_id → 200
    rc = requests.post(f"{API}/auth/register", json={
        "email": _email("child"), "password": "pass1234", "name": "Enfant",
        "role": "child", "family_id": fam_id,
    })
    assert rc.status_code == 200, rc.text
    assert rc.json()["user"]["role"] == "child"
    assert rc.json()["user"]["family_id"] == fam_id

    # Child with bogus family_id → 404
    rc2 = requests.post(f"{API}/auth/register", json={
        "email": _email("child2"), "password": "pass1234", "name": "Enfant2",
        "role": "child", "family_id": "bogus-fam-id",
    })
    assert rc2.status_code == 404


# --- Regression: demo logins still work ---
def test_demo_parent_login():
    r = requests.post(f"{API}/auth/login", json={"email": "papa@demo.fr", "password": "demo1234"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["user"]["email"] == "papa@demo.fr"
    assert d["user"]["role"] == "parent"
    # PIN 1234 works
    pin = requests.post(f"{API}/auth/pin/verify", json={"pin": "1234"},
                        headers={"Authorization": f"Bearer {d['access_token']}"})
    assert pin.status_code == 200


def test_demo_child_login():
    r = requests.post(f"{API}/auth/login", json={"email": "lea@demo.fr", "password": "demo1234"})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["role"] == "child"
