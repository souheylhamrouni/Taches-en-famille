"""
Backend security-fix regression tests for TâcheHéros.
Covers SEC-001 (seed guard), SEC-002 (penalties scoping+idempotency),
SEC-003 (photo family scoping), SEC-004 (push auth), plus regression flows.
"""
import io
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_KEY = "a1c9d3b7f2e8a4c6b1d5e9f2a3c7b4d8e6f1a2c3b4d5e6f7a8b9c0d1e2f3a4b5"  # JWT_SECRET


def _uid():
    return uuid.uuid4().hex[:10]


def _post(path, **kw):
    return requests.post(f"{API}{path}", timeout=30, **kw)


def _get(path, **kw):
    return requests.get(f"{API}{path}", timeout=30, **kw)


def _register(role="parent", family_id=None, pin=None):
    email = f"TEST_{_uid()}@t.io"
    body = {
        "email": email, "password": "demo1234", "name": f"T {role}",
        "role": role,
    }
    if family_id:
        body["family_id"] = family_id
    if role == "parent":
        body["pin"] = pin or "123456"
    r = _post("/auth/register", json=body)
    assert r.status_code == 200, r.text
    d = r.json()
    return d["access_token"], d["user"], d["family_id"]


def _pin_token(access, pin="123456"):
    r = _post("/auth/pin/verify", json={"pin": pin},
              headers={"Authorization": f"Bearer {access}"})
    assert r.status_code == 200, r.text
    return r.json()["pin_token"]


def _demo_parent_tokens():
    r = _post("/auth/login", json={"email": "papa@demo.fr", "password": "demo1234"})
    assert r.status_code == 200, r.text
    access = r.json()["access_token"]
    pin = _pin_token(access, "123456")
    return access, pin


# -------- SEC-001 SEED GUARD --------
class TestSeedGuard:
    def test_seed_without_admin_key_403(self):
        r = _post("/dev/seed-demo")
        assert r.status_code == 403, r.text

    def test_seed_wrong_admin_key_403(self):
        r = _post("/dev/seed-demo", headers={"X-Admin-Key": "wrong"})
        assert r.status_code == 403

    def test_seed_correct_admin_key_ok(self):
        r = _post("/dev/seed-demo", headers={"X-Admin-Key": ADMIN_KEY})
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True

    def test_demo_family_exists(self):
        # startup auto-seed should have created it
        r = _post("/auth/login", json={"email": "papa@demo.fr", "password": "demo1234"})
        assert r.status_code == 200


# -------- SEC-004 PUSH AUTH --------
class TestPushAuth:
    def test_register_push_no_auth_401(self):
        r = _post("/register-push", json={
            "user_id": "anyone", "platform": "ios", "device_token": "tok_x"
        })
        assert r.status_code in (401, 403), r.text

    def test_register_push_bad_token_401(self):
        r = _post("/register-push",
                  headers={"Authorization": "Bearer garbage"},
                  json={"user_id": "x", "platform": "ios", "device_token": "y"})
        assert r.status_code in (401, 403)

    def test_register_push_bogus_user_id_ignored(self):
        access_a, user_a, _ = _register("parent")
        access_b, user_b, _ = _register("parent")
        device = f"dev_{_uid()}"
        # A registers push, but puts B's id in the body -> should update A only
        r = _post("/register-push",
                  headers={"Authorization": f"Bearer {access_a}"},
                  json={"user_id": user_b["id"], "platform": "ios", "device_token": device})
        assert r.status_code == 201, r.text

        me_a = _get("/auth/me", headers={"Authorization": f"Bearer {access_a}"}).json()
        me_b = _get("/auth/me", headers={"Authorization": f"Bearer {access_b}"}).json()
        assert me_a.get("push_token") == device, "A's token must be updated"
        assert me_b.get("push_token") != device, "B's token must NOT be updated"


