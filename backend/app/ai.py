from __future__ import annotations

import os
import ipaddress
import re
from typing import Any
from urllib.parse import urlsplit

import httpx


def ollama_url() -> str:
    value = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
    parsed = urlsplit(value)
    try:
        local_host = parsed.hostname == "localhost" or (
            parsed.hostname is not None and ipaddress.ip_address(parsed.hostname).is_loopback
        )
    except ValueError:
        local_host = False
    if parsed.scheme != "http" or not local_host or parsed.username or parsed.password:
        raise ValueError("OLLAMA_BASE_URL must point to a local Ollama service.")
    return value


def model_name() -> str:
    return os.getenv("OLLAMA_MODEL", "llama3.2:3b")


async def status() -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            response = await client.get(f"{ollama_url()}/api/tags")
        response.raise_for_status()
        models = [item.get("name", "") for item in response.json().get("models", [])]
        selected = model_name()
        installed = any(name == selected or name.split(":")[0] == selected.split(":")[0] for name in models)
        return {"available": True, "model": selected, "model_installed": installed, "models": models, "message": "Local model ready" if installed else f"Ollama is running. Download {selected} to enable AI features."}
    except (httpx.HTTPError, ValueError, KeyError):
        return {"available": False, "model": model_name(), "model_installed": False, "models": [], "message": "Ollama is not available. Offline tools still work; install Ollama to enable local AI."}


async def generate(prompt: str, system: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(f"{ollama_url()}/api/chat", json={"model": model_name(), "stream": False, "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}]})
            response.raise_for_status()
            return response.json()["message"]["content"].strip()
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        return None


def extractive_summary(text: str, max_sentences: int = 3) -> str:
    sentences = [part.strip() for part in re.split(r"(?<=[.!?])\s+|\n+", text) if len(part.strip()) > 20]
    if not sentences:
        return text.strip()[:500] or "Add some text to create a summary."
    ranked = sorted(enumerate(sentences), key=lambda item: (-len(item[1]), item[0]))[:max_sentences]
    return " ".join(sentence for _, sentence in sorted(ranked))


def fallback_digest(text: str) -> dict[str, Any]:
    lines = [line.strip(" -*\t") for line in text.splitlines() if line.strip()]
    tasks = [line for line in lines if re.search(r"\b(todo|to do|task|remind|remember|due|tomorrow|next week)\b|\[[ xX]\]", line, re.I)]
    return {"summary": extractive_summary(text), "tasks": tasks[:8]}