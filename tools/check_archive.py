#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
ASSETS_DIR = ROOT / "assets"
SECTIONS = ("books", "artifacts", "weapons", "items", "enemies")
LANGS = {"ru", "en", "zh"}

KNOWN_REGIONS = {
    "Мондштадт", "Ли Юэ", "Инадзума", "Сумеру", "Фонтейн", "Натлан",
    "Нод-Край", "Снежная", "Тейват", "Энканомия", "Разлом",
    "Подземные шахты Разлома", "Море древности", "Селестия", "Каэнри'ах",
    "Каэнри’ах",
}
KNOWN_ITEM_GROUPS = {
    "weekly_bosses", "world_bosses", "common_enemies", "development_materials",
    "teyvat_resources", "food_potions", "useful_items", "misc",
}
KNOWN_DEVELOPMENT_MATERIAL_TYPES = {
    "talents", "character_ascension", "weapon_ascension",
}
KNOWN_ITEM_TYPES = {
    "teyvat_resources": {"ore", "local_specialty", "plant", "animal"},
    "food_potions": {"food", "potion"},
    "useful_items": {"tool", "seelie", "equipment"},
    "misc": {"misc"},
}
KNOWN_WEAPON_TYPES = {"sword", "claymore", "bow", "catalyst", "polearm"}
KNOWN_BOOK_TYPES = {"book_series", "notes"}
KNOWN_ARTIFACT_PARTS = {"flower", "plume", "sands", "goblet", "circlet"}
KNOWN_ENEMY_GROUPS = {
    "hilichurls", "elementals", "fatui", "automatons", "human_factions",
    "abyss", "mystical_beasts",
}
KNOWN_ENEMY_TYPES = {"common_enemy", "world_boss", "weekly_boss", "boss"}

errors: list[str] = []


def fail(message: str) -> None:
    errors.append(message)


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001 - this is a validation script.
        fail(f"{rel(path)}: не удалось прочитать JSON ({exc})")
        return None


def title_ru(item: dict[str, Any]) -> str:
    title = item.get("title")
    if isinstance(title, dict):
        return str(title.get("ru") or "").strip()
    return str(item.get("title_ru") or item.get("name") or "").strip()


def localized_text_present(container: dict[str, Any], key: str = "text") -> bool:
    value = container.get(key)
    if isinstance(value, dict):
        return any(str(value.get(lang) or "").strip() for lang in LANGS)
    return bool(str(value or "").strip())


def split_regions(value: Any) -> list[str]:
    if isinstance(value, list):
        source = value
    else:
        source = str(value or "").replace("，", ",").split(",")
    return [str(region).strip() for region in source if str(region).strip()]


def check_asset(path_value: Any, owner: str) -> None:
    path_text = str(path_value or "").strip()
    if not path_text:
        return
    if path_text.startswith(("http://", "https://", "data:")):
        return
    path = ROOT / path_text
    if not path.exists():
        fail(f"{owner}: не найден файл ассета {path_text}")


def check_languages(item: dict[str, Any], owner: str) -> None:
    languages = item.get("languages")
    if languages is None:
        return
    if not isinstance(languages, list):
        fail(f"{owner}: languages должен быть списком")
        return
    unknown = sorted(set(map(str, languages)) - LANGS)
    if unknown:
        fail(f"{owner}: неизвестные языки в languages: {', '.join(unknown)}")


def check_regions(item: dict[str, Any], owner: str) -> None:
    regions = split_regions(item.get("filter_regions") or item.get("region") or "")
    unknown = sorted(region for region in regions if region not in KNOWN_REGIONS)
    if unknown:
        fail(f"{owner}: неизвестные регионы: {', '.join(unknown)}")


