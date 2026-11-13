#!/usr/bin/env python3
"""Validate Alter's full and compact indexes against the published archive."""
from __future__ import annotations

import json
from pathlib import Path

from build_bot_runtime_index import build_compact_index

ROOT = Path(__file__).resolve().parents[1]
BOT_SECTIONS = ("books", "artifacts", "weapons", "items", "stories")


def check_bot_indexes() -> list[str]:
    errors: list[str] = []
    try:
        full = json.loads((ROOT / "data/bot_mentions_index.json").read_text(encoding="utf-8"))
        runtime = json.loads((ROOT / "data/bot_runtime_index.json").read_text(encoding="utf-8"))
        expected_runtime = build_compact_index(full)
        if runtime != expected_runtime:
            errors.append("bot_runtime_index.json: компактный индекс устарел; пересоберите оба индекса Альтер")

        expected: dict[str, str] = {}
        for section in BOT_SECTIONS:
            rows = json.loads((ROOT / f"data/{section}_index.json").read_text(encoding="utf-8"))
            for item in rows:
                entry_id = str(item["id"])
                group = str(item.get("item_group") or "misc") if section == "items" else str(item.get("story_group") or "world_stories") if section == "stories" else ""
                route = f"#/{section}/{group}/{entry_id}" if group else f"#/{section}/{entry_id}"
                expected[f"{section}:{entry_id}"] = route
                if not (ROOT / f"data/{section}/{entry_id}.json").is_file():
                    errors.append(f"{section}:{entry_id}: ссылка Альтер ведёт на отсутствующую запись")

        entries = full["entries"]
        keys = {entry["key"] for entry in entries}
        if keys != set(expected):
            errors.append(f"bot_mentions_index.json: отсутствуют записи {sorted(set(expected) - keys)[:8]}; лишние записи {sorted(keys - set(expected))[:8]}")
        for entry in entries:
            key = entry["key"]
            if entry.get("route") != expected.get(key):
                errors.append(f"{key}: неверный маршрут Альтер {entry.get('route')!r}")
            if entry.get("url"):
                errors.append(f"{key}: абсолютная ссылка перекрывает ARCHIVE_BASE_URL; используйте route")
        for name in ("related_lookup", "signature_lookup"):
            for term, targets in full.get(name, {}).items():
                if not isinstance(targets, list) or any(target not in keys for target in targets):
                    errors.append(f"{name}/{term}: ссылка на отсутствующую запись")
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
        errors.append(f"Индексы Альтер повреждены: {error}")
    return errors


def main() -> int:
    errors = check_bot_indexes()
    for error in errors:
        print(error)
    if not errors:
        print("Индексы Альтер: OK (состав записей, маршруты, поисковые связи, формат v2/v3)")
    return int(bool(errors))


if __name__ == "__main__":
    raise SystemExit(main())
