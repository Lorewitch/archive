#!/usr/bin/env python3
"""Prepare an unpublished, merge-ready content package for Genshin 7.0."""

from __future__ import annotations

import argparse
import concurrent.futures
import html
import io
import json
import re
import shutil
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from PIL import Image

from import_lore_corpus import build_entry


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "updates" / "7.0"
DEFAULT_CACHE = ROOT / "tmp" / "update-7-cache"
LANGS = ("ru", "en", "zh")
API_LANGS = {"ru": "RU", "en": "EN", "zh": "CHS"}
API = "https://gi.yatta.moe/api/v2"
CHANGELOG_URL = f"{API}/static/changelog"
AMBER_ICON_URL = "https://gi.yatta.moe/assets/UI/{icon}.png"
LUNARIS_ICON_URL = "https://api.lunaris.moe/data/assets/chaptericon/{icon}.png"
VERSION = "7.0"

SUPPORTED = {
    "avatar",
    "weapon",
    "food",
    "material",
    "furniture",
    "reliquary",
    "monster",
    "book",
    "quest",
}
EXCLUDED_WEAPON_SKINS = 300000
COMBAT_MONSTER_LIMIT = 28000000
WEAPON_TYPES = {
    "WEAPON_SWORD_ONE_HAND": "sword",
    "WEAPON_CLAYMORE": "claymore",
    "WEAPON_POLE": "polearm",
    "WEAPON_BOW": "bow",
    "WEAPON_CATALYST": "catalyst",
    "Sword": "sword",
    "Claymore": "claymore",
    "Polearm": "polearm",
    "Bow": "bow",
    "Catalyst": "catalyst",
    "Одноручное": "sword",
    "Двуручное": "claymore",
    "Древковое": "polearm",
    "Лук": "bow",
    "Катализатор": "catalyst",
}
ELEMENTS = {
    "Electric": "electro",
    "Fire": "pyro",
    "Water": "hydro",
    "Ice": "cryo",
    "Wind": "anemo",
    "Rock": "geo",
    "Grass": "dendro",
}
ARTIFACT_PARTS = ("Цветок", "Перо", "Часы", "Кубок", "Корона")
STORY_GROUPS = {"aq": "archon_quests", "wq": "world_quests", "lq": "legend_quests", "eq": "event_chronicles"}


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")


def clean_text(value: Any) -> str:
    text = html.unescape(str(value or ""))
    text = re.sub(r"</?color(?:=[^>]*)?>", "", text, flags=re.I)
    text = re.sub(r"</?(?:i|b|strong|em)>", "", text, flags=re.I)
    text = text.replace("\\n", "\n").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def meta(value: Any) -> str:
    return clean_text(value).replace("\n", " ").strip()


def slugify(value: Any, fallback: str) -> str:
    value = html.unescape(str(value or ""))
    value = value.replace("’", "'").replace("&", " and ")
    value = re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_").lower()
    return value or fallback


def response_data(payload: Any) -> Any:
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    return payload


class Downloader:
    def __init__(self, cache: Path, refresh: bool = False) -> None:
        self.cache = cache
        self.refresh = refresh
        self.warnings: list[str] = []
        self._lock = threading.Lock()

    def _warn(self, message: str) -> None:
        with self._lock:
            self.warnings.append(message)

    def bytes(self, cache_path: Path, url: str, *, optional: bool = False, quiet: bool = False) -> bytes | None:
        path = self.cache / cache_path
        if path.is_file() and not self.refresh:
            return path.read_bytes()
        request = urllib.request.Request(url, headers={"User-Agent": "LorewitchArchive/7.0", "Accept": "*/*"})
        last_error: Exception | None = None
        for attempt in range(4):
            try:
                with urllib.request.urlopen(request, timeout=45) as response:
                    payload = response.read()
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(payload)
                return payload
            except urllib.error.HTTPError as error:
                last_error = error
                if error.code == 404:
                    break
            except (urllib.error.URLError, TimeoutError) as error:
                last_error = error
            if attempt < 3:
                time.sleep(1.0 + attempt)
        message = f"{url}: {last_error}"
        if optional:
            if not quiet:
                self._warn(message)
            return None
        raise RuntimeError(message)

    def json(self, cache_path: Path, url: str, *, optional: bool = False) -> Any:
        payload = self.bytes(cache_path, url, optional=optional)
        if payload is None:
            return None
        try:
            return json.loads(payload.decode("utf-8-sig"))
        except json.JSONDecodeError as error:
            if optional:
                self._warn(f"{url}: invalid JSON ({error})")
                return None
            raise