def check_common_index_fields(item: dict[str, Any], owner: str, *, enemy: bool = False) -> None:
    for key in ("search_text", "sort_version", "filter_regions", "filter_type"):
        if key not in item:
            fail(f"{owner}: в индексной записи отсутствует служебное поле {key}")
    if enemy and "enemy_type_keys" not in item:
        fail(f"{owner}: в индексной записи врага отсутствует enemy_type_keys")


def load_indexes() -> dict[str, list[dict[str, Any]]]:
    indexes: dict[str, list[dict[str, Any]]] = {}
    for section in SECTIONS:
        path = DATA_DIR / f"{section}_index.json"
        data = read_json(path)
        if data is None:
            indexes[section] = []
            continue
        if not isinstance(data, list):
            fail(f"{rel(path)}: ожидается список")
            indexes[section] = []
            continue
        indexes[section] = [item for item in data if isinstance(item, dict)]
        if len(indexes[section]) != len(data):
            fail(f"{rel(path)}: все элементы должны быть объектами")
    return indexes


def detail_path(section: str, item_id: str) -> Path:
    return DATA_DIR / section / f"{item_id}.json"


def check_index_and_details(indexes: dict[str, list[dict[str, Any]]]) -> dict[str, dict[str, dict[str, Any]]]:
    details: dict[str, dict[str, dict[str, Any]]] = {section: {} for section in SECTIONS}

    all_global_ids: list[str] = []
    for section, items in indexes.items():
        ids = [str(item.get("id") or "").strip() for item in items]
        for empty_index, item_id in enumerate(ids, start=1):
            if not item_id:
                fail(f"data/{section}_index.json: пустой id в записи #{empty_index}")
        for item_id, count in Counter(ids).items():
            if item_id and count > 1:
                fail(f"data/{section}_index.json: дублирующийся id {item_id}")
        all_global_ids.extend(f"{section}:{item_id}" for item_id in ids if item_id)

        for item in items:
            item_id = str(item.get("id") or "").strip()
            if not item_id:
                continue
            owner = f"data/{section}_index.json#{item_id}"
            if not title_ru(item):
                fail(f"{owner}: пустое русское название")
            check_languages(item, owner)
            check_regions(item, owner)
            check_asset(item.get("icon"), owner)
            check_common_index_fields(item, owner, enemy=(section == "enemies"))

            path = detail_path(section, item_id)
            if not path.exists():
                fail(f"{owner}: нет detail-файла {rel(path)}")
                continue
            detail = read_json(path)
            if not isinstance(detail, dict):
                fail(f"{rel(path)}: detail-файл должен быть объектом")
                continue
            if str(detail.get("id") or "").strip() != item_id:
                fail(f"{rel(path)}: id detail-файла не совпадает с индексом")
            details[section][item_id] = detail

    for global_id, count in Counter(all_global_ids).items():
        if count > 1:
            fail(f"дублирующийся глобальный id {global_id}")

    return details


def check_books(books: dict[str, dict[str, Any]]) -> None:
    for item_id, book in books.items():
        owner = f"data/books/{item_id}.json"
        book_type = str(book.get("subtype") or book.get("book_type") or "").strip()
        if book_type and book_type not in KNOWN_BOOK_TYPES:
            fail(f"{owner}: неизвестный тип книги {book_type}")
        volumes = book.get("volumes")
        if not isinstance(volumes, list) or not volumes:
            fail(f"{owner}: книга без частей/томов")
            continue
        declared = book.get("volume_count")
        if isinstance(declared, int) and declared != len(volumes):
            fail(f"{owner}: volume_count={declared}, но частей/томов {len(volumes)}")
        numbers = []
        for volume in volumes:
            if not isinstance(volume, dict):
                fail(f"{owner}: часть/том должен быть объектом")
                continue
            number = volume.get("number")
            numbers.append(number)
            if not localized_text_present(volume):
                fail(f"{owner}: часть/том {number or '?'} без текста")
        duplicates = [str(value) for value, count in Counter(numbers).items() if value is not None and count > 1]
        if duplicates:
            fail(f"{owner}: дублирующиеся номера частей/томов: {', '.join(duplicates)}")


