"""
Tests for Reward Delivery Workflow (Feature C) & Security Rate Limiting.
"""
import uuid
import pytest
import requests
import os

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "http://127.0.0.1:8000").rstrip("/")
API = f"{BASE_URL}/api"


def _uid():
    return uuid.uuid4().hex[:8]


def _post(path, **kw):
    return requests.post(f"{API}{path}", timeout=30, **kw)


def _get(path, **kw):
    return requests.get(f"{API}{path}", timeout=30, **kw)


def _register(role="parent", family_id=None, pin=None):
    email = f"test_{_uid()}@tribu.fr"
    body = {
        "email": email,
        "password": "password123",
        "name": f"User {role}",
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
    r = _post("/auth/pin/verify", json={"pin": pin}, headers={"Authorization": f"Bearer {access}"})
    assert r.status_code == 200, r.text
    return r.json()["pin_token"]


class TestRewardDeliveryWorkflow:
    def test_complete_reward_claim_and_deliver_flow(self):
        # 1. Register family (1 parent, 1 kid)
        p_tok, p_user, fam_id = _register("parent", pin="123456")
        p_pin = _pin_token(p_tok, "123456")
        c_tok, c_user, _ = _register("child", family_id=fam_id)

        # 2. Parent creates a reward costing 50 points
        r = _post("/rewards", json={"title": "Sortie Parc", "point_cost": 50, "icon": "🎠"},
                  headers={"Authorization": f"Bearer {p_tok}", "X-Parent-Pin-Token": p_pin})
        assert r.status_code == 200, r.text
        reward_id = r.json()["id"]

        # 3. Create and complete a non-photo task for kid to earn 100 points
        t = _post("/tasks", json={"title": "Devoirs", "points_worth": 100, "frequency": "daily",
                                  "photo_required": False, "assigned_to": [c_user["id"]]},
                  headers={"Authorization": f"Bearer {p_tok}", "X-Parent-Pin-Token": p_pin})
        assert t.status_code == 200
        task_id = t.json()["id"]

        comp = _post(f"/tasks/{task_id}/complete", headers={"Authorization": f"Bearer {c_tok}"})
        assert comp.status_code == 200

        # Check kid has 100 points
        me = _get("/auth/me", headers={"Authorization": f"Bearer {c_tok}"}).json()
        assert me["points"] >= 100

        # 4. Kid claims the reward
        claim_res = _post(f"/rewards/{reward_id}/claim", headers={"Authorization": f"Bearer {c_tok}"})
        assert claim_res.status_code == 200, claim_res.text
        claim = claim_res.json()
        assert claim["status"] == "pending"
        assert claim["reward_id"] == reward_id
        claim_id = claim["id"]

        # 5. Child cannot deliver their own reward
        deliv_child = _post(f"/claims/{claim_id}/deliver", headers={"Authorization": f"Bearer {c_tok}"})
        assert deliv_child.status_code == 403

        # 6. Parent without PIN cannot deliver
        deliv_no_pin = _post(f"/claims/{claim_id}/deliver", headers={"Authorization": f"Bearer {p_tok}"})
        assert deliv_no_pin.status_code == 403

        # 7. Parent with PIN delivers reward
        deliv_ok = _post(f"/claims/{claim_id}/deliver", json={"note": "Donné en main propre"},
                         headers={"Authorization": f"Bearer {p_tok}", "X-Parent-Pin-Token": p_pin})
        assert deliv_ok.status_code == 200, deliv_ok.text
        deliv_data = deliv_ok.json()["claim"]
        assert deliv_data["status"] == "delivered"
        assert deliv_data["delivered_by"] == p_user["id"]
        assert deliv_data["delivered_at"] is not None

        # 8. Attempting to deliver again returns 400
        deliv_again = _post(f"/claims/{claim_id}/deliver",
                            headers={"Authorization": f"Bearer {p_tok}", "X-Parent-Pin-Token": p_pin})
        assert deliv_again.status_code == 400


class TestRateLimiter:
    def test_pin_brute_force_lockout(self):
        p_tok, _, _ = _register("parent", pin="123456")
        
        # 5 wrong attempts
        for _ in range(5):
            r = _post("/auth/pin/verify", json={"pin": "9999"}, headers={"Authorization": f"Bearer {p_tok}"})
            assert r.status_code == 401

        # 6th attempt should trigger 429 Too Many Requests
        r6 = _post("/auth/pin/verify", json={"pin": "123456"}, headers={"Authorization": f"Bearer {p_tok}"})
        assert r6.status_code == 429
