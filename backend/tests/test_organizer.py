from pathlib import Path

import pytest

from backend.app.organizer import OrganizerError, apply_plan, build_plan, undo_moves


def test_preview_moves_files_by_type_and_apply_then_undo(tmp_path: Path) -> None:
    (tmp_path / "photo.PNG").write_bytes(b"image")
    (tmp_path / "notes.txt").write_text("hello", encoding="utf-8")

    plan = build_plan(str(tmp_path), "type")

    assert plan["moves"] == [
        {"source": "photo.PNG", "destination": "Images/photo.PNG"},
        {"source": "notes.txt", "destination": "Documents/notes.txt"},
    ]
    moves = apply_plan(plan)
    assert (tmp_path / "Images/photo.PNG").read_bytes() == b"image"
    assert (tmp_path / "Documents/notes.txt").read_text(encoding="utf-8") == "hello"

    assert undo_moves(str(tmp_path), moves) == 2
    assert (tmp_path / "photo.PNG").read_bytes() == b"image"
    assert (tmp_path / "notes.txt").read_text(encoding="utf-8") == "hello"


def test_preview_is_stable_for_already_organized_files(tmp_path: Path) -> None:
    folder = tmp_path / "Images"
    folder.mkdir()
    (folder / "photo.png").write_bytes(b"image")

    assert build_plan(str(tmp_path), "type")["moves"] == []


def test_plan_refuses_existing_destination_without_overwriting(tmp_path: Path) -> None:
    (tmp_path / "photo.png").write_bytes(b"original")
    image_folder = tmp_path / "Images"
    image_folder.mkdir()
    (image_folder / "photo.png").write_bytes(b"keep")
    plan = build_plan(str(tmp_path), "type")

    assert plan["moves"] == []
    assert (image_folder / "photo.png").read_bytes() == b"keep"


def test_preview_rejects_missing_or_non_directory_root(tmp_path: Path) -> None:
    file_path = tmp_path / "note.txt"
    file_path.write_text("note", encoding="utf-8")

    with pytest.raises((FileNotFoundError, OrganizerError)):
        build_plan(str(tmp_path / "missing"), "type")
    with pytest.raises(OrganizerError, match="existing folder"):
        build_plan(str(file_path), "type")


def test_path_traversal_and_symlinks_are_rejected(tmp_path: Path) -> None:
    outside = tmp_path.parent / f"{tmp_path.name}-outside"
    outside.mkdir()
    (outside / "secret.txt").write_text("private", encoding="utf-8")
    (tmp_path / "linked").symlink_to(outside, target_is_directory=True)

    with pytest.raises(OrganizerError, match="outside"):
        apply_plan({"root": str(tmp_path), "moves": [{"source": "../secret.txt", "destination": "Documents/secret.txt"}]})
    with pytest.raises(OrganizerError, match="Symbolic links"):
        apply_plan({"root": str(tmp_path), "moves": [{"source": "linked/secret.txt", "destination": "Documents/secret.txt"}]})


def test_custom_and_date_modes(tmp_path: Path) -> None:
    (tmp_path / "sketch.png").write_bytes(b"image")
    custom = build_plan(str(tmp_path), "custom", {".png": "Creative"})
    assert custom["moves"][0]["destination"] == "Creative/sketch.png"
    dated = build_plan(str(tmp_path), "date")
    assert dated["moves"][0]["destination"].startswith("20")
