#!/usr/bin/env python3
"""Convert the imported quest corpus into editable Markdown sources."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "data" / "stories"
DEFAULT_METADATA = ROOT / "tmp" / "quest-metadata.json"
DEFAULT_OUTPUT = ROOT / "content" / "stories" / "quests"
QUEST_GROUPS = {"archon_quests", "legend_quests", "world_quests", "event_chronicles"}
LANGS = (("RU", "ru"), ("EN", "en"), ("ZH", "zh"))


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def meta_text(value: Any) -> str:
    return str(value or "").replace("\ufeff", "").replace("\r", " ").replace("\n", " ").strip()


def meta_list(values: Any, separator: str = ",") -> str:
    return separator.join(meta_text(value) for value in (values or []) if meta_text(value))


def meta_line(name: str, value: Any) -> str:
    return f"# {name}: {meta_text(value)}".rstrip()


def meta_list_line(name: str, values: Any, separator: str = ",") -> str:
    return f"# {name}: {meta_list(values, separator)}".rstrip()


def clean_part_title(value: Any, fallback: str) -> str:
    title = meta_text(value)
    title = re.sub(r"^#+\s*", "", title)
    return title or fallback


def render_markdown(entry: dict[str, Any], metadata: dict[str, Any]) -> str:
    title = entry.get("title") or {}
    chapter = entry.get("chapter_num") or {}
    parts = entry.get("parts") or []
    lines = [
        meta_line("id", entry.get("id")),
        meta_line("story_group", metadata.get("story_group") or entry.get("story_group")),
        meta_line("title_ru", title.get("ru")),
        meta_line("title_en", title.get("en")),
        meta_line("title_zh", title.get("zh")),
        meta_line("region", entry.get("region")),
        meta_line("game_version", metadata.get("game_version")),
        meta_list_line("release_versions", metadata.get("release_versions")),
        meta_line("source_id", entry.get("source_id")),
        meta_line("chapter_num_ru", chapter.get("ru")),
        meta_line("chapter_num_en", chapter.get("en")),
        meta_line("chapter_num_zh", chapter.get("zh")),
        meta_list_line("part_source_ids", (part.get("source_id") for part in parts)),
        meta_list_line("previous_quests", metadata.get("previous_quests")),
        meta_list_line("next_quests", metadata.get("next_quests")),
        meta_list_line("related_quests", metadata.get("related_quests")),
        meta_list_line("quest_chain", metadata.get("quest_chain")),
        meta_list_line("quest_series", metadata.get("quest_series"), " || "),
        meta_line("version_source", metadata.get("version_source")),
        "",
    ]

    for label, lang in LANGS:
        lines.extend([f"## {label}", ""])
        for number, part in enumerate(parts, start=1):
            localized_title = (part.get("title") or {}).get(lang)
            localized_text = str((part.get("text") or {}).get(lang) or "").strip()
            lines.append(f"### {clean_part_title(localized_title, f'Part {number}')}")
            lines.append("")
            lines.append(localized_text)
            lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Migrate quest JSON into Markdown source files")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--metadata", type=Path, default=DEFAULT_METADATA)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    metadata_payload = read_json(args.metadata)
    metadata_by_id = metadata_payload.get("entries") or {}
    written = 0
    group_counts: dict[str, int] = {}

    for source_path in sorted(args.source.glob("quest_*.json")):
        entry = read_json(source_path)
        entry_id = str(entry.get("id") or "")
        source_group = str(entry.get("story_group") or "")
        if not entry_id or source_group not in QUEST_GROUPS:
            raise RuntimeError(f"Unexpected quest entry: {source_path}")
        metadata = metadata_by_id.get(entry_id)
        if not metadata or not metadata.get("game_version"):
            raise RuntimeError(f"Missing verified metadata: {entry_id}")
        group = str(metadata.get("story_group") or source_group)
        if group not in QUEST_GROUPS:
            raise RuntimeError(f"Unexpected classified quest group for {entry_id}: {group}")

        output_path = args.output / group / f"{entry_id}.md"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(render_markdown(entry, metadata), encoding="utf-8", newline="\n")
        old_output_path = args.output / source_group / f"{entry_id}.md"
        if old_output_path != output_path and old_output_path.is_file():
            old_output_path.unlink()
        written += 1
        group_counts[group] = group_counts.get(group, 0) + 1

    if written != len(metadata_by_id):
        raise RuntimeError(f"Corpus/metadata mismatch: wrote {written}, metadata has {len(metadata_by_id)}")
    print(json.dumps({"written": written, "groups": group_counts}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