def check_artifacts(artifacts: dict[str, dict[str, Any]]) -> None:
    for item_id, artifact in artifacts.items():
        owner = f"data/artifacts/{item_id}.json"
        parts = artifact.get("parts")
        if not isinstance(parts, list):
            fail(f"{owner}: parts должен быть списком")
            continue
        keys = [str(part.get("key") or "").strip() for part in parts if isinstance(part, dict)]
        if set(keys) != KNOWN_ARTIFACT_PARTS or len(keys) != 5:
            fail(f"{owner}: артефакт должен содержать ровно 5 частей: {', '.join(sorted(KNOWN_ARTIFACT_PARTS))}")
        for part in parts:
            if not isinstance(part, dict):
                fail(f"{owner}: часть артефакта должна быть объектом")
                continue
            key = str(part.get("key") or "").strip()
            if not localized_text_present(part):
                fail(f"{owner}: часть {key or '?'} без текста")
            check_asset(part.get("icon"), f"{owner}#{key}")


def check_weapons(weapons: dict[str, dict[str, Any]]) -> None:
    for item_id, weapon in weapons.items():
        owner = f"data/weapons/{item_id}.json"
        weapon_type = str(weapon.get("weapon_type") or weapon.get("type") or "").strip()
        if weapon_type not in KNOWN_WEAPON_TYPES:
            fail(f"{owner}: неизвестный тип оружия {weapon_type or 'пусто'}")
        rarity = weapon.get("rarity")
        if rarity is not None and str(rarity) not in {"1", "2", "3", "4", "5"}:
            fail(f"{owner}: неизвестная редкость оружия {rarity}")
        if not localized_text_present(weapon) and not localized_text_present(weapon, "description"):
            fail(f"{owner}: оружие без текста/описания")


def check_items(items: dict[str, dict[str, Any]], enemies: dict[str, dict[str, Any]]) -> None:
    enemy_ids = set(enemies)
    for item_id, item in items.items():
        owner = f"data/items/{item_id}.json"
        group = str(item.get("item_group") or "").strip()
        if group not in KNOWN_ITEM_GROUPS:
            fail(f"{owner}: неизвестная группа предмета {group or 'пусто'}")

        material_type = str(item.get("material_type") or "").strip()
        if group == "development_materials" and material_type not in KNOWN_DEVELOPMENT_MATERIAL_TYPES:
            fail(f"{owner}: неизвестный material_type {material_type or 'пусто'}")

        item_type = str(item.get("item_type") or "").strip()
        if item_type and item_type not in KNOWN_ITEM_TYPES.get(group, set()):
            fail(f"{owner}: неизвестный item_type {item_type} для группы {group}")

        materials = item.get("materials")
        if materials is not None:
            if not isinstance(materials, list):
                fail(f"{owner}: materials должен быть списком")
            else:
                keys = []
                for material in materials:
                    if not isinstance(material, dict):
                        fail(f"{owner}: материал должен быть объектом")
                        continue
                    key = str(material.get("key") or "").strip()
                    if not key:
                        fail(f"{owner}: материал без key")
                    keys.append(key)
                    if not title_ru(material):
                        fail(f"{owner}: материал {key or '?'} без русского названия")
                    check_asset(material.get("icon"), f"{owner}#{key}")
                duplicates = [key for key, count in Counter(keys).items() if key and count > 1]
                if duplicates:
                    fail(f"{owner}: дублирующиеся key материалов: {', '.join(duplicates)}")

        dropped_by = item.get("dropped_by")
        if dropped_by:
            if not isinstance(dropped_by, list):
                fail(f"{owner}: dropped_by должен быть списком")
            else:
                missing = [str(enemy_id) for enemy_id in dropped_by if str(enemy_id) not in enemy_ids]
                if missing:
                    fail(f"{owner}: битые ссылки dropped_by: {', '.join(missing)}")

        dropped_by_enemies = item.get("dropped_by_enemies")
        if dropped_by_enemies is not None:
            if not isinstance(dropped_by_enemies, list):
                fail(f"{owner}: dropped_by_enemies должен быть списком")
            else:
                for enemy in dropped_by_enemies:
                    if not isinstance(enemy, dict):
                        fail(f"{owner}: dropped_by_enemies должен содержать объекты")
                        continue
                    enemy_id = str(enemy.get("id") or "").strip()
                    if enemy_id and enemy_id not in enemy_ids:
                        fail(f"{owner}: dropped_by_enemies содержит неизвестного врага {enemy_id}")
                    check_asset(enemy.get("icon"), f"{owner}#enemy:{enemy_id}")


