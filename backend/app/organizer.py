from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any


class OrganizerError(ValueError):
    pass


def resolve_root(value: str) -> Path:
    root = Path(value).expanduser().resolve(strict=True)
    if not root.is_dir():
        raise OrganizerError("Choose an existing folder, not a file.")
    return root


def _safe_child(root: Path, relative: str) -> Path:
    relative_path = Path(relative)
    if relative_path.is_absolute() or ".." in relative_path.parts:
        raise OrganizerError("A requested path is outside the selected folder.")
    candidate = root
    for part in relative_path.parts:
        candidate = candidate / part
        if candidate.is_symlink():
            raise OrganizerError("Symbolic links are not changed by the organizer.")
    candidate = candidate.resolve(strict=False)
    if candidate == root or root not in candidate.parents:
        raise OrganizerError("A requested path is outside the selected folder.")
    return candidate


def _category(path: Path, mode: str, custom: dict[str, str]) -> str:
    if mode == "type":
        extension = path.suffix.lower().lstrip(".") or "no-extension"
        return {"jpg": "Images", "jpeg": "Images", "png": "Images", "gif": "Images", "webp": "Images", "svg": "Images", "mp4": "Videos", "mov": "Videos", "mkv": "Videos", "mp3": "Audio", "wav": "Audio", "flac": "Audio", "pdf": "Documents", "doc": "Documents", "docx": "Documents", "txt": "Documents", "md": "Documents", "rtf": "Documents", "csv": "Spreadsheets", "xls": "Spreadsheets", "xlsx": "Spreadsheets", "ods": "Spreadsheets", "zip": "Archives", "gz": "Archives", "tar": "Archives"}.get(extension, "Other")
    if mode == "date":
        modified = datetime.fromtimestamp(path.stat().st_mtime)
        return modified.strftime("%Y-%m")
    if mode == "custom":
        return custom.get(path.suffix.lower(), "Other")
    raise OrganizerError("Choose type, date, or custom organization.")


def _target_name(root: Path, relative: str, folder: str) -> str:
    if not re.fullmatch(r"[\w .-]{1,64}", folder, flags=re.UNICODE) or folder in {".", ".."}:
        raise OrganizerError("Category names may only contain letters, numbers, spaces, dots, dashes, and underscores.")
    destination = (Path(folder) / Path(relative).name).as_posix()
    _safe_child(root, destination)
    return destination


def build_plan(root_value: str, mode: str, custom: dict[str, str] | None = None, rules: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    root = resolve_root(root_value)
    custom = {key.lower() if key.startswith(".") else f".{key.lower()}": value for key, value in (custom or {}).items()}
    moves: list[dict[str, str]] = []
    seen_targets: set[str] = set()

    for current, directories, filenames in os.walk(root, followlinks=False):
        current_path = Path(current)
        directories[:] = [name for name in directories if not (current_path / name).is_symlink() and not (current_path / name).name.startswith(".")]
        for filename in filenames:
            source = current_path / filename
            if source.is_symlink() or not source.is_file():
                continue
            relative = source.relative_to(root).as_posix()
            rule = next((item for item in (rules or []) if source.suffix.lower() in item["extensions"]), None)
            folder = rule["folder"] if rule else _category(source, mode, custom)
            destination_relative = _target_name(root, relative, folder)
            if destination_relative == relative or destination_relative in seen_targets:
                continue
            destination = _safe_child(root, destination_relative)
            if destination.exists():
                continue
            seen_targets.add(destination_relative)
            moves.append({"source": relative, "destination": destination_relative})

    fingerprint = hashlib.sha256(json.dumps(moves, sort_keys=True).encode()).hexdigest()[:12]
    return {"id": str(uuid.uuid4()), "root": str(root), "moves": moves, "fingerprint": fingerprint}


def apply_plan(plan: dict[str, Any]) -> list[dict[str, str]]:
    root = resolve_root(plan["root"])
    completed: list[dict[str, str]] = []
    try:
        for move in plan["moves"]:
            source = _safe_child(root, move["source"])
            destination = _safe_child(root, move["destination"])
            if not source.is_file() or source.is_symlink() or destination.exists():
                raise OrganizerError(f"Files changed since preview: {move['source']}")
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(source), str(destination))
            completed.append(move)
    except (OrganizerError, OSError):
        for move in reversed(completed):
            source = _safe_child(root, move["source"])
            destination = _safe_child(root, move["destination"])
            if destination.exists() and not source.exists():
                source.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(destination), str(source))
        raise
    return completed


def undo_moves(root_value: str, moves: list[dict[str, str]]) -> int:
    root = resolve_root(root_value)
    restored: list[dict[str, str]] = []
    try:
        for move in reversed(moves):
            original = _safe_child(root, move["source"])
            current = _safe_child(root, move["destination"])
            if not current.is_file() or current.is_symlink() or original.exists():
                raise OrganizerError(f"Cannot safely undo: {move['destination']}")
            original.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(current), str(original))
            restored.append(move)
    except (OrganizerError, OSError):
        for move in reversed(restored):
            original = _safe_child(root, move["source"])
            current = _safe_child(root, move["destination"])
            if original.exists() and not current.exists():
                current.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(original), str(current))
        raise
    return len(moves)