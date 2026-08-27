"""
Iteration 13 backend regression:
- Photos: token-based GET /api/photos/{path}
- Task edit: PATCH /api/tasks/{id}
- Challenge edit: PATCH /api/challenges/{id}
- Account: PATCH /auth/profile, PATCH /auth/password, PATCH /family
- Forgot password: POST /auth/forgot-password, POST /auth/reset-password
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://taches-en-famille.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

PARENT = {"email": "papa@demo.fr", "password": "demo1234"}
KID = {"email": "lea@demo.fr", "password": "demo1234"}
PIN = "1234"


@pytest.fixture(scope="module")
def parent_token():
    r = requests.post(f"{API}/auth/login", json=PARENT, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def kid_token():
    r = requests.post(f"{API}/auth/login", json=KID, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def parent_pin_token(parent_token):
    r = requests.post(f"{API}/auth/pin/verify", json={"pin": PIN},
                      headers={"Authorization": f"Bearer {parent_token}"}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["pin_token"]


def _headers(access, pin_token=None):
    h = {"Authorization": f"Bearer {access}"}
    if pin_token:
        h["X-Parent-Pin-Token"] = pin_token
    return h


# --- Profile / password / family ---
class TestAccountEndpoints:
    def test_profile_update_name(self, parent_token):
        r = requests.patch(f"{API}/auth/profile", json={"name": "Papa TEST"},
                           headers=_headers(parent_token), timeout=20)
        assert r.status_code == 200, r.text
        me = requests.get(f"{API}/auth/me", headers=_headers(parent_token), timeout=10).json()
        assert me["name"] == "Papa TEST"
        # revert
        requests.patch(f"{API}/auth/profile", json={"name": "Papa"},
                       headers=_headers(parent_token), timeout=20)

    def test_password_wrong_current(self, parent_token):
        r = requests.patch(f"{API}/auth/password",
                           json={"current_password": "WRONGPASS", "new_password": "demo1234"},
                           headers=_headers(parent_token), timeout=20)
        assert r.status_code == 401

    def test_password_correct(self, parent_token):
        # change and revert
        r = requests.patch(f"{API}/auth/password",
                           json={"current_password": "demo1234", "new_password": "demo12345"},
                           headers=_headers(parent_token), timeout=20)
        assert r.status_code == 200
        # confirm new works
        r2 = requests.post(f"{API}/auth/login",
                          json={"email": PARENT["email"], "password": "demo12345"}, timeout=20)
        assert r2.status_code == 200
        # revert
        tok2 = r2.json()["access_token"]
        r3 = requests.patch(f"{API}/auth/password",
                            json={"current_password": "demo12345", "new_password": "demo1234"},
                            headers=_headers(tok2), timeout=20)
        assert r3.status_code == 200

    def test_family_rename_parent(self, parent_token):
        r = requests.patch(f"{API}/family", json={"name": "TEST_Famille"},
                           headers=_headers(parent_token), timeout=20)
        assert r.status_code == 200
        fam = requests.get(f"{API}/family", headers=_headers(parent_token), timeout=10).json()
        assert fam["family"]["name"] == "TEST_Famille"
        requests.patch(f"{API}/family", json={"name": "Famille Dupont"},
                       headers=_headers(parent_token), timeout=20)

    def test_family_rename_forbidden_for_kid(self, kid_token):
        r = requests.patch(f"{API}/family", json={"name": "HACK"},
                           headers=_headers(kid_token), timeout=20)
        assert r.status_code == 403


# --- Forgot password ---
class TestForgotPassword:
    def test_forgot_always_ok(self):
        r = requests.post(f"{API}/auth/forgot-password",
                          json={"email": "nonexistent-test@example.com"}, timeout=20)
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_forgot_real_email_ok(self):
        r = requests.post(f"{API}/auth/forgot-password",
                          json={"email": PARENT["email"]}, timeout=30)
        assert r.status_code == 200

    def test_reset_password_invalid_code(self):
        r = requests.post(f"{API}/auth/reset-password",
                          json={"email": PARENT["email"], "code": "000000",
                                "new_password": "whatever9"}, timeout=20)
        assert r.status_code == 400


# --- Task edit ---
class TestTaskEdit:
    def test_edit_task_persists(self, parent_token, parent_pin_token):
        # pick first active task
        tasks = requests.get(f"{API}/tasks", headers=_headers(parent_token), timeout=10).json()["tasks"]
        active = [t for t in tasks if t.get("active", True)]
        assert active, "no active task found"
        t = active[0]
        new_title = "TEST_EditTitle"
        new_points = 77
        r = requests.patch(f"{API}/tasks/{t['id']}",
                           json={"title": new_title, "points_worth": new_points},
                           headers=_headers(parent_token, parent_pin_token), timeout=20)
        assert r.status_code == 200, r.text
        after = requests.get(f"{API}/tasks", headers=_headers(parent_token), timeout=10).json()["tasks"]
        row = next(x for x in after if x["id"] == t["id"])
        assert row["title"] == new_title
        assert row["points_worth"] == new_points
        # revert
        requests.patch(f"{API}/tasks/{t['id']}",
                       json={"title": t["title"], "points_worth": t["points_worth"]},
                       headers=_headers(parent_token, parent_pin_token), timeout=20)


# --- Challenge edit ---
class TestChallengeEdit:
    def test_edit_challenge_persists(self, parent_token, parent_pin_token):
        r = requests.get(f"{API}/challenges", headers=_headers(parent_token), timeout=10).json()
        ch = r.get("challenge")
        if not ch:
            # create one
            c = requests.post(f"{API}/challenges",
                              json={"title": "TEST_ChallengeSeed", "metric": "tasks",
                                    "target": 10, "bonus_points": 30},
                              headers=_headers(parent_token, parent_pin_token), timeout=20)
            assert c.status_code == 200, c.text
            ch = requests.get(f"{API}/challenges", headers=_headers(parent_token), timeout=10).json()["challenge"]
        cid = ch["id"]
        r = requests.patch(f"{API}/challenges/{cid}",
                           json={"title": "TEST_EditChallenge", "target": 42, "bonus_points": 99},
                           headers=_headers(parent_token, parent_pin_token), timeout=20)
        assert r.status_code == 200, r.text
        after = requests.get(f"{API}/challenges", headers=_headers(parent_token), timeout=10).json()["challenge"]
        assert after["title"] == "TEST_EditChallenge"
        assert after["target"] == 42
        assert after["bonus_points"] == 99


# --- Photos endpoint ---
class TestPhotoEndpoint:
    def test_photo_requires_token(self):
        # Random path should hit auth first
        r = requests.get(f"{API}/photos/somefake.jpg", timeout=10)
        assert r.status_code == 401

    def test_photo_traversal_rejected(self, parent_token):
        r = requests.get(f"{API}/photos/../secret",
                         params={"token": parent_token}, timeout=10)
        assert r.status_code in (404, 400)

    def test_photo_query_token_auth_shape(self, parent_token):
        # unknown path but auth-ok → 404 (not 401), proving ?token= works
        r = requests.get(f"{API}/photos/does-not-exist.jpg",
                         params={"token": parent_token}, timeout=10)
        assert r.status_code == 404
