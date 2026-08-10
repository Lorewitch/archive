#!/usr/bin/env python3
"""Restore incomplete quest localizations from extracted game text-map hashes.

The script never translates dialogue.  It uses a complete language only as the
dialogue graph, then resolves every target-language line through the matching
game text-map hash (with the extracted localized quest dump as a fallback).
"""

from __future__ import annotations

import argparse
import copy
import json
import re
from pathlib import Path
from typing import Any

from import_lore_corpus import (
    LANGS,
    SCENE_LABEL,
    clean_game_text,
    markdown_role,
    ordered_records,
    render_dialogue_items,
    story_map,
    write_json,
)


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CORPUS = ROOT / "tmp" / "repaired-lore-corpus"
DEFAULT_CACHE = ROOT / "tmp" / "lore-corpus-cache"
DEFAULT_EXTRACT = ROOT / "tmp" / "YuanShenResources"
EXTRACT_LANGS = {"ru": "RU", "en": "EN", "zh": "CHS"}


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def dialogue_metric(text: str) -> tuple[int, int, int]:
    return (
        len(re.findall(r"^#### ", text, flags=re.M)),
        len(re.findall(r"^\*\*[^\n]+:\*\*", text, flags=re.M)),
        len(re.findall(r"^- \*\*", text, flags=re.M)),
    )


class OfficialTextResolver:
    def __init__(self, extract: Path) -> None:
        self.extract = extract
        self.text_maps = {
            lang: read_json(extract / "TextMap" / f"TextMap{source_lang}.json")
            for lang, source_lang in EXTRACT_LANGS.items()
        }
        self.talk_cache: dict[str, dict[str, dict[str, Any]]] = {}
        self.dialog_cache: dict[tuple[str, str], dict[str, dict[str, str]]] = {}
        self.parallel_cache: dict[tuple[str, str, str], str] = {}

    def talk_rows(self, dialogue_id: str) -> dict[str, dict[str, Any]]:
        digits = re.sub(r"\D", "", str(dialogue_id))
        talk_id = digits[:-2] if len(digits) > 2 else ""
        if not talk_id:
            return {}
        if talk_id not in self.talk_cache:
            path = self.extract / "BinOutput" / "Talk" / "Quest" / f"{talk_id}.json"
            if not path.is_file():
                self.talk_cache[talk_id] = {}
            else:
                payload = read_json(path)
                self.talk_cache[talk_id] = {
                    str(row.get("OIFGMOHKPOI")): row
                    for row in payload.get("PFALHAKIILD") or []
                    if isinstance(row, dict) and row.get("OIFGMOHKPOI") is not None
                }
        return self.talk_cache[talk_id]

    def direct_dialogues(self, source_id: str, lang: str) -> dict[str, dict[str, str]]:
        cache_key = (source_id, lang)
        if cache_key in self.dialog_cache:
            return self.dialog_cache[cache_key]
        path = self.extract / "DialogsText" / EXTRACT_LANGS[lang] / "Quest" / f"Quest_{source_id}.json"
        output: dict[str, dict[str, str]] = {}
        if path.is_file():
            payload = read_json(path)
            for talk in payload.get("talks") or []:
                for row in talk.get("dialogues") or []:
                    row_id = str(row.get("id") or "")
                    if row_id:
                        output[row_id] = {
                            "speaker": str(row.get("speaker") or ""),
                            "text": str(row.get("text") or ""),
                        }
        self.dialog_cache[cache_key] = output
        return output

    def line(self, source_id: str, dialogue_id: str, lang: str) -> str:
        row = self.talk_rows(dialogue_id).get(str(dialogue_id))
        if row:
            text_hash = str(row.get("OACNIBLFFDI") or "")
            localized = self.text_maps[lang].get(text_hash, "")
            if localized:
                return clean_game_text(localized, lang)
        direct = self.direct_dialogues(source_id, lang).get(str(dialogue_id), {})
        return clean_game_text(direct.get("text", ""), lang)

    def speaker(self, source_id: str, dialogue_id: str, lang: str) -> str:
        direct = self.direct_dialogues(source_id, lang).get(str(dialogue_id), {})
        return markdown_role(clean_game_text(direct.get("speaker", ""), lang))

    def parallel(self, value: str, reference_lang: str, target_lang: str) -> str:
        cache_key = (value, reference_lang, target_lang)
        if cache_key in self.parallel_cache:
            return self.parallel_cache[cache_key]
        candidates = {
            self.text_maps[target_lang][text_hash]
            for text_hash, source_value in self.text_maps[reference_lang].items()
            if source_value == value and self.text_maps[target_lang].get(text_hash)
        }
        resolved = clean_game_text(next(iter(candidates)), target_lang) if len(candidates) == 1 else ""
        self.parallel_cache[cache_key] = resolved
        return resolved


def all_items(main_quest: dict[str, Any]) -> dict[str, dict[str, Any]]:
    output: dict[str, dict[str, Any]] = {}
    for step in ordered_records(main_quest.get("story")):
        for task in step.get("taskData") or []:
            items = task.get("items") if isinstance(task, dict) else None
            if isinstance(items, dict):
                output.update({str(key): value for key, value in items.items() if isinstance(value, dict)})
    return output