def check_enemies(enemies: dict[str, dict[str, Any]]) -> None:
    for item_id, enemy in enemies.items():
        owner = f"data/enemies/{item_id}.json"
        group = str(enemy.get("enemy_group") or "").strip()
        if group not in KNOWN_ENEMY_GROUPS:
            fail(f"{owner}: неизвестный enemy_group {group or 'пусто'}")
        enemy_type = str(enemy.get("enemy_type") or "").strip()
        if enemy_type and enemy_type not in KNOWN_ENEMY_TYPES:
            fail(f"{owner}: неизвестный enemy_type {enemy_type}")
        if not localized_text_present(enemy) and not localized_text_present(enemy, "description"):
            fail(f"{owner}: враг без текста/описания")
        drops = enemy.get("drops")
        if drops is not None and not isinstance(drops, list):
            fail(f"{owner}: drops должен быть списком")
        check_asset(enemy.get("icon"), owner)


def check_summary(indexes: dict[str, list[dict[str, Any]]]) -> None:
    path = DATA_DIR / "archive_summary.json"
    if not path.exists():
        fail("data/archive_summary.json: файл отсутствует")
        return
    summary = read_json(path)
    if not isinstance(summary, dict):
        fail("data/archive_summary.json: ожидается объект")
        return
    for section, items in indexes.items():
        expected = len(items)
        value = summary.get(section)
        if isinstance(value, dict):
            actual = value.get("count") or value.get("total")
        else:
            actual = value
        if actual is not None and actual != expected:
            fail(f"data/archive_summary.json: {section}={actual}, но в индексе {expected}")


def check_generated_css() -> None:
    css = ASSETS_DIR / "css" / "archive.css"
    if not css.exists():
        fail("assets/css/archive.css: итоговый CSS отсутствует")
    src_css = ROOT / "src" / "css"
    expected_modules = [
        "00-tokens.css", "01-base.css", "02-layout.css", "03-navigation.css",
        "04-catalog.css", "05-reader.css", "06-entries.css", "07-responsive.css",
    ]
    for name in expected_modules:
        if not (src_css / name).exists():
            fail(f"src/css/{name}: CSS-модуль отсутствует")


def main() -> int:
    if not DATA_DIR.exists():
        fail("data/: папка не найдена. Сначала запустите tools/build_archive.py")
        indexes = {section: [] for section in SECTIONS}
    else:
        indexes = load_indexes()
        details = check_index_and_details(indexes)
        check_books(details.get("books", {}))
        check_artifacts(details.get("artifacts", {}))
        check_weapons(details.get("weapons", {}))
        check_enemies(details.get("enemies", {}))
        check_items(details.get("items", {}), details.get("enemies", {}))
        check_summary(indexes)
    check_generated_css()

    if errors:
        print("Проверка архива: найдены ошибки", file=sys.stderr)
        for message in errors:
            print(f"- {message}", file=sys.stderr)
        return 1

    counts = ", ".join(f"{section}: {len(indexes.get(section, []))}" for section in SECTIONS)
    print(f"Проверка архива: OK ({counts})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