# -------- SEC-002 PENALTIES SCOPING + IDEMPOTENCY --------
class TestPenaltiesScoping:
    def test_child_forbidden(self):
        # Register parent to get family_id, then a child in same family
        access_p, _, fam_id = _register("parent")
        access_c, _, _ = _register("child", family_id=fam_id)
        r = _post("/dev/run-penalties",
                  headers={"Authorization": f"Bearer {access_c}"})
        assert r.status_code == 403

    def test_parent_without_pin_forbidden(self):
        access_p, _, _ = _register("parent")
        r = _post("/dev/run-penalties",
                  headers={"Authorization": f"Bearer {access_p}"})
        assert r.status_code == 403

    def test_parent_with_pin_scoped_and_idempotent(self):
        # Family A
        acc_pA, _, famA = _register("parent")
        pin_pA = _pin_token(acc_pA)
        acc_cA, userA, _ = _register("child", family_id=famA)
        # Family B
        acc_pB, _, famB = _register("parent")
        pin_pB = _pin_token(acc_pB)
        acc_cB, userB, _ = _register("child", family_id=famB)

        # Parent A creates a daily task assigned to child A (not completed)
        task_body = {
            "title": f"TEST_task_{_uid()}", "points_worth": 10, "penalty_points": 25,
            "frequency": "daily", "assigned_to": [userA["id"]],
            "photo_required": False, "due_time": "20:00",
        }
        r = _post("/tasks", json=task_body,
                  headers={"Authorization": f"Bearer {acc_pA}",
                           "X-Parent-Pin-Token": pin_pA})
        assert r.status_code == 200, r.text

        # Parent B creates a task for child B (should NOT be penalized when A runs)
        rB = _post("/tasks", json={**task_body, "title": f"TEST_taskB_{_uid()}",
                                    "assigned_to": [userB["id"]]},
                   headers={"Authorization": f"Bearer {acc_pB}",
                            "X-Parent-Pin-Token": pin_pB})
        assert rB.status_code == 200, rB.text

        # Snapshot points
        ptsA_before = _get("/auth/me", headers={"Authorization": f"Bearer {acc_cA}"}).json()["points"]
        ptsB_before = _get("/auth/me", headers={"Authorization": f"Bearer {acc_cB}"}).json()["points"]

        # Parent A runs penalties
        r = _post("/dev/run-penalties",
                  headers={"Authorization": f"Bearer {acc_pA}",
                           "X-Parent-Pin-Token": pin_pA})
        assert r.status_code == 200, r.text

        ptsA_after = _get("/auth/me", headers={"Authorization": f"Bearer {acc_cA}"}).json()["points"]
        ptsB_after = _get("/auth/me", headers={"Authorization": f"Bearer {acc_cB}"}).json()["points"]

        assert ptsA_after < ptsA_before, "Family A child should be penalized"
        assert ptsB_after == ptsB_before, "Family B child must NOT be affected by A's run"

        # Idempotency: run again -> no additional deduction
        r2 = _post("/dev/run-penalties",
                   headers={"Authorization": f"Bearer {acc_pA}",
                            "X-Parent-Pin-Token": pin_pA})
        assert r2.status_code == 200
        ptsA_after2 = _get("/auth/me", headers={"Authorization": f"Bearer {acc_cA}"}).json()["points"]
        assert ptsA_after2 == ptsA_after, "Second run must be idempotent (no double penalty)"


