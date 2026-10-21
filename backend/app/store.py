from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any


def database_path() -> Path:
    value = os.getenv("LAZYFLOW_DB_PATH")
    path = Path(value).expanduser() if value else Path.home() / ".lazyflow-ai" / "lazyflow.sqlite3"
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def connect() -> sqlite3.Connection:
    connection = sqlite3.connect(database_path())
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize() -> None:
    with connect() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS activity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                action TEXT NOT NULL,
                summary TEXT NOT NULL,
                undo_data TEXT
            );
            CREATE TABLE IF NOT EXISTS rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                extensions TEXT NOT NULL,
                folder TEXT NOT NULL
            );
        """)


def add_activity(action: str, summary: str, undo_data: dict[str, Any] | None = None) -> int:
    with connect() as db:
        cursor = db.execute("INSERT INTO activity(action, summary, undo_data) VALUES (?, ?, ?)", (action, summary, json.dumps(undo_data) if undo_data else None))
        return int(cursor.lastrowid)


def list_activity(limit: int = 12) -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute("SELECT id, created_at, action, summary, undo_data FROM activity ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [{**dict(row), "undoable": bool(row["undo_data"])} for row in rows]


def get_undo_data(activity_id: int) -> dict[str, Any] | None:
    with connect() as db:
        row = db.execute("SELECT undo_data FROM activity WHERE id = ?", (activity_id,)).fetchone()
    return json.loads(row["undo_data"]) if row and row["undo_data"] else None


def mark_undone(activity_id: int) -> None:
    with connect() as db:
        db.execute("UPDATE activity SET undo_data = NULL WHERE id = ?", (activity_id,))


def list_rules() -> list[dict[str, Any]]:
    with connect() as db:
        rows = db.execute("SELECT id, name, extensions, folder FROM rules ORDER BY id").fetchall()
    return [{"id": row["id"], "name": row["name"], "extensions": json.loads(row["extensions"]), "folder": row["folder"]} for row in rows]


def add_rule(name: str, extensions: list[str], folder: str) -> dict[str, Any]:
    normalized = sorted({ext.lower() if ext.startswith(".") else f".{ext.lower()}" for ext in extensions})
    with connect() as db:
        cursor = db.execute("INSERT INTO rules(name, extensions, folder) VALUES (?, ?, ?)", (name, json.dumps(normalized), folder))
    return {"id": int(cursor.lastrowid), "name": name, "extensions": normalized, "folder": folder}


def delete_rule(rule_id: int) -> bool:
    with connect() as db:
        cursor = db.execute("DELETE FROM rules WHERE id = ?", (rule_id,))
    return cursor.rowcount > 0