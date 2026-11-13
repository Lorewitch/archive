#!/usr/bin/env python3
"""Reject unresolved Git merge markers before building public files."""
from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
TEXT_SUFFIXES = {".html", ".css", ".js", ".cjs", ".json", ".webmanifest", ".md", ".py", ".txt", ".yml", ".yaml"}
SKIP_DIRS = {".git", ".openai", ".preview", "__pycache__", "node_modules", ".pytest_cache"}
CONFLICT_MARKER = re.compile(r"^\s*(?:<{7}(?: .*)?|={7}|>{7}(?: .*)?|\|{7} .*)\s*$")


def conflict_lines(text: str) -> list[int]:
    return [number for number, line in enumerate(text.splitlines(), 1) if CONFLICT_MARKER.fullmatch(line)]


def assert_clean_text(text: str, owner: str) -> None:
    lines = conflict_lines(text)
    if lines:
        raise ValueError(f"{owner}: незавершённый конфликт Git, строки {', '.join(map(str, lines))}")


def source_errors(root: Path = ROOT) -> list[str]:
    errors = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix not in TEXT_SUFFIXES:
            continue
        if set(path.relative_to(root).parts) & SKIP_DIRS:
            continue
        try:
            assert_clean_text(path.read_text(encoding="utf-8"), path.relative_to(root).as_posix())
        except ValueError as error:
            errors.append(str(error))
    return errors


if __name__ == "__main__":
    errors = source_errors()
    print("\n".join(errors) if errors else "Проверка конфликтов Git: OK")
    raise SystemExit(bool(errors))
