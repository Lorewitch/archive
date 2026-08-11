#!/usr/bin/env python3
"""Compare staged 7.0 Markdown text with every cached localized source fragment."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

from build_archive import parse_meta_and_body
from import_lore_corpus import build_entry
from prepare_update_7 import API, API_LANGS, LANGS, STORY_GROUPS, clean_text, readable_text, response_data


ROOT = Path(__file__).resolve().parents[1]
LABELS = {"ru": "RU", "en": "EN", "zh": "ZH"}


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def detail(cache: Path, category: str, lang: str, item_id: int) -> dict[str, Any]:
    path = cache / "details" / category / lang / f"{item_id}.json"
    if not path.is_file():
        raise FileNotFoundError(path)
    value = response_data(read_json(path))
    if not isinstance(value, dict):
        raise RuntimeError(f"invalid cached detail: {path}")
    return value


def readable(cache: Path, lang: str, readable_id: str) -> str:
    path = cache / "readable" / lang / f"{readable_id}.json"
    if not path.is_file():
        return ""
    return readable_text(read_json(path))


def comparable(value: Any) -> str:
    text = clean_text(value)
    text = text.replace("\ufeff", "").replace("\ufffd", "")
    text = re.sub(r"^#{1,6}\s+.*$", " ", text, flags=re.M)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def language_section(markdown: str, lang: str) -> str:
    label = LABELS[lang]
    match = re.search(rf"^## {label}\s*$\n(.*?)(?=^## (?:RU|EN|ZH)\s*$|\Z)", markdown, flags=re.M | re.S)
    return match.group(1).strip() if match else ""


def assert_chunk(
    errors: list[str],
    stats: dict[str, int],
    relative: Path,
    lang: str,
    kind: str,
    expected: Any,
    actual_section: str,
) -> None:
    source = comparable(expected)
    if not source:
        return
    stats["source_fragments"] += 1
    stats["source_characters"] += len(source)
    actual = comparable(actual_section)
    if source not in actual:
        errors.append(
            f"{relative} [{lang}] missing/truncated {kind}: "
            f"source {len(source)} chars, section {len(actual)} chars, source ends with {source[-80:]!r}"
        )
        return
    stats["matched_fragments"] += 1
    stats["matched_characters"] += len(source)


def audit_file(
    path: Path,
    content_root: Path,
    cache: Path,
    quest_index: dict[str, Any],
    errors: list[str],
    stats: dict[str, int],
) -> None:
    relative = path.relative_to(content_root)
    markdown = path.read_text(encoding="utf-8-sig")
    meta, _ = parse_meta_and_body(markdown)
    try:
        item_id = int(meta.get("source_id", ""))
    except ValueError:
        errors.append(f"{relative}: invalid source_id")
        return

    sections = {lang: language_section(markdown, lang) for lang in LANGS}
    for lang, section in sections.items():
        if not comparable(section):
            errors.append(f"{relative} [{lang}]: empty localized section")
        if "\ufffd" in section:
            errors.append(f"{relative} [{lang}]: contains Unicode replacement characters")

    category = relative.parts[0]
    if category == "items":
        source_category = "material"
        for lang in LANGS:
            assert_chunk(errors, stats, relative, lang, "description", detail(cache, source_category, lang, item_id).get("description"), sections[lang])
        return
    if category == "enemies":
        for lang in LANGS:
            assert_chunk(errors, stats, relative, lang, "description", detail(cache, "monster", lang, item_id).get("description"), sections[lang])
        return
    if category == "weapons":
        for lang in LANGS:
            row = detail(cache, "weapon", lang, item_id)
            assert_chunk(errors, stats, relative, lang, "weapon description", row.get("description"), sections[lang])
            story_ids = row.get("storyId") or []
            if story_ids:
                assert_chunk(errors, stats, relative, lang, "weapon story", readable(cache, lang, f"Weapon{story_ids[0]}"), sections[lang])
        return
    if category == "books":
        for lang in LANGS:
            row = detail(cache, "book", lang, item_id)
            for number, volume in enumerate(row.get("volume") or [], start=1):
                text = readable(cache, lang, f"Book{volume.get('storyId')}") or clean_text(volume.get("description"))
                assert_chunk(errors, stats, relative, lang, f"book volume {number}", text, sections[lang])
        return
    if category == "artifacts":
        for lang in LANGS:
            for part in range(1, 6):
                assert_chunk(errors, stats, relative, lang, f"artifact part {part}", readable(cache, lang, f"Relic{item_id}_{part}"), sections[lang])
        return
    if category == "stories" and len(relative.parts) > 1 and relative.parts[1] == "character_stories":
        for lang in LANGS:
            story = detail(cache, "avatarFetter", lang, item_id).get("story") or {}
            values = story.values() if isinstance(story, dict) else story
            for number, part in enumerate(values, start=1):
                if not isinstance(part, dict):
                    continue
                assert_chunk(errors, stats, relative, lang, f"character story {number}", part.get("text"), sections[lang])
        return
    if category == "stories":
        rows = {lang: detail(cache, "quest", lang, item_id) for lang in LANGS}
        index_row = quest_index.get(str(item_id), {})
        quest_type = str(index_row.get("type") or "WQ").lower()
        if quest_type not in STORY_GROUPS:
            quest_type = "wq"
        entry, _, build_warnings = build_entry(item_id, quest_type, rows, {}, {}, "7.0")
        if build_warnings:
            errors.extend(f"{relative}: {warning}" for warning in build_warnings)
        for lang in LANGS:
            for number, part in enumerate(entry.get("parts") or [], start=1):
                assert_chunk(errors, stats, relative, lang, f"quest part {number}", part.get("text", {}).get(lang), sections[lang])


def scan_existing_quests(root: Path) -> list[str]:
    errors: list[str] = []
    for path in sorted(root.rglob("*.md")):
        text = path.read_text(encoding="utf-8-sig")
        relative = path.relative_to(ROOT)
        for lang in LANGS:
            section = language_section(text, lang)
            if not comparable(section):
                errors.append(f"{relative} [{lang}]: empty localized section")
            if "\ufffd" in section:
                errors.append(f"{relative} [{lang}]: contains Unicode replacement characters")
    return errors


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", type=Path, default=ROOT / "updates" / "7.0")
    parser.add_argument("--cache", type=Path, default=ROOT / "tmp" / "update-7-cache")
    return parser.parse_args()


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = parse_args()
    package = args.package.resolve()
    content = package / "content"
    cache = args.cache.resolve()
    index_payload = read_json(cache / "quest-index-en.json")
    index_data = response_data(index_payload)
    quest_index = index_data.get("items", {}) if isinstance(index_data, dict) else {}
    errors: list[str] = []
    stats = {"files": 0, "source_fragments": 0, "matched_fragments": 0, "source_characters": 0, "matched_characters": 0}
    for path in sorted(content.rglob("*.md")):
        stats["files"] += 1
        try:
            audit_file(path, content, cache, quest_index, errors, stats)
        except Exception as error:
            errors.append(f"{path.relative_to(content)}: audit error: {error}")
    existing_errors = scan_existing_quests(ROOT / "content" / "stories" / "quests")
    report = {
        **stats,
        "coverage_percent": round(100 * stats["matched_characters"] / max(1, stats["source_characters"]), 4),
        "existing_quest_files": len(list((ROOT / "content" / "stories" / "quests").rglob("*.md"))),
        "existing_quest_section_errors": existing_errors,
        "errors": errors,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if errors or existing_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