def localized_items(
    reference_items: Any,
    target_items: dict[str, dict[str, Any]],
    resolver: OfficialTextResolver,
    source_id: str,
    lang: str,
    reference_lang: str,
) -> dict[str, dict[str, Any]] | None:
    if not isinstance(reference_items, dict):
        return {}
    output: dict[str, dict[str, Any]] = {}
    for item_id, reference in reference_items.items():
        if not isinstance(reference, dict):
            continue
        item_key = str(item_id)
        target = target_items.get(item_key, {})
        prepared = copy.deepcopy(reference)
        reference_role = clean_game_text(reference.get("role", ""))
        role = clean_game_text(target.get("role", ""), lang)
        text_rows = reference.get("text") or []
        target_rows = target.get("text") or []
        localized_rows = []
        for position, text_row in enumerate(text_rows):
            if not isinstance(text_row, dict):
                continue
            dialogue_id = item_key
            if not item_key.isdigit():
                next_id = str(text_row.get("next") or "")
                if next_id.isdigit():
                    dialogue_id = next_id
            localized = ""
            if position < len(target_rows) and isinstance(target_rows[position], dict):
                localized = clean_game_text(target_rows[position].get("text", ""), lang)
            if not localized:
                localized = resolver.line(source_id, dialogue_id, lang)
            if not localized:
                localized = resolver.parallel(str(text_row.get("text") or ""), reference_lang, lang)
            if not localized:
                return None
            localized_row = copy.deepcopy(text_row)
            localized_row["text"] = localized
            localized_rows.append(localized_row)
        if reference_role and not role:
            role = resolver.speaker(source_id, dialogue_id if text_rows else item_key, lang)
            if not role:
                role = markdown_role(resolver.parallel(reference_role, reference_lang, lang))
            if not role:
                return None
        prepared["role"] = role
        prepared["text"] = localized_rows
        output[item_key] = prepared
    return output


def render_from_reference(
    reference: dict[str, Any],
    target: dict[str, Any],
    resolver: OfficialTextResolver,
    source_id: str,
    lang: str,
    reference_lang: str,
) -> str | None:
    target_steps = {str(row.get("id")): row for row in ordered_records(target.get("story"))}
    target_items = all_items(target)
    target_info = target.get("info") if isinstance(target.get("info"), dict) else {}
    blocks: list[str] = []
    description = clean_game_text(target_info.get("description"), lang)
    if description:
        blocks.append(description)

    for reference_step in ordered_records(reference.get("story")):
        raw_title = str(reference_step.get("title") or "").casefold()
        if any(marker in raw_title for marker in ("(test)", "（test）", "$hidden", "$unreleased")):
            continue
        step_id = str(reference_step.get("id") or "")
        target_step = target_steps.get(step_id, {})
        heading = clean_game_text(target_step.get("title", ""), lang) or SCENE_LABEL[lang]
        task_blocks: list[str] = []
        for task in reference_step.get("taskData") or []:
            if not isinstance(task, dict):
                continue
            items = localized_items(task.get("items"), target_items, resolver, source_id, lang, reference_lang)
            if items is None:
                return None
            lines = render_dialogue_items(items, lang)
            if lines:
                task_blocks.append("\n\n".join(lines))
        if task_blocks:
            blocks.append(f"#### {heading}\n\n" + "\n\n".join(task_blocks))
    return "\n\n".join(blocks).strip()


def repair_entry(path: Path, cache: Path, resolver: OfficialTextResolver) -> list[dict[str, Any]]:
    entry = read_json(path)
    chapter_id = str(entry.get("source_id") or "")
    details = {
        lang: story_map(read_json(cache / "details" / lang / f"{chapter_id}.json").get("data") or {})
        for lang in LANGS
    }
    changes: list[dict[str, Any]] = []
    for part in entry.get("parts") or []:
        source_id = str(part.get("source_id") or "")
        metrics = {lang: dialogue_metric(str((part.get("text") or {}).get(lang) or "")) for lang in LANGS}
        reference_lang = max(LANGS, key=lambda lang: (metrics[lang][1] + metrics[lang][2], metrics[lang][0]))
        reference_count = metrics[reference_lang][1] + metrics[reference_lang][2]
        if reference_count < 3:
            continue
        reference = details[reference_lang].get(int(source_id))
        if not reference:
            continue
        for lang in LANGS:
            current_count = metrics[lang][1] + metrics[lang][2]
            if current_count >= reference_count:
                continue
            target = details[lang].get(int(source_id))
            if not target:
                continue
            restored = render_from_reference(reference, target, resolver, source_id, lang, reference_lang)
            if not restored:
                continue
            restored_metric = dialogue_metric(restored)
            restored_count = restored_metric[1] + restored_metric[2]
            if restored_count < reference_count:
                continue
            part["text"][lang] = restored
            changes.append({
                "entry": entry["id"],
                "source_id": int(source_id),
                "lang": lang,
                "before": metrics[lang],
                "after": restored_metric,
                "reference": reference_lang,
            })
    if changes:
        write_json(path, entry)
    return changes


def main() -> int:
    parser = argparse.ArgumentParser(description="Restore incomplete official quest localizations")
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--extract", type=Path, default=DEFAULT_EXTRACT)
    parser.add_argument("--report", type=Path, default=ROOT / "tmp" / "quest-localization-repair-report.json")
    args = parser.parse_args()

    resolver = OfficialTextResolver(args.extract)
    changes: list[dict[str, Any]] = []
    for path in sorted(args.corpus.glob("quest_*.json")):
        changes.extend(repair_entry(path, args.cache, resolver))
    write_json(args.report, {"restored": len(changes), "changes": changes})
    print(json.dumps({"restored": len(changes), "report": str(args.report)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
