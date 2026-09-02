"""
Iteration 14 — Pauses (vacation), points-floor (>=0) and paused-penalty exemption.
Tests the new feature set:
  - POST/GET/DELETE /api/pauses (parent + PIN, validation)
  - GET /api/tasks returns {tasks, paused} and hides tasks while paused
  - apply_daily_penalties (POST /api/dev/run-penalties): floor at 0, skip paused users
"""
import os
from datetime import date, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or os.environ["EXPO_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

PARENT_EMAIL = "papa@demo.fr"
PARENT_PW = "demo1234"
PARENT_PIN = "123456"
KID_EMAILS = ["lea@demo.fr", "hugo@demo.fr", "emma@demo.fr"]


# ---------- fixtures ----------
def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _hdr(tok, pin_tok=None):
    h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
    if pin_tok:
        h["X-Parent-Pin-Token"] = pin_tok
    return h


def _pin(tok):
    r = requests.post(f"{API}/auth/pin/verify",
                      headers=_hdr(tok), json={"pin": PARENT_PIN}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["pin_token"]


@pytest.fixture(scope="module")
def parent_tok():
    return _login(PARENT_EMAIL, PARENT_PW)


@pytest.fixture(scope="module")
def pin_tok(parent_tok):
    return _pin(parent_tok)


@pytest.fixture(scope="module")
def family(parent_tok):
    r = requests.get(f"{API}/family", headers=_hdr(parent_tok), timeout=15)
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="module")
def kid_ids(family):
    return {m["email"]: m["id"] for m in family["members"] if m["role"] == "child"}


@pytest.fixture(scope="module")
def kid_toks():
    return {e: _login(e, PARENT_PW) for e in KID_EMAILS}


@pytest.fixture(scope="module")
def mongo():
    client = MongoClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=5000)
    db = client[os.environ.get("DB_NAME", "tachehero")]
    yield db
    client.close()


# clean any TEST_ pauses at start & end of module
@pytest.fixture(scope="module", autouse=True)
def _cleanup(mongo, parent_tok, pin_tok):
    def wipe():
        r = requests.get(f"{API}/pauses", headers=_hdr(parent_tok), timeout=15)
        for p in r.json().get("pauses", []):
            if (p.get("reason") or "").startswith("TEST_"):
                requests.delete(f"{API}/pauses/{p['id']}", headers=_hdr(parent_tok, pin_tok), timeout=15)
    wipe()
    yield
    wipe()


# ---------- 1. Pause CRUD ----------
class TestPauseCRUD:
    def test_create_pause_requires_pin(self, parent_tok, kid_ids):
        r = requests.post(f"{API}/pauses", headers=_hdr(parent_tok),
                          json={"user_ids": [next(iter(kid_ids.values()))],
                                "start_date": str(date.today()),
                                "end_date": str(date.today()),
                                "reason": "TEST_no_pin"}, timeout=15)
        assert r.status_code in (401, 403), r.text  # no pin token → refused

    def test_create_get_delete_pause(self, parent_tok, pin_tok, kid_ids):
        lea = kid_ids["lea@demo.fr"]
        today = date.today()
        payload = {
            "user_ids": [lea],
            "start_date": str(today),
            "end_date": str(today + timedelta(days=2)),
            "reason": "TEST_crud",
        }
        r = requests.post(f"{API}/pauses", headers=_hdr(parent_tok, pin_tok), json=payload, timeout=15)
        assert r.status_code == 200, r.text
        p = r.json()
        assert p["id"] and p["start_date"] == str(today)
        assert p["user_ids"] == [lea]
        assert "Léa" in (p.get("member_names") or [None])[0] or p["member_names"]  # names set
        pid = p["id"]

        # GET lists it
        r = requests.get(f"{API}/pauses", headers=_hdr(parent_tok), timeout=15)
        assert r.status_code == 200
        assert any(x["id"] == pid for x in r.json()["pauses"])

        # DELETE removes it
        r = requests.delete(f"{API}/pauses/{pid}", headers=_hdr(parent_tok, pin_tok), timeout=15)
        assert r.status_code == 200 and r.json().get("ok") is True

        r = requests.get(f"{API}/pauses", headers=_hdr(parent_tok), timeout=15)
        assert not any(x["id"] == pid for x in r.json()["pauses"])

    def test_end_before_start_rejected(self, parent_tok, pin_tok, kid_ids):
        r = requests.post(f"{API}/pauses", headers=_hdr(parent_tok, pin_tok), json={
            "user_ids": [kid_ids["lea@demo.fr"]],
            "start_date": "2026-02-10",
            "end_date": "2026-02-05",
            "reason": "TEST_bad_range",
        }, timeout=15)
        assert r.status_code == 400
        assert "fin" in r.text.lower()

    def test_empty_user_ids_rejected(self, parent_tok, pin_tok):
        r = requests.post(f"{API}/pauses", headers=_hdr(parent_tok, pin_tok), json={
            "user_ids": [], "start_date": str(date.today()), "end_date": str(date.today()),
            "reason": "TEST_no_members",
        }, timeout=15)
        assert r.status_code == 400

    def test_foreign_member_rejected(self, parent_tok, pin_tok):
        r = requests.post(f"{API}/pauses", headers=_hdr(parent_tok, pin_tok), json={
            "user_ids": ["ghost-user-not-in-family"],
            "start_date": str(date.today()),
            "end_date": str(date.today()),
            "reason": "TEST_bad_member",
        }, timeout=15)
        assert r.status_code == 400


