#!/usr/bin/env python3
"""Validate a staged update package without publishing it."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from build_archive import build_artifact, build_book, build_enemy, build_generic, parse_meta_and_body


ROOT = Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", nargs="?", type=Path, default=ROOT / "updates" / "7.0")
    return parser.parse_args()


def main() -> int:
    package = parse_args().package.resolve()
    content = package / "content"
    manifest = json.loads((package / "manifest.json").read_text(encoding="utf-8-sig"))
    expected = sum(int(value) for value in manifest.get("generated", {}).values())
    files = sorted(content.rglob("*.md"))
    errors: list[str] = []
    ids: dict[str, Path] = {}
    icon_paths: set[str] = set()

    for path in files:
        relative = path.relative_to(content)
        category = relative.parts[0]
        try:
            if category == "books":
                entry = build_book(path)
            elif category == "artifacts":
                entry = build_artifact(path)
            elif category == "enemies":
                entry = build_enemy(path)
            else:
                entry = build_generic(path, category)
        except Exception as error:
            errors.append(f"{relative}: parser error: {error}")
            continue
        entry_id = str(entry.get("id") or "")
        if not entry_id:
            errors.append(f"{relative}: missing id")
        elif entry_id in ids:
            errors.append(f"{relative}: duplicate id (also {ids[entry_id].relative_to(content)})")
        else:
            ids[entry_id] = path

        meta, _ = parse_meta_and_body(path.read_text(encoding="utf-8-sig"))
        icon = str(meta.get("icon") or "")
        if not icon:
            errors.append(f"{relative}: missing icon metadata")
        else:
            icon_paths.add(icon)
            target = package.joinpath(*icon.split("/"))
            if not target.is_file():
                errors.append(f"{relative}: icon does not exist: {icon}")

        text = path.read_text(encoding="utf-8-sig")
        for marker in ("## RU", "## EN", "## ZH"):
            if marker not in text:
                errors.append(f"{relative}: missing {marker}")

    if len(files) != expected:
        errors.append(f"manifest expects {expected} files, found {len(files)}")
    if manifest.get("warnings"):
        errors.append(f"manifest still contains {len(manifest['warnings'])} warnings")

    report = {
        "package": str(package),
        "markdown_files": len(files),
        "unique_ids": len(ids),
        "referenced_icons": len(icon_paths),
        "errors": errors,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
