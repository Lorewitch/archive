#!/usr/bin/env python3
"""Attach deduplicated Lunaris chapter icons to quest Markdown files."""

from __future__ import annotations

import argparse
import io
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

try:
    from PIL import Image
except ImportError as error:  # pragma: no cover - environment guidance
    raise SystemExit(
        "Pillow is required. Run this tool with the bundled Codex Python runtime."
    ) from error


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONTENT = ROOT / "content" / "stories" / "quests"
DEFAULT_ICON_DIR = ROOT / "assets" / "icons" / "stories" / "quests"
DEFAULT_CACHE = ROOT / "tmp" / "lunaris-cache"
VERSION_URL = "https://api.lunaris.moe/data/version.json"
CHAPTER_LIST_URL = "https://api.lunaris.moe/data/{version}/chapterlist.json"
ICON_URL = "https://api.lunaris.moe/data/assets/chaptericon/{icon}.png"
GENERIC_ICON = "assets/icons/ui/quest_icon.webp"
META_RE = re.compile(r"^#\s*([a-zA-Z0-9_]+)\s*:\s*(.*)$")


def request_bytes(url: str, *, attempts: int = 5) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json,image/avif,image/webp,image/png,*/*",
            "User-Agent": "LorewitchArchive/1.0",
        },
    )
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if error.code == 404:
                raise RuntimeError(f"Icon is not available: {url}") from error
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(min(8, 1.5 * (attempt + 1)))
        except (urllib.error.URLError, TimeoutError) as error:
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(min(8, 1.5 * (attempt + 1)))
    raise RuntimeError(f"Could not download {url}: {last_error}")


def cached_bytes(cache_path: Path, url: str, *, refresh: bool = False) -> bytes:
    if cache_path.is_file() and not refresh:
        return cache_path.read_bytes()
    payload = request_bytes(url)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_bytes(payload)
    return payload


def index_by_id(cache_dir: Path, *, refresh: bool = False) -> dict[int, dict[str, Any]]:
    raw_version = cached_bytes(cache_dir / "version.json", VERSION_URL, refresh=refresh)
    version_payload = json.loads(raw_version.decode("utf-8-sig"))
    version = str(version_payload.get("version") or "latest")
    raw = cached_bytes(
        cache_dir / f"chapterlist-{version}.json",
        CHAPTER_LIST_URL.format(version=version),
        refresh=refresh,
    )
    items = json.loads(raw.decode("utf-8-sig"))
    if not isinstance(items, list):
        raise RuntimeError("Unexpected Lunaris chapter list response")
    result: dict[int, dict[str, Any]] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        try:
            result[int(item.get("id"))] = item
        except (TypeError, ValueError):
            continue
    return result


def parse_metadata(text: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for line in text.splitlines():
        match = META_RE.match(line)
        if match:
            result[match.group(1)] = match.group(2).strip()
        elif line.strip() and not line.startswith("#"):
            break
    return result


def icon_slug(icon: str) -> str:
    value = re.sub(r"^UI_ChapterIcon_", "", icon, flags=re.I)
    value = re.sub(r"[^a-zA-Z0-9]+", "_", value).strip("_").lower()
    return value or "quest"


def save_webp(payload: bytes, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(io.BytesIO(payload)) as source:
        image = source.convert("RGBA")
        image.save(path, "WEBP", lossless=True, method=6)


def set_icon_metadata(text: str, icon_path: str) -> tuple[str, bool]:
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if re.match(r"^#\s*icon\s*:", line):
            replacement = f"# icon: {icon_path}"
            if line == replacement:
                return text, False
            lines[index] = replacement
            return "\n".join(lines).rstrip("\n") + "\n", True

    insert_at = 1
    for index, line in enumerate(lines[:30]):
        if re.match(r"^#\s*story_group\s*:", line):
            insert_at = index + 1
            break
    lines.insert(insert_at, f"# icon: {icon_path}")
    return "\n".join(lines).rstrip("\n") + "\n", True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--content", type=Path, default=DEFAULT_CONTENT)
    parser.add_argument("--icon-dir", type=Path, default=DEFAULT_ICON_DIR)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    quest_index = index_by_id(args.cache, refresh=args.refresh)
    icon_sources: dict[str, str] = {}
    updates: list[tuple[Path, str]] = []
    missing_ids: list[str] = []
    unavailable_icons: list[str] = []
    generic_count = 0

    for path in sorted(args.content.rglob("quest_*.md")):
        text = path.read_text(encoding="utf-8-sig")
        meta = parse_metadata(text)
        entry_id = meta.get("id", path.stem)
        try:
            source_id = int(meta.get("source_id", ""))
        except ValueError:
            missing_ids.append(entry_id)
            source_id = -1
        item = quest_index.get(source_id, {})
        chapter_icon = str(item.get("chapterIcon") or "").strip()
        if chapter_icon:
            filename = f"{icon_slug(chapter_icon)}.webp"
            icon_path = f"assets/icons/stories/quests/{filename}"
            icon_sources[filename] = chapter_icon
        else:
            icon_path = GENERIC_ICON
            generic_count += 1
        updated, changed = set_icon_metadata(text, icon_path)
        if changed:
            updates.append((path, updated))

    if not args.dry_run:
        for filename, source_icon in sorted(icon_sources.items()):
            destination = args.icon_dir / filename
            if destination.is_file() and not args.refresh:
                continue
            try:
                payload = cached_bytes(
                    args.cache / "icons" / f"{source_icon}.png",
                    ICON_URL.format(icon=source_icon),
                    refresh=args.refresh,
                )
                save_webp(payload, destination)
            except RuntimeError:
                unavailable_icons.append(source_icon)
        if unavailable_icons:
            unavailable_paths = {
                f"assets/icons/stories/quests/{icon_slug(source_icon)}.webp"
                for source_icon in unavailable_icons
            }
            updates = [
                (path, set_icon_metadata(text, GENERIC_ICON)[0] if any(
                    f"# icon: {unavailable_path}" in text
                    for unavailable_path in unavailable_paths
                ) else text)
                for path, text in updates
            ]
        for path, text in updates:
            path.write_text(text, encoding="utf-8", newline="\n")

    report = {
        "quest_files": len(list(args.content.rglob("quest_*.md"))),
        "metadata_updates": len(updates),
        "unique_downloaded_icons": len(icon_sources),
        "generic_icon_assignments": generic_count,
        "missing_source_ids": missing_ids,
        "unavailable_lunaris_icons": unavailable_icons,
        "dry_run": args.dry_run,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not missing_ids else 1


if __name__ == "__main__":
    raise SystemExit(main())