def localized_details(
    downloader: Downloader,
    category: str,
    ids: list[int],
    workers: int,
) -> dict[int, dict[str, Any]]:
    result: dict[int, dict[str, Any]] = {item_id: {} for item_id in ids}

    def fetch(item_id: int, lang: str) -> tuple[int, str, Any]:
        url = f"{API}/{API_LANGS[lang]}/{category}/{item_id}"
        payload = downloader.json(Path("details") / category / lang / f"{item_id}.json", url, optional=True)
        return item_id, lang, response_data(payload) if payload is not None else None

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(fetch, item_id, lang) for item_id in ids for lang in LANGS]
        for future in concurrent.futures.as_completed(futures):
            item_id, lang, payload = future.result()
            if isinstance(payload, dict):
                result[item_id][lang] = payload
    return result


def readable_text(value: Any) -> str:
    value = response_data(value)
    if isinstance(value, str):
        return clean_text(value)
    if isinstance(value, list):
        return "\n\n".join(filter(None, (readable_text(item) for item in value)))
    if not isinstance(value, dict):
        return ""
    for key in ("content", "text", "story", "description"):
        if key in value:
            text = readable_text(value[key])
            if text:
                return text
    texts = []
    for key, item in value.items():
        if key in {"id", "icon", "route", "title", "name", "tips"}:
            continue
        text = readable_text(item)
        if text:
            texts.append(text)
    return "\n\n".join(texts)


def localized_readables(
    downloader: Downloader,
    requests: list[tuple[str, str]],
    workers: int,
) -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {key: {} for key, _ in requests}

    def fetch(key: str, readable_id: str, lang: str) -> tuple[str, str, str]:
        url = f"{API}/{API_LANGS[lang]}/readable/{readable_id}"
        payload = downloader.json(Path("readable") / lang / f"{readable_id}.json", url, optional=True)
        return key, lang, readable_text(payload)

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(fetch, key, readable_id, lang) for key, readable_id in requests for lang in LANGS]
        for future in concurrent.futures.as_completed(futures):
            key, lang, text = future.result()
            if text:
                result[key][lang] = text
    return result


def names(rows: dict[str, Any]) -> dict[str, str]:
    return {lang: meta(rows.get(lang, {}).get("name")) for lang in LANGS}


def first_row(rows: dict[str, Any]) -> dict[str, Any]:
    return rows.get("en") or rows.get("ru") or rows.get("zh") or {}


def save_icon(
    downloader: Downloader,
    icon: str,
    destination: Path,
    source_url: str | None = None,
    *,
    warn: bool = True,
) -> bool:
    if not icon:
        return False
    if destination.is_file() and not downloader.refresh:
        return True
    urls = [source_url] if source_url else [AMBER_ICON_URL.format(icon=icon)]
    if not source_url:
        if icon.startswith(("UI_MonsterIcon_", "UI_AnimalIcon_")):
            urls.append(f"https://api.lunaris.moe/data/assets/monstericon/{icon}.png")
        elif icon.startswith("UI_RelicIcon_"):
            urls.append(f"https://api.lunaris.moe/data/assets/artifacts/{icon}.webp")
        elif icon.startswith("UI_ItemIcon_"):
            urls.append(f"https://api.lunaris.moe/data/assets/items/{icon}.webp")
        elif icon.startswith("UI_EquipIcon_"):
            urls.append(f"https://api.lunaris.moe/data/assets/weaponicon/{icon}.webp")
        elif icon.startswith("UI_AvatarIcon_"):
            urls.append(f"https://api.lunaris.moe/data/assets/avataricon/{icon}.webp")
    payload = None
    for number, url in enumerate(urls):
        if not url:
            continue
        payload = downloader.bytes(Path("icons") / f"{icon}-{number}.bin", url, optional=True, quiet=True)
        if payload:
            break
    if not payload:
        if warn:
            downloader._warn(f"icon unavailable from all sources: {icon}")
        return False
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with Image.open(io.BytesIO(payload)) as source:
            source.convert("RGBA").save(destination, "WEBP", lossless=True, method=6)
    except Exception as error:  # Pillow gives several format-specific exceptions
        downloader._warn(f"{icon}: cannot convert image ({error})")
        return False
    return True