# -------- SEC-003 PHOTO FAMILY SCOPING --------
class TestPhotoScoping:
    @pytest.fixture(scope="class")
    def photo_ctx(self):
        # Family A: parent + child
        acc_pA, _, famA = _register("parent")
        pin_pA = _pin_token(acc_pA)
        acc_cA, userA, _ = _register("child", family_id=famA)
        # Family B: parent (different family, will try to read)
        acc_pB, _, famB = _register("parent")

        # Parent A creates a PHOTO-required task assigned to child A
        r = _post("/tasks", json={
            "title": f"TEST_photo_{_uid()}", "points_worth": 5,
            "penalty_points": 10, "frequency": "daily",
            "assigned_to": [userA["id"]], "photo_required": True,
        }, headers={"Authorization": f"Bearer {acc_pA}",
                    "X-Parent-Pin-Token": pin_pA})
        assert r.status_code == 200, r.text
        task_id = r.json()["id"]

        # Child A submits photo proof
        # minimal jpeg-ish bytes; server does not validate content
        files = {"photo": ("proof.jpg", io.BytesIO(b"\xff\xd8\xff\xe0fake"), "image/jpeg")}
        r = _post(f"/tasks/{task_id}/complete",
                  headers={"Authorization": f"Bearer {acc_cA}"},
                  files=files)
        if r.status_code == 500:
            pytest.skip(f"Object storage upload not available in preview env: {r.text[:200]}")
        assert r.status_code == 200, r.text
        photo_path = r.json().get("photo_path")
        assert photo_path and photo_path.startswith("tachehero/uploads/"), photo_path
        return {"acc_A": acc_pA, "acc_B": acc_pB, "acc_cA": acc_cA, "path": photo_path}

    def test_same_family_can_fetch_header(self, photo_ctx):
        r = _get(f"/photos/{photo_ctx['path']}",
                 headers={"Authorization": f"Bearer {photo_ctx['acc_A']}"})
        assert r.status_code == 200, r.text

    def test_same_family_can_fetch_query_token(self, photo_ctx):
        r = _get(f"/photos/{photo_ctx['path']}?token={photo_ctx['acc_cA']}")
        assert r.status_code == 200, r.text

    def test_other_family_404(self, photo_ctx):
        r = _get(f"/photos/{photo_ctx['path']}",
                 headers={"Authorization": f"Bearer {photo_ctx['acc_B']}"})
        assert r.status_code == 404, r.text
        # also via query token
        r = _get(f"/photos/{photo_ctx['path']}?token={photo_ctx['acc_B']}")
        assert r.status_code == 404

    def test_no_token_401(self, photo_ctx):
        r = _get(f"/photos/{photo_ctx['path']}")
        assert r.status_code == 401

    def test_bad_token_401(self, photo_ctx):
        r = _get(f"/photos/{photo_ctx['path']}",
                 headers={"Authorization": "Bearer nope"})
        assert r.status_code == 401

    def test_path_traversal_404(self, photo_ctx):
        for bad in ["../foo", "foo/../bar", "..%2Fx"]:
            r = _get(f"/photos/{bad}",
                     headers={"Authorization": f"Bearer {photo_ctx['acc_A']}"})
            assert r.status_code == 404, f"{bad} -> {r.status_code}"

    def test_leading_slash_404(self, photo_ctx):
        # requests will collapse //, so send via raw url
        url = f"{API}/photos//tachehero/uploads/foo/bar.jpg"
        r = requests.get(url, headers={"Authorization": f"Bearer {photo_ctx['acc_A']}"},
                         timeout=30, allow_redirects=False)
        # server should treat leading '/' path as invalid -> 404 (or 401 if routed
        # to a diff handler). Accept 404 only per spec.
        assert r.status_code == 404, r.status_code


