"""Tests: GET /api/family, POST/PATCH/DELETE /api/events, parent-only PATCH, range end_time, weekly expansion."""
import os
import requests
import pytest

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://taches-en-famille.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


def _login(email, pw="demo1234"):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"], r.json()["user"]


@pytest.fixture(scope="module")
def parent():
    tok, u = _login("papa@demo.fr")
    return {"tok": tok, "user": u, "h": {"Authorization": f"Bearer {tok}"}}


@pytest.fixture(scope="module")
def kid():
    tok, u = _login("lea@demo.fr")
    return {"tok": tok, "user": u, "h": {"Authorization": f"Bearer {tok}"}}


class TestFamily:
    def test_family_endpoint_members(self, parent):
        r = requests.get(f"{API}/family", headers=parent["h"], timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert data["family"]["id"] == parent["user"]["family_id"]
        names = {m["name"] for m in data["members"]}
        assert {"Papa", "Léa", "Hugo", "Emma"}.issubset(names)
        parents = [m for m in data["members"] if m["role"] == "parent"]
        kids = [m for m in data["members"] if m["role"] == "child"]
        assert len(parents) >= 1 and len(kids) >= 3
        # ensure hashes not leaked
        for m in data["members"]:
            assert "password_hash" not in m and "pin_hash" not in m


class TestEventsCRUD:
    created_ids = []

    def test_create_event_simple(self, parent):
        r = requests.post(f"{API}/events", headers=parent["h"], json={
            "title": "TEST_dentiste", "start_time": "2026-08-22T10:00:00+00:00",
            "color": "#FF9600"
        }, timeout=20)
        assert r.status_code == 200, r.text
        e = r.json()
        assert e["title"] == "TEST_dentiste"
        assert e["end_time"] is None
        TestEventsCRUD.created_ids.append(e["id"])

    def test_create_event_range(self, parent):
        r = requests.post(f"{API}/events", headers=parent["h"], json={
            "title": "TEST_vacances", "start_time": "2026-08-22T09:00:00+00:00",
            "end_time": "2026-08-25T18:00:00+00:00", "color": "#1CB0F6"
        }, timeout=20)
        assert r.status_code == 200, r.text
        e = r.json()
        assert e["end_time"] is not None
        assert e["end_time"].startswith("2026-08-25")
        TestEventsCRUD.created_ids.append(e["id"])
        # verify via list
        r2 = requests.get(f"{API}/events", headers=parent["h"], timeout=20)
        assert r2.status_code == 200
        got = [x for x in r2.json()["events"] if x["id"] == e["id"]]
        assert got and got[0]["end_time"].startswith("2026-08-25")

    def test_patch_event_parent_ok(self, parent):
        eid = TestEventsCRUD.created_ids[0]
        r = requests.patch(f"{API}/events/{eid}", headers=parent["h"],
                           json={"title": "TEST_dentiste_v2"}, timeout=20)
        assert r.status_code == 200, r.text
        r2 = requests.get(f"{API}/events", headers=parent["h"], timeout=20)
        got = [x for x in r2.json()["events"] if x["id"] == eid]
        assert got and got[0]["title"] == "TEST_dentiste_v2"

    def test_patch_event_kid_forbidden(self, parent, kid):
        eid = TestEventsCRUD.created_ids[0]
        r = requests.patch(f"{API}/events/{eid}", headers=kid["h"],
                           json={"title": "hack"}, timeout=20)
        assert r.status_code == 403, r.text

    def test_patch_event_not_found(self, parent):
        r = requests.patch(f"{API}/events/does-not-exist", headers=parent["h"],
                           json={"title": "x"}, timeout=20)
        assert r.status_code == 404

    def test_weekly_recurrence_expands(self, parent):
        r = requests.post(f"{API}/events", headers=parent["h"], json={
            "title": "TEST_weekly", "start_time": "2026-01-05T18:00:00+00:00",
            "recurrence": "weekly", "color": "#CE82FF"
        }, timeout=20)
        assert r.status_code == 200
        eid = r.json()["id"]
        TestEventsCRUD.created_ids.append(eid)
        r2 = requests.get(f"{API}/events", headers=parent["h"], timeout=20)
        occs = [x for x in r2.json()["events"] if x["id"] == eid]
        assert len(occs) >= 2, f"expected weekly expansion, got {len(occs)}"
        assert all("occ_id" in o for o in occs)

    def test_kid_can_list_events(self, kid):
        r = requests.get(f"{API}/events", headers=kid["h"], timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json()["events"], list)

    def test_delete_events_cleanup(self, parent):
        for eid in TestEventsCRUD.created_ids:
            r = requests.delete(f"{API}/events/{eid}", headers=parent["h"], timeout=20)
            assert r.status_code == 200
