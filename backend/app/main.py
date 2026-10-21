from __future__ import annotations

import re
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from . import ai, store
from .organizer import OrganizerError, apply_plan, build_plan, undo_moves

pending_plans: dict[str, dict[str, Any]] = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    store.initialize()
    yield


app = FastAPI(
    title="LazyFlow AI",
    version="1.0.0",
    description="Private, local-first productivity tools",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)


class PreviewRequest(BaseModel):
    root: str = Field(min_length=1, max_length=4096)
    mode: Literal["type", "date", "custom", "rules"] = "type"
    custom: dict[str, str] = Field(default_factory=dict)


class ConfirmRequest(BaseModel):
    preview_id: str


class TextRequest(BaseModel):
    text: str = Field(min_length=1, max_length=100_000)


class RuleRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    extensions: list[str] = Field(min_length=1, max_length=30)
    folder: str = Field(min_length=1, max_length=64)


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {"status": "ok", "ai": await ai.status(), "offline_tools": ["file organization", "focus mode", "automation rules", "activity log", "basic summaries"]}


@app.post("/api/organizer/preview")
def preview(request: PreviewRequest) -> dict[str, Any]:
    try:
        rules = store.list_rules() if request.mode == "rules" else None
        plan = build_plan(request.root, "type" if request.mode == "rules" else request.mode, request.custom, rules)
    except (OrganizerError, OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    pending_plans[plan["id"]] = plan
    return {"preview_id": plan["id"], "root": plan["root"], "fingerprint": plan["fingerprint"], "moves": plan["moves"], "count": len(plan["moves"])}


@app.post("/api/organizer/confirm")
def confirm(request: ConfirmRequest) -> dict[str, Any]:
    plan = pending_plans.pop(request.preview_id, None)
    if plan is None:
        raise HTTPException(status_code=404, detail="Preview expired. Create a new preview before confirming.")
    try:
        moves = apply_plan(plan)
    except (OrganizerError, OSError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    activity_id = store.add_activity("Organized files", f"Moved {len(moves)} file(s) in {plan['root']}", {"root": plan["root"], "moves": moves}) if moves else None
    return {"moved": len(moves), "activity_id": activity_id}


@app.post("/api/organizer/undo/{activity_id}")
def undo(activity_id: int) -> dict[str, Any]:
    data = store.get_undo_data(activity_id)
    if not data:
        raise HTTPException(status_code=404, detail="This action is no longer undoable.")
    try:
        count = undo_moves(data["root"], data["moves"])
    except (OrganizerError, OSError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    store.mark_undone(activity_id)
    store.add_activity("Undo", f"Restored {count} file(s)")
    return {"restored": count}


@app.post("/api/summarize")
async def summarize(request: TextRequest) -> dict[str, Any]:
    result = await ai.generate(request.text, "Summarize the user's text accurately and briefly. Do not invent facts or tasks.")
    return {"summary": result or ai.extractive_summary(request.text), "source": "local-ai" if result else "offline"}


@app.post("/api/digest")
async def digest(request: TextRequest) -> dict[str, Any]:
    prompt = f"Create a concise daily digest from this text. Return JSON with a string summary and an array of actionable task strings. Do not invent information.\n\n{request.text}"
    result = await ai.generate(prompt, "Return only valid JSON with keys summary and tasks. Extract only tasks explicitly present.")
    if result:
        import json
        try:
            parsed = json.loads(re.sub(r"^```(?:json)?\s*|\s*```$", "", result, flags=re.I))
            if isinstance(parsed.get("summary"), str) and isinstance(parsed.get("tasks"), list):
                return {"summary": parsed["summary"], "tasks": [str(task) for task in parsed["tasks"][:8]], "source": "local-ai"}
        except (ValueError, AttributeError):
            pass
    return {**ai.fallback_digest(request.text), "source": "offline"}


@app.get("/api/focus")
def focus() -> dict[str, str]:
    import random
    options = [
        {"title": "A slower breath", "routine": "Breathe in gently for 4 counts, pause for 2, then exhale for 6. Repeat four times. Let the next task wait."},
        {"title": "Unclench", "routine": "Let your shoulders drop. Unclench your jaw. Look at something far away and take three unhurried breaths."},
        {"title": "One small thing", "routine": "Name one thing you can finish in five minutes. Set everything else aside while you do just that."},
        {"title": "Ground yourself", "routine": "Notice three things you can see, two things you can feel, and one sound. There is no need to rush the next moment."},
    ]
    return random.choice(options)


@app.get("/api/rules")
def get_rules() -> list[dict[str, Any]]:
    return store.list_rules()


@app.post("/api/rules")
def create_rule(request: RuleRequest) -> dict[str, Any]:
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Give your rule a name.")
    folder = request.folder.strip()
    if not re.fullmatch(r"[\w .-]{1,64}", folder, flags=re.UNICODE) or folder in {".", ".."}:
        raise HTTPException(status_code=422, detail="Choose a simple destination folder name.")
    extensions = [ext.strip().lower() for ext in request.extensions]
    if any(not re.fullmatch(r"\.?[a-z0-9]{1,12}", ext) for ext in extensions):
        raise HTTPException(status_code=422, detail="Extensions should look like png or .png.")
    if not extensions:
        raise HTTPException(status_code=422, detail="Add at least one file extension.")
    return store.add_rule(name, extensions, folder)


@app.delete("/api/rules/{rule_id}")
def remove_rule(rule_id: int) -> dict[str, bool]:
    if not store.delete_rule(rule_id):
        raise HTTPException(status_code=404, detail="Rule not found.")
    return {"deleted": True}


@app.get("/api/activity")
def activity() -> list[dict[str, Any]]:
    return store.list_activity()


@app.post("/api/chat")
async def chat(request: TextRequest) -> dict[str, str]:
    result = await ai.generate(request.text, "You are LazyFlow, a concise and practical private local assistant. Never claim to have performed file or system actions.")
    if result is None:
        raise HTTPException(status_code=503, detail="Local AI is unavailable. Start Ollama with the configured model, or use the offline tools.")
    store.add_activity("Local chat", "Sent a message to the local model")
    return {"reply": result}