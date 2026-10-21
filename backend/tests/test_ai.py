import pytest

from backend.app.ai import extractive_summary, fallback_digest, ollama_url


def test_ollama_url_accepts_localhost_only(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    assert ollama_url() == "http://127.0.0.1:11434"
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://localhost:11434")
    assert ollama_url() == "http://localhost:11434"


@pytest.mark.parametrize(
    "url",
    [
        "https://127.0.0.1:11434",
        "http://localhost.attacker.example:11434",
        "http://192.168.1.10:11434",
        "http://user:pass@localhost:11434",
    ],
)
def test_ollama_url_rejects_nonlocal_hosts(monkeypatch: pytest.MonkeyPatch, url: str) -> None:
    monkeypatch.setenv("OLLAMA_BASE_URL", url)
    with pytest.raises(ValueError, match="local Ollama"):
        ollama_url()


def test_extractive_summary_and_digest_fallback() -> None:
    text = "This is a useful long sentence that describes the project plan and its main direction.\nTODO: Send the draft tomorrow."
    assert "useful long sentence" in extractive_summary(text)
    digest = fallback_digest(text)
    assert digest["tasks"] == ["TODO: Send the draft tomorrow."]
