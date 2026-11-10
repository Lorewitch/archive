#!/usr/bin/env python3
"""Generate small bot-only search data from the existing archive index.

The normal 32+ MB bot_mentions_index.json remains available for compatibility.
Alтер consumes bot_runtime_index.json (v3), which removes redundant metadata
without removing entries or passive trigger phrases.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "bot_mentions_index.json"
TARGET = ROOT / "data" / "bot_runtime_index.json"
ENTRY_FIELDS = (
    "key", "section", "id", "primary_title", "route", "button_text",
    "priority", "names", "aliases", "signature_aliases",
    "passive_aliases", "tags", "related_terms",
)


def build_compact_index(source: dict) -> dict:
    entries = source.get("entries")
    phrases = source.get("mention_phrases")
    if not isinstance(entries, list) or not isinstance(phrases, list) or not entries:
        raise ValueError("The source bot_mentions_index.json is incomplete")

    key_positions = {entry["key"]: i for i, entry in enumerate(entries)}
    if len(key_positions) != len(entries):
        raise ValueError("Duplicate entry keys in bot index")

    slim_entries = [
        {key: entry[key] for key in ENTRY_FIELDS if key in entry and entry[key] not in (None, [], {})}
        for entry in entries
    ]
    slim_phrases = []
    for phrase in phrases:
        key = phrase.get("key")
        if key not in key_positions:
            raise ValueError(f"Unknown mention entry: {key}")
        entry_priority = int(entries[key_positions[key]].get("priority") or 50)
        if int(phrase.get("priority") or 50) != entry_priority:
            # v3 compact tuple can omit the priority only if it is inherited.
            raise ValueError(f"Unexpected phrase priority: {key}")
        slim_phrases.append([
            str(phrase.get("phrase") or ""),
            key_positions[key],
            int(bool(phrase.get("exact_only", True))),
        ])

    result = {
        "schema_version": 3,
        "version": source.get("version") or "—",
        "entries": slim_entries,
        "related_lookup": source.get("related_lookup") or {},
        "signature_lookup": source.get("signature_lookup") or {},
        "mention_phrases": slim_phrases,
    }
    assert len(result["entries"]) == len(entries)
    assert len(result["mention_phrases"]) == len(phrases)
    return result


def main() -> int:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    compact = build_compact_index(source)
    target_bytes = json.dumps(compact, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    TARGET.write_bytes(target_bytes)
    print(
        f"Built bot runtime index: {len(compact['entries'])} entries, "
        f"{len(compact['mention_phrases'])} phrases; "
        f"{len(target_bytes) / 1_000_000:.1f} MB "
        f"(was {SOURCE.stat().st_size / 1_000_000:.1f} MB)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