# ---------- 2. Tasks masking ----------
class TestTasksPauseMasking:
    def test_not_paused_returns_tasks(self, kid_toks):
        tok = kid_toks["hugo@demo.fr"]  # ensure hugo has no pause
        r = requests.get(f"{API}/tasks", headers=_hdr(tok), timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j["paused"] is False
        assert isinstance(j["tasks"], list) and len(j["tasks"]) > 0

    def test_paused_hides_tasks(self, parent_tok, pin_tok, kid_ids, kid_toks):
        lea = kid_ids["lea@demo.fr"]
        # snapshot count before
        before = requests.get(f"{API}/tasks", headers=_hdr(kid_toks["lea@demo.fr"]), timeout=15).json()
        assert before["paused"] is False
        assert len(before["tasks"]) > 0

        r = requests.post(f"{API}/pauses", headers=_hdr(parent_tok, pin_tok), json={
            "user_ids": [lea], "start_date": str(date.today()),
            "end_date": str(date.today()), "reason": "TEST_mask",
        }, timeout=15)
        assert r.status_code == 200
        pid = r.json()["id"]

        try:
            j = requests.get(f"{API}/tasks", headers=_hdr(kid_toks["lea@demo.fr"]), timeout=15).json()
            assert j["paused"] is True
            assert j["tasks"] == []
            # hugo (not paused) still sees his tasks
            j2 = requests.get(f"{API}/tasks", headers=_hdr(kid_toks["hugo@demo.fr"]), timeout=15).json()
            assert j2["paused"] is False and len(j2["tasks"]) > 0
        finally:
            requests.delete(f"{API}/pauses/{pid}", headers=_hdr(parent_tok, pin_tok), timeout=15)

        after = requests.get(f"{API}/tasks", headers=_hdr(kid_toks["lea@demo.fr"]), timeout=15).json()
        assert after["paused"] is False and len(after["tasks"]) > 0

    def test_pause_outside_today_does_not_mask(self, parent_tok, pin_tok, kid_ids, kid_toks):
        emma = kid_ids["emma@demo.fr"]
        past = date.today() - timedelta(days=10)
        r = requests.post(f"{API}/pauses", headers=_hdr(parent_tok, pin_tok), json={
            "user_ids": [emma], "start_date": str(past - timedelta(days=2)),
            "end_date": str(past), "reason": "TEST_past",
        }, timeout=15)
        assert r.status_code == 200
        pid = r.json()["id"]
        try:
            j = requests.get(f"{API}/tasks", headers=_hdr(kid_toks["emma@demo.fr"]), timeout=15).json()
            assert j["paused"] is False
            assert len(j["tasks"]) > 0
        finally:
            requests.delete(f"{API}/pauses/{pid}", headers=_hdr(parent_tok, pin_tok), timeout=15)


# ---------- 3. Penalties: floor at 0 & skip paused ----------
class TestPenaltiesFloorAndPause:
    def test_points_floor_at_zero_and_paused_skipped(self, mongo, parent_tok, pin_tok, kid_ids, family):
        today_key = str(date.today())
        lea = kid_ids["lea@demo.fr"]     # will be paused → 0 penalty
        hugo = kid_ids["hugo@demo.fr"]   # will get low points → must not go negative
        emma = kid_ids["emma@demo.fr"]

        # snapshot original points
        orig = {u["id"]: u.get("points", 0) for u in mongo.users.find(
            {"id": {"$in": [lea, hugo, emma]}}, {"_id": 0, "id": 1, "points": 1})}

        # Wipe today's penalties+completions so run-penalties will act (idempotent key = day+task+user)
        fam_id = family["family"]["id"] if isinstance(family.get("family"), dict) else family.get("id") or None
        # family endpoint returns {family, members}; fetch fam_id from any member
        fam_id = mongo.users.find_one({"id": lea}, {"_id": 0, "family_id": 1})["family_id"]
        mongo.penalties.delete_many({"family_id": fam_id, "day": today_key})
        mongo.completions.delete_many({"family_id": fam_id, "day": today_key})

        # Set hugo to very low points (5) so penalty (>=10) would go negative w/o clamp
        mongo.users.update_one({"id": hugo}, {"$set": {"points": 5}})

        # Pause Léa today so she should get 0 penalties
        r = requests.post(f"{API}/pauses", headers=_hdr(parent_tok, pin_tok), json={
            "user_ids": [lea], "start_date": today_key, "end_date": today_key,
            "reason": "TEST_penalty_pause",
        }, timeout=15)
        assert r.status_code == 200
        pause_id = r.json()["id"]

        try:
            r = requests.post(f"{API}/dev/run-penalties", headers=_hdr(parent_tok, pin_tok), timeout=30)
            assert r.status_code == 200, r.text

            # Léa: no penalties inserted
            lea_pen = list(mongo.penalties.find({"family_id": fam_id, "user_id": lea, "day": today_key}))
            assert lea_pen == [], f"Paused user Léa got penalties: {lea_pen}"

            # Hugo: at least one penalty inserted, points must equal 0 (floored)
            hugo_pen = list(mongo.penalties.find({"family_id": fam_id, "user_id": hugo, "day": today_key}))
            assert len(hugo_pen) >= 1, "Expected Hugo to be penalized"
            total_deducted = sum(p["points_deducted"] for p in hugo_pen)
            # first penalty deduct capped to <= 5, remaining ones deduct 0
            assert total_deducted == 5, f"Sum of deducted must equal initial points (5) — got {total_deducted}"
            hugo_now = mongo.users.find_one({"id": hugo}, {"_id": 0, "points": 1})["points"]
            assert hugo_now == 0, f"Hugo went below zero or wrong value: {hugo_now}"

            # verify via API /leaderboard that hugo=0 too
            lb = requests.get(f"{API}/family/leaderboard", headers=_hdr(parent_tok), timeout=15).json()
            rows = lb.get("leaderboard") or lb.get("members") or []
            row = [r for r in rows if r.get("id") == hugo][0]
            assert row["points"] == 0
        finally:
            # restore state
            requests.delete(f"{API}/pauses/{pause_id}", headers=_hdr(parent_tok, pin_tok), timeout=15)
            mongo.users.update_one({"id": hugo}, {"$set": {"points": orig.get(hugo, 0)}})
            mongo.users.update_one({"id": lea}, {"$set": {"points": orig.get(lea, 0)}})
            mongo.penalties.delete_many({"family_id": fam_id, "day": today_key})
