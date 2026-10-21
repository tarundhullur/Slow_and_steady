import pytest
from fastapi.testclient import TestClient

from backend.app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("LAZYFLOW_DB_PATH", str(tmp_path / "lazyflow.sqlite3"))
    with TestClient(app) as test_client:
        yield test_client


def test_api_health_and_focus_are_available_offline(client: TestClient) -> None:
    health = client.get("/api/health")
    focus = client.get("/api/focus")

    assert health.status_code == 200
    assert "ai" in health.json()
    assert health.json()["offline_tools"]
    assert focus.status_code == 200
    assert focus.json()["title"]


def test_summarize_accepts_text_and_rejects_empty_text(client: TestClient) -> None:
    result = client.post("/api/summarize", json={"text": "A detailed sentence about the work we completed today."})
    invalid = client.post("/api/summarize", json={"text": ""})
    assert result.status_code == 200
    assert result.json()["summary"]
    assert result.json()["source"] in {"offline", "local-ai"}
    assert invalid.status_code == 422


def test_file_preview_confirmation_and_undo(client: TestClient, tmp_path) -> None:
    selected_folder = tmp_path / "selected"
    selected_folder.mkdir()
    (selected_folder / "photo.png").write_bytes(b"image")
    preview = client.post("/api/organizer/preview", json={"root": str(selected_folder), "mode": "type"})
    assert preview.status_code == 200
    assert preview.json()["count"] == 1
    assert (selected_folder / "photo.png").exists()

    confirmed = client.post("/api/organizer/confirm", json={"preview_id": preview.json()["preview_id"]})
    assert confirmed.status_code == 200
    assert confirmed.json()["moved"] == 1
    assert (selected_folder / "Images" / "photo.png").exists()

    activity = client.get("/api/activity").json()
    undo = client.post(f"/api/organizer/undo/{activity[0]['id']}")
    assert undo.status_code == 200
    assert undo.json()["restored"] == 1
    assert (selected_folder / "photo.png").exists()