def metadata_lines(values: list[tuple[str, Any]]) -> list[str]:
    return [f"# {key}: {meta(value)}".rstrip() for key, value in values]


def sections(body: dict[str, str], headings: dict[str, str] | None = None) -> list[str]:
    lines: list[str] = []
    for lang, label in (("ru", "RU"), ("en", "EN"), ("zh", "ZH")):
        lines.extend([f"## {label}", ""])
        if headings and headings.get(lang):
            lines.extend([f"### {headings[lang]}", ""])
        lines.extend([clean_text(body.get(lang)), ""])
    return lines


def write_markdown(path: Path, lines: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8", newline="\n")


def item_group_for_material(row: dict[str, Any], item_id: int) -> str:
    item_type = str(row.get("type") or "").casefold()
    if 104000 <= item_id < 105000 or 114000 <= item_id < 115000:
        return "development_materials"
    if 112000 <= item_id < 115000:
        return "common_enemies"
    if 113000 <= item_id < 114000:
        return "world_bosses"
    if 101000 <= item_id < 102000 or "specialty" in item_type or "диковин" in item_type:
        return "teyvat_resources"
    return "useful_items"


def enemy_group(row: dict[str, Any]) -> str:
    value = str(row.get("type") or "").casefold()
    if "fatui" in value or "фату" in value:
        return "fatui"
    if "automaton" in value or "механ" in value:
        return "automatons"
    if "abyss" in value or "бездн" in value:
        return "abyss"
    if "human" in value or "человек" in value:
        return "human_factions"
    if "elemental" in value or "элемент" in value:
        return "elementals"
    return "mystical_beasts"


def prepare_simple_entries(
    downloader: Downloader,
    output: Path,
    category: str,
    ids: list[int],
    workers: int,
    report: dict[str, int],
) -> None:
    rows_by_id = localized_details(downloader, category, ids, workers)
    for item_id, rows in rows_by_id.items():
        row = first_row(rows)
        if not row:
            continue
        localized_names = names(rows)
        slug = slugify(row.get("route") or localized_names["en"], f"{category}_{item_id}")
        icon = str(row.get("icon") or "")
        rarity = row.get("rank") or ""
        descriptions = {lang: clean_text(rows.get(lang, {}).get("description")) for lang in LANGS}

        if category == "material":
            group = item_group_for_material(row, item_id)
            rel_icon = f"assets/icons/items/{group}/{slug}.webp"
            rel_content = f"content/items/{group}/{slug}.md"
            lines = metadata_lines([
                ("id", slug), ("category", "items"), ("item_group", group), ("entry_type", "item"),
                ("item_type", row.get("type")), ("title_ru", localized_names["ru"]),
                ("title_en", localized_names["en"]), ("title_zh", localized_names["zh"]),
                ("region", "Снежная"), ("rarity", rarity), ("game_version", VERSION),
                ("source_id", item_id), ("icon", rel_icon),
            ]) + ["", "---", ""] + sections(descriptions)
        elif category == "food":
            rel_icon = f"assets/icons/items/food_potions/{slug}.webp"
            rel_content = f"content/items/food_potions/{slug}.md"
            lines = metadata_lines([
                ("id", slug), ("category", "items"), ("item_group", "food_potions"), ("entry_type", "item"),
                ("item_type", row.get("type")), ("title_ru", localized_names["ru"]),
                ("title_en", localized_names["en"]), ("title_zh", localized_names["zh"]),
                ("region", "Снежная"), ("rarity", rarity), ("game_version", VERSION),
                ("source_id", item_id), ("icon", rel_icon),
            ]) + ["", "---", ""] + sections(descriptions)
        elif category == "furniture":
            rel_icon = f"assets/icons/items/serenitea_pot/{slug}.webp"
            rel_content = f"content/items/serenitea_pot/{slug}.md"
            lines = metadata_lines([
                ("id", slug), ("category", "items"), ("item_group", "serenitea_pot"), ("entry_type", "item"),
                ("item_type", "furniture"), ("title_ru", localized_names["ru"]),
                ("title_en", localized_names["en"]), ("title_zh", localized_names["zh"]),
                ("region", "Снежная"), ("rarity", rarity), ("game_version", VERSION),
                ("source_id", item_id), ("icon", rel_icon),
            ]) + ["", "---", ""] + sections(descriptions)
        elif category == "monster":
            rel_icon = f"assets/icons/enemies/common_enemies/{slug}.webp"
            rel_content = f"content/enemies/common_enemies/{slug}.md"
            lines = metadata_lines([
                ("id", slug), ("category", "enemies"), ("enemy_group", enemy_group(row)),
                ("enemy_type", "common_enemy"), ("title_ru", localized_names["ru"]),
                ("title_en", localized_names["en"]), ("title_zh", localized_names["zh"]),
                ("region", "Снежная"), ("game_version", VERSION), ("source_id", item_id), ("icon", rel_icon),
            ]) + ["", "---", ""] + sections(descriptions)
        else:
            continue

        write_markdown(output / rel_content, lines)
        save_icon(downloader, icon, output / rel_icon)
        report[category] = report.get(category, 0) + 1


def prepare_characters(downloader: Downloader, output: Path, ids: list[int], workers: int, report: dict[str, int]) -> None:
    details = localized_details(downloader, "avatar", ids, workers)
    fetters = localized_details(downloader, "avatarFetter", ids, workers)
    for item_id, rows in details.items():
        row = first_row(rows)
        if not row:
            continue
        localized_names = names(rows)
        slug = slugify(row.get("route") or localized_names["en"], f"character_{item_id}")
        rel_icon = f"assets/icons/stories/character/{slug}.webp"
        rel_content = f"content/stories/character_stories/{slug}.md"
        element = ELEMENTS.get(str(row.get("element")), str(row.get("element") or "").lower())
        body: dict[str, list[tuple[str, str]]] = {}
        for lang in LANGS:
            story = fetters.get(item_id, {}).get(lang, {}).get("story") or {}
            ordered = list(story.values()) if isinstance(story, dict) else list(story or [])
            body[lang] = [(clean_text(part.get("title")), clean_text(part.get("text"))) for part in ordered if isinstance(part, dict)]
        lines = metadata_lines([
            ("id", slug), ("category", "stories"), ("story_group", "character_stories"),
            ("title_ru", localized_names["ru"]), ("title_en", localized_names["en"]), ("title_zh", localized_names["zh"]),
            ("region", "Снежная"), ("element", element), ("rarity", row.get("rank")),
            ("game_version", VERSION), ("source_id", item_id), ("icon", rel_icon),
        ]) + [""]
        for lang, label in (("ru", "RU"), ("en", "EN"), ("zh", "ZH")):
            lines.extend([f"## {label}", ""])
            for title, text in body.get(lang, []):
                lines.extend([f"### {title or localized_names[lang]}", "", text, ""])
        write_markdown(output / rel_content, lines)
        save_icon(downloader, str(row.get("icon") or ""), output / rel_icon)
        report["character_stories"] = report.get("character_stories", 0) + 1


def prepare_weapons(downloader: Downloader, output: Path, ids: list[int], workers: int, report: dict[str, int]) -> None:
    details = localized_details(downloader, "weapon", ids, workers)
    requests: list[tuple[str, str]] = []
    for item_id, rows in details.items():
        row = first_row(rows)
        for story_id in row.get("storyId") or []:
            requests.append((str(item_id), f"Weapon{story_id}"))
            break
    lore = localized_readables(downloader, requests, workers)
    for item_id, rows in details.items():
        row = first_row(rows)
        if not row:
            continue
        localized_names = names(rows)
        slug = slugify(row.get("route") or localized_names["en"], f"weapon_{item_id}")
        weapon_type = WEAPON_TYPES.get(str(row.get("type")), "sword")
        rel_icon = f"assets/icons/weapons/{weapon_type}/{slug}.webp"
        rel_content = f"content/weapons/{weapon_type}/{slug}.md"
        body = {}
        for lang in LANGS:
            description = clean_text(rows.get(lang, {}).get("description"))
            history = lore.get(str(item_id), {}).get(lang, "")
            body[lang] = "\n\n### История\n\n".join(filter(None, (description, history)))
        lines = metadata_lines([
            ("id", slug), ("category", "weapons"), ("weapon_type", weapon_type),
            ("title_ru", localized_names["ru"]), ("title_en", localized_names["en"]), ("title_zh", localized_names["zh"]),
            ("rarity", row.get("rank")), ("game_version", VERSION), ("source_id", item_id), ("icon", rel_icon),
        ]) + [""] + sections(body)
        write_markdown(output / rel_content, lines)
        save_icon(downloader, str(row.get("icon") or ""), output / rel_icon)
        report["weapons"] = report.get("weapons", 0) + 1


def prepare_books(downloader: Downloader, output: Path, ids: list[int], workers: int, report: dict[str, int]) -> None:
    details = localized_details(downloader, "book", ids, workers)
    requests: list[tuple[str, str]] = []
    for item_id, rows in details.items():
        row = first_row(rows)
        for volume in row.get("volume") or []:
            if volume.get("storyId"):
                requests.append((f"{item_id}:{volume.get('storyId')}", f"Book{volume['storyId']}"))
    lore = localized_readables(downloader, requests, workers)
    for item_id, rows in details.items():
        row = first_row(rows)
        if not row:
            continue
        localized_names = names(rows)
        slug = slugify(row.get("route") or localized_names["en"], f"book_{item_id}")
        rel_icon = f"assets/icons/books/{slug}.webp"
        rel_content = f"content/books/{slug}.md"
        volumes_by_lang: dict[str, list[dict[str, Any]]] = {lang: list(rows.get(lang, {}).get("volume") or []) for lang in LANGS}
        if not save_icon(downloader, str(row.get("icon") or ""), output / rel_icon, warn=False):
            rel_icon = "assets/icons/books/update_7_document.webp"
            generic_source = ROOT / "assets" / "icons" / "ui" / "books.webp"
            generic_target = output / rel_icon
            generic_target.parent.mkdir(parents=True, exist_ok=True)
            if generic_source.is_file() and not generic_target.is_file():
                shutil.copy2(generic_source, generic_target)
        lines = metadata_lines([
            ("id", slug), ("category", "books"), ("subtype", "book_series"),
            ("title_ru", localized_names["ru"]), ("title_en", localized_names["en"]), ("title_zh", localized_names["zh"]),
            ("region", "Снежная"), ("rarity", row.get("rank")), ("volume_count", len(row.get("volume") or [])),
            ("game_version", VERSION), ("source_id", item_id), ("icon", rel_icon),
        ]) + [""]
        for lang, label in (("ru", "RU"), ("en", "EN"), ("zh", "ZH")):
            lines.extend([f"## {label}", ""])
            for number, volume in enumerate(volumes_by_lang[lang], start=1):
                key = f"{item_id}:{volume.get('storyId')}"
                text = lore.get(key, {}).get(lang) or clean_text(volume.get("description"))
                lines.extend([f"### Том {number}: {clean_text(volume.get('name'))}", "", text, ""])
        write_markdown(output / rel_content, lines)
        report["books"] = report.get("books", 0) + 1


def prepare_artifacts(downloader: Downloader, output: Path, ids: list[int], workers: int, report: dict[str, int]) -> None:
    details = localized_details(downloader, "reliquary", ids, workers)
    requests = [(f"{item_id}:{part}", f"Relic{item_id}_{part}") for item_id in ids for part in range(1, 6)]
    lore = localized_readables(downloader, requests, workers)
    for item_id, rows in details.items():
        row = first_row(rows)
        if not row:
            continue
        localized_names = names(rows)
        slug = slugify(row.get("route") or localized_names["en"], f"artifact_{item_id}")
        rel_icon = f"assets/icons/artifacts/{slug}.webp"
        rel_content = f"content/artifacts/{slug}.md"
        lines = metadata_lines([
            ("id", slug), ("category", "artifacts"), ("title_ru", localized_names["ru"]),
            ("title_en", localized_names["en"]), ("title_zh", localized_names["zh"]),
            ("region", "Снежная"), ("rarity", 5), ("game_version", VERSION), ("source_id", item_id), ("icon", rel_icon),
        ]) + [""]
        for lang, label in (("ru", "RU"), ("en", "EN"), ("zh", "ZH")):
            lines.extend([f"## {label}", ""])
            for part in range(1, 6):
                text = lore.get(f"{item_id}:{part}", {}).get(lang, "")
                lines.extend([f"### {ARTIFACT_PARTS[part - 1]}", "", text, ""])
        write_markdown(output / rel_content, lines)
        save_icon(downloader, str(row.get("icon") or ""), output / rel_icon)
        report["artifacts"] = report.get("artifacts", 0) + 1


def prepare_quests(downloader: Downloader, output: Path, ids: list[int], workers: int, report: dict[str, int]) -> None:
    details = localized_details(downloader, "quest", ids, workers)
    indexes = localized_details(downloader, "quest", [], workers)
    del indexes  # keeps the detail helper focused; the compact index is loaded below
    index_payload = downloader.json(Path("quest-index-en.json"), f"{API}/EN/quest", optional=True) or {}
    index_items = response_data(index_payload).get("items", {}) if isinstance(response_data(index_payload), dict) else {}
    for item_id, rows in details.items():
        if not all(lang in rows for lang in LANGS):
            continue
        index_row = index_items.get(str(item_id), {}) if isinstance(index_items, dict) else {}
        quest_type = str(index_row.get("type") or "WQ").lower()
        if quest_type not in STORY_GROUPS:
            quest_type = "wq"
        try:
            entry, _, warnings = build_entry(item_id, quest_type, rows, {}, {}, VERSION)
            downloader.warnings.extend(warnings)
        except Exception as error:
            downloader._warn(f"quest {item_id}: {error}")
            continue
        group = STORY_GROUPS[quest_type]
        rel_content = f"content/stories/quests/{group}/{entry['id']}.md"
        chapter_icon = str(index_row.get("chapterIcon") or "")
        icon_slug = slugify(re.sub(r"^UI_ChapterIcon_", "", chapter_icon), "quest")
        rel_icon = f"assets/icons/stories/quests/{icon_slug}.webp" if chapter_icon else "assets/icons/ui/quest_icon.webp"
        lines = metadata_lines([
            ("id", entry["id"]), ("category", "stories"), ("story_group", group), ("icon", rel_icon),
            ("title_ru", entry["title"].get("ru")), ("title_en", entry["title"].get("en")), ("title_zh", entry["title"].get("zh")),
            ("region", entry.get("region") or "Снежная"), ("game_version", VERSION), ("source_id", item_id),
            ("chapter_num_ru", entry.get("chapter_num", {}).get("ru")),
            ("chapter_num_en", entry.get("chapter_num", {}).get("en")),
            ("chapter_num_zh", entry.get("chapter_num", {}).get("zh")),
        ]) + [""]
        for lang, label in (("ru", "RU"), ("en", "EN"), ("zh", "ZH")):
            lines.extend([f"## {label}", ""])
            for number, part in enumerate(entry.get("parts") or [], start=1):
                title = clean_text((part.get("title") or {}).get(lang)) or f"Часть {number}"
                lines.extend([f"### {title}", "", clean_text((part.get("text") or {}).get(lang)), ""])
        write_markdown(output / rel_content, lines)
        if chapter_icon:
            save_icon(downloader, chapter_icon, output / rel_icon, LUNARIS_ICON_URL.format(icon=chapter_icon))
        report["quests"] = report.get("quests", 0) + 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--workers", type=int, default=16)
    parser.add_argument("--refresh", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    output = args.output.resolve()
    cache = args.cache.resolve()
    downloader = Downloader(cache, refresh=args.refresh)
    changelog_payload = downloader.json(Path("changelog.json"), CHANGELOG_URL)
    changelog = response_data(changelog_payload)
    version_row = changelog.get("70") if isinstance(changelog, dict) else None
    if not isinstance(version_row, dict) or not isinstance(version_row.get("items"), dict):
        raise RuntimeError("Project Amber changelog does not contain version 7.0")
    source_items = version_row["items"]
    ids = {key: [int(str(value).split("-", 1)[0]) for value in values] for key, values in source_items.items()}
    ids["avatar"] = [item_id for item_id in ids.get("avatar", []) if item_id >= 10000100]
    all_weapon_ids = ids.get("weapon", [])
    ids["weapon"] = [item_id for item_id in all_weapon_ids if item_id < EXCLUDED_WEAPON_SKINS]
    combat_monsters = [item_id for item_id in ids.get("monster", []) if item_id < COMBAT_MONSTER_LIMIT]

    output.mkdir(parents=True, exist_ok=True)
    generic_source = ROOT / "assets" / "icons" / "ui" / "quest_icon.webp"
    if generic_source.is_file():
        generic_target = output / "assets" / "icons" / "ui" / "quest_icon.webp"
        generic_target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(generic_source, generic_target)

    report: dict[str, int] = {}
    prepare_characters(downloader, output, ids.get("avatar", []), args.workers, report)
    prepare_weapons(downloader, output, ids.get("weapon", []), args.workers, report)
    prepare_books(downloader, output, ids.get("book", []), args.workers, report)
    prepare_artifacts(downloader, output, ids.get("reliquary", []), args.workers, report)
    prepare_simple_entries(downloader, output, "material", ids.get("material", []), args.workers, report)
    prepare_simple_entries(downloader, output, "monster", combat_monsters, args.workers, report)
    prepare_quests(downloader, output, ids.get("quest", []), args.workers, report)

    excluded = {
        "weapon_skins": [item_id for item_id in all_weapon_ids if item_id >= EXCLUDED_WEAPON_SKINS],
        "wildlife": [item_id for item_id in ids.get("monster", []) if item_id >= COMBAT_MONSTER_LIMIT],
        "furniture": ids.get("furniture", []),
        "food": ids.get("food", []),
        "namecards": ids.get("namecard", []),
        "gcg": ids.get("gcg", []),
    }
    manifest = {
        "version": VERSION,
        "status": "staged_not_published",
        "sources": {
            "data": "https://gi.yatta.moe/en/changelog?v=70",
            "quest_icons": "https://lunaris.moe/quests",
        },
        "generated": report,
        "source_counts": {key: len(value) for key, value in ids.items()},
        "excluded_from_current_site": excluded,
        "warnings": sorted(set(downloader.warnings)),
    }
    write_json(output / "manifest.json", manifest)
    readme = f"""# Обновление 7.0 — подготовленный пакет

Статус: **не опубликовано**. Файлы в этой папке не подключены к сборке сайта.

Содержимое повторяет структуру корневых папок `content/` и `assets/`. Когда обновление понадобится, его можно проверить, а затем перенести в корень проекта без ручного переименования путей.

Подготовлено записей: {sum(report.values())}. Подробные числа, исключения и предупреждения находятся в `manifest.json`.

Источники: Project Amber (локализованные данные RU/EN/ZH) и Lunaris (иконки глав заданий). Иконки сохранены локально в WebP.
"""
    (output / "README.md").write_text(readme, encoding="utf-8", newline="\n")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