# -------- REGRESSION --------
class TestRegression:
    def test_demo_papa_login(self):
        r = _post("/auth/login", json={"email": "papa@demo.fr", "password": "demo1234"})
        assert r.status_code == 200
        assert r.json()["user"]["role"] == "parent"

    def test_demo_lea_login_and_tasks(self):
        r = _post("/auth/login", json={"email": "lea@demo.fr", "password": "demo1234"})
        assert r.status_code == 200
        access = r.json()["access_token"]
        r = _get("/tasks", headers={"Authorization": f"Bearer {access}"})
        assert r.status_code == 200
        assert isinstance(r.json().get("tasks"), list)

    def test_pin_verify_demo_parent(self):
        access, _ = _demo_parent_tokens()
        assert access

    def test_family_endpoint(self):
        r = _post("/auth/login", json={"email": "papa@demo.fr", "password": "demo1234"})
        access = r.json()["access_token"]
        r = _get("/family", headers={"Authorization": f"Bearer {access}"})
        assert r.status_code == 200
        data = r.json()
        assert data["family"] and len(data["members"]) >= 4

    def test_challenges_events_badges_endpoints(self):
        access, _ = _demo_parent_tokens()
        h = {"Authorization": f"Bearer {access}"}
        for ep in ("/challenges", "/events", "/badges"):
            r = _get(ep, headers=h)
            assert r.status_code == 200, f"{ep} -> {r.status_code} {r.text[:100]}"

    def test_non_photo_task_auto_approve_and_award(self):
        # Fresh family so we can control state
        acc_p, _, fam = _register("parent")
        pin = _pin_token(acc_p)
        acc_c, userC, _ = _register("child", family_id=fam)

        r = _post("/tasks", json={
            "title": f"TEST_easy_{_uid()}", "points_worth": 15,
            "penalty_points": 5, "frequency": "daily",
            "assigned_to": [userC["id"]], "photo_required": False,
        }, headers={"Authorization": f"Bearer {acc_p}", "X-Parent-Pin-Token": pin})
        assert r.status_code == 200, r.text
        task_id = r.json()["id"]

        pts_before = _get("/auth/me", headers={"Authorization": f"Bearer {acc_c}"}).json()["points"]
        r = _post(f"/tasks/{task_id}/complete",
                  headers={"Authorization": f"Bearer {acc_c}"})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "approved"
        pts_after = _get("/auth/me", headers={"Authorization": f"Bearer {acc_c}"}).json()["points"]
        assert pts_after == pts_before + 15

    def test_photo_task_vote_approve_awards_points(self):
        # Create family with 1 parent + 1 child
        acc_p, _, fam = _register("parent")
        pin = _pin_token(acc_p)
        acc_c, userC, _ = _register("child", family_id=fam)
        # Photo-required task assigned to child
        r = _post("/tasks", json={
            "title": f"TEST_ph_{_uid()}", "points_worth": 30,
            "penalty_points": 10, "frequency": "daily",
            "assigned_to": [userC["id"]], "photo_required": True,
        }, headers={"Authorization": f"Bearer {acc_p}", "X-Parent-Pin-Token": pin})
        assert r.status_code == 200, r.text
        task_id = r.json()["id"]
        files = {"photo": ("p.jpg", io.BytesIO(b"\xff\xd8\xff\xe0x"), "image/jpeg")}
        r = _post(f"/tasks/{task_id}/complete",
                  headers={"Authorization": f"Bearer {acc_c}"}, files=files)
        if r.status_code == 500:
            pytest.skip("storage unavailable")
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "pending"
        comp_id = r.json()["id"]
        pts_before = _get("/auth/me", headers={"Authorization": f"Bearer {acc_c}"}).json()["points"]

        # Parent votes approve
        r = _post(f"/completions/{comp_id}/vote", json={"approved": True},
                  headers={"Authorization": f"Bearer {acc_p}"})
        assert r.status_code == 200, r.text
        assert r.json().get("resolved") is True
        pts_after = _get("/auth/me", headers={"Authorization": f"Bearer {acc_c}"}).json()["points"]
        assert pts_after == pts_before + 30

    def test_second_parent_join_via_family_id(self):
        acc_p1, _, fam = _register("parent")
        acc_p2, u2, fam2 = _register("parent", family_id=fam, pin="2222")
        assert fam2 == fam
        r = _get("/family", headers={"Authorization": f"Bearer {acc_p2}"})
        assert r.status_code == 200
        assert any(m["id"] == u2["id"] for m in r.json()["members"])
