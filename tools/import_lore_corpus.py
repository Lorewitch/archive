#!/usr/bin/env python3
"""Import the multilingual quest corpus used by the lore archive.

The importer deliberately keeps downloaded responses in tmp/, which is ignored
by git.  Published files contain only the compact archive representation needed
by the site.  Re-running the command resumes from the cache.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import difflib
import html
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Iterable
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CACHE = ROOT / "tmp" / "lore-corpus-cache"
DEFAULT_OUTPUT = ROOT / "data" / "lore_corpus"

LANGS = ("ru", "en", "zh")
API_LANGS = {"ru": "RU", "en": "EN", "zh": "CHS"}
QUEST_TYPES = {
    "aq": "archon_quests",
    "wq": "world_quests",
    "lq": "legend_quests",
    "eq": "event_chronicles",
}
REGION_ORDER = (
    "Мондштадт",
    "Ли Юэ",
    "Инадзума",
    "Сумеру",
    "Фонтейн",
    "Натлан",
    "Нод-Край",
    "Снежная",
    "Каэнри'ах",
    "Тейват",
    "Иной мир",
)
REGION_CATEGORIES = {
    "Мондштадт": "Mondstadt Quests",
    "Ли Юэ": "Liyue Quests",
    "Инадзума": "Inazuma Quests",
    "Сумеру": "Sumeru Quests",
    "Фонтейн": "Fontaine Quests",
    "Натлан": "Natlan Quests",
    "Нод-Край": "Nod-Krai Quests",
    "Снежная": "Snezhnaya Quests",
}
REGION_ALIASES = {
    "mondstadt": "Мондштадт",
    "mengde": "Мондштадт",
    "liyue": "Ли Юэ",
    "inazuma": "Инадзума",
    "sumeru": "Сумеру",
    "fontaine": "Фонтейн",
    "natlan": "Натлан",
    "nod-krai": "Нод-Край",
    "nodkrai": "Нод-Край",
    "snezhnaya": "Снежная",
}
ICON_REGION_TOKENS = {
    "seaalamp": "Ли Юэ",
    "sealamp": "Ли Юэ",
    "lunarite": "Ли Юэ",
    "snowrace": "Мондштадт",
    "fleurfair": "Мондштадт",
    "windblume": "Мондштадт",
    "wintercamp": "Мондштадт",
    "dragonspine": "Мондштадт",
    "goldenapple": "Мондштадт",
    "aster": "Мондштадт",
    "summertime": "Мондштадт",
    "vintage": "Мондштадт",
    "alchemysim": "Мондштадт",
    "bubbledrama": "Мондштадт",
    "penumbraadventure": "Иной мир",
    "fairytales": "Иной мир",
    "irodori": "Инадзума",
    "onmyomaze": "Инадзума",
    "mikawaflower": "Инадзума",
    "greatfestival": "Инадзума",
    "michiaematsuri": "Инадзума",
    "brickbreaker": "Инадзума",
    "akafes": "Сумеру",
    "fungusfighter": "Сумеру",
    "deshret": "Сумеру",
    "sumerubirth": "Сумеру",
    "sumeruadventure": "Сумеру",
    "rainbowprince": "Фонтейн",
    "filmfest": "Фонтейн",
    "ceremony": "Натлан",
    "natlandrill": "Натлан",
    "nodkraitour": "Нод-Край",
    "nodkrai": "Нод-Край",
}
TITLE_REGION_TOKENS = {
    "lantern rite": "Ли Юэ",
    "liyue theater mechanicus": "Ли Юэ",
    "wangshu": "Ли Юэ",
    "wanmin": "Ли Юэ",
    "good hunter": "Мондштадт",
    "archipelago": "Мондштадт",
    "moon bathed deep": "Инадзума",
    "strange story in konda": "Инадзума",
    "nilotpala cup": "Сумеру",
    "qingce": "Ли Юэ",
}
TYPE_LABELS = {
    "archon_quests": {"ru": "Задания Архонтов", "en": "Archon Quests", "zh": "魔神任务"},
    "world_quests": {"ru": "Задания мира", "en": "World Quests", "zh": "世界任务"},
    "legend_quests": {"ru": "Задания Легенд", "en": "Story Quests", "zh": "传说任务"},
    "event_chronicles": {"ru": "Хроники событий", "en": "Event Chronicles", "zh": "活动纪事"},
}
FALLBACK_PART = {"ru": "Без названия", "en": "Untitled", "zh": "未命名"}
SCENE_LABEL = {"ru": "Сцена", "en": "Scene", "zh": "场景"}
TRAVELER_LABEL = {"ru": "Путешественник", "en": "Traveler", "zh": "旅行者"}
DYNAMIC_NAME_LABELS = {
    "ru": {"1": "Странник", "2": "Малыш"},
    "en": {"1": "Wanderer", "2": "Little One"},
    "zh": {"1": "流浪者", "2": "小家伙"},
}
TRAVELER_NAMES = {
    "ru": {"PLAYERAVATAR": "Итэр/Люмин", "MATEAVATAR": "Люмин/Итэр"},
    "en": {"PLAYERAVATAR": "Aether/Lumine", "MATEAVATAR": "Lumine/Aether"},
    "zh": {"PLAYERAVATAR": "空/荧", "MATEAVATAR": "荧/空"},
}
DYNAMIC_VALUE_LABELS = {
    "ru": {"TMPVALUE": "выбранное имя", "ABYSSWAR": "число павших"},
    "en": {"TMPVALUE": "chosen name", "ABYSSWAR": "number of fallen warriors"},
    "zh": {"TMPVALUE": "选定的名字", "ABYSSWAR": "阵亡勇士人数"},
}
PUZZLE_SYMBOLS = {"E000": "◆", "E001": "●", "E002": "▲"}


def write_json(path: Path, value: Any, *, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":") if compact else None,
        indent=None if compact else 2,
    )
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(payload, encoding="utf-8", newline="\n")
    temporary.replace(path)


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def request_json(url: str, *, attempts: int = 5) -> Any:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "LoreArchiveImporter/1.0",
        },
    )
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            last_error = error
            if attempt + 1 < attempts:
                time.sleep(min(8, 1.5 * (attempt + 1)))
    raise RuntimeError(f"Не удалось получить {url}: {last_error}")


def cached_json(path: Path, url: str) -> Any:
    if path.is_file():
        return read_json(path)
    value = request_json(url)
    write_json(path, value, compact=True)
    return value


def response_data(payload: Any, owner: str) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise RuntimeError(f"{owner}: API вернул не объект")
    if payload.get("code") not in (None, 200):
        raise RuntimeError(f"{owner}: API вернул ошибку {payload.get('code')}")
    data = payload.get("data")
    if not isinstance(data, dict):
        raise RuntimeError(f"{owner}: в ответе нет data")
    return data


def ordered_records(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [row for row in value if isinstance(row, dict)]
    if not isinstance(value, dict):
        return []

    def key(item: tuple[str, Any]) -> tuple[int, int | str]:
        raw = str(item[0])
        return (0, int(raw)) if raw.isdigit() else (1, raw)

    return [row for _, row in sorted(value.items(), key=key) if isinstance(row, dict)]


def normalize_title(value: str) -> str:
    text = html.unescape(str(value or ""))
    text = re.sub(r"\s*\((?:quest|commission|event quest|story quest)\)\s*$", "", text, flags=re.I)
    text = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    text = re.sub(r"[^a-z0-9]+", " ", text.casefold())
    return " ".join(text.split())


def clean_game_text(value: Any, lang: str = "") -> str:
    text = html.unescape(str(value or ""))
    text = text.replace("\\n", "\n").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"<color(?:=[^>]*)?>", "", text, flags=re.I)
    text = re.sub(r"</color>", "", text, flags=re.I)
    text = re.sub(r"<size(?:=[^>]*)?>|</size>", "", text, flags=re.I)
    text = re.sub(r"<i>(.*?)</i>", r"*\1*", text, flags=re.I | re.S)
    text = re.sub(r"<b>(.*?)</b>", r"**\1**", text, flags=re.I | re.S)
    text = re.sub(r"\{LINK#[^}]+\}|\{/LINK\}", "", text, flags=re.I)
    text = re.sub(r"\{SPRITE#[^}]+\}", "", text, flags=re.I)
    text = text.replace("$UNRELEASED", "").replace("$HIDDEN", "")
    text = re.sub(r"\{RUBY#\[[^]]*\]([^{}]*)\}", r"\1", text, flags=re.I)
    text = re.sub(r"\{B#([^{}]*)\}", r"\1", text, flags=re.I)
    text = text.replace("{NON_BREAK_SPACE}", "\u00a0")
    text = re.sub(
        r"\{REALNAME\[ID\((\d+)\)[^}]*\]\}",
        lambda match: DYNAMIC_NAME_LABELS.get(lang, DYNAMIC_NAME_LABELS["en"]).get(match.group(1), TRAVELER_LABEL.get(lang, "Traveler")),
        text,
        flags=re.I,
    )
    text = re.sub(
        r"\{(PLAYERAVATAR|MATEAVATAR)#SEXPRO\[[^}]+\]\}",
        lambda match: TRAVELER_NAMES.get(lang, TRAVELER_NAMES["en"])[match.group(1).upper()],
        text,
        flags=re.I,
    )
    text = re.sub(
        r"\{REGEX#UNICODE\[(E\d+)\]\}",
        lambda match: PUZZLE_SYMBOLS.get(match.group(1).upper(), "◇"),
        text,
        flags=re.I,
    )
    text = re.sub(
        r"\{TMPVALUE\([^}]+\)\}",
        lambda _match: f"[{DYNAMIC_VALUE_LABELS.get(lang, DYNAMIC_VALUE_LABELS['en'])['TMPVALUE']}]",
        text,
        flags=re.I,
    )
    text = re.sub(
        r"\{ABYSSWAR#[^}]+\}",
        lambda _match: f"[{DYNAMIC_VALUE_LABELS.get(lang, DYNAMIC_VALUE_LABELS['en'])['ABYSSWAR']}]",
        text,
        flags=re.I,
    )
    text = re.sub(
        r"#?\{M#([^{}]*)\}\{F#([^{}]*)\}",
        lambda match: f"{match.group(1)} / {match.group(2)}",
        text,
    )
    text = re.sub(r"\{F#([^{}]*)\}", lambda match: f"({match.group(1)})", text)
    text = re.sub(r"\{M#([^{}]*)\}", lambda match: f"({match.group(1)})", text)
    nickname = TRAVELER_LABEL.get(lang, "Traveler")
    text = text.replace("{NICKNAME}", nickname)
    text = re.sub(r"(?m)^#(?=\S)", "", text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def markdown_role(value: str) -> str:
    return clean_game_text(value).replace("*", "\\*").replace("_", "\\_")


def item_number(value: Any) -> tuple[int, str]:
    match = re.search(r"\d+", str(value or ""))
    return (int(match.group(0)), str(value)) if match else (10**18, str(value))


def render_dialogue_items(items: Any, lang: str) -> list[str]:
    if not isinstance(items, dict):
        return []
    output: list[str] = []
    seen_lines: set[tuple[str, str, str]] = set()
    choice_texts: set[str] = set()

    for item_id, item in items.items():
        if not isinstance(item, dict):
            continue
        item_type = str(item.get("type") or "")
        if "Multi" not in item_type and "Player" not in item_type and "player" not in str(item_id):
            continue
        for text_row in item.get("text") or []:
            if isinstance(text_row, dict):
                prepared = clean_game_text(text_row.get("text"), lang)
                if prepared:
                    choice_texts.add(prepared)

    for item_id, item in sorted(items.items(), key=lambda pair: item_number(pair[0])):
        if not isinstance(item, dict):
            continue
        role = markdown_role(clean_game_text(item.get("role", ""), lang))
        item_type = str(item.get("type") or "")
        is_choice = not role and ("Multi" in item_type or "Player" in item_type or "player" in str(item_id))
        for text_row in item.get("text") or []:
            if not isinstance(text_row, dict):
                continue
            text = clean_game_text(text_row.get("text"), lang)
            if not text:
                continue
            signature = (str(item_id), role, text)
            if signature in seen_lines:
                continue
            seen_lines.add(signature)
            if role:
                output.append(f"**{role}:** {text}")
            elif is_choice:
                output.append(f"- **{TRAVELER_LABEL[lang]}:** {text}")
            elif text in choice_texts:
                continue
            elif item.get("isBlackScreen"):
                output.append(f"*{text}*")
            else:
                output.append(text)
    return output


def render_main_quest(main_quest: dict[str, Any], lang: str) -> str:
    info = main_quest.get("info") if isinstance(main_quest.get("info"), dict) else {}
    blocks: list[str] = []
    description = clean_game_text(info.get("description"), lang)
    if description:
        blocks.append(description)

    for step in ordered_records(main_quest.get("story")):
        raw_title = str(step.get("title") or "")
        normalized_raw_title = raw_title.casefold()
        if any(marker in normalized_raw_title for marker in ("(test)", "（test）", "$hidden", "$unreleased")):
            continue
        title = clean_game_text(step.get("title"), lang)
        task_blocks: list[str] = []
        for task in step.get("taskData") or []:
            if not isinstance(task, dict):
                continue
            lines = render_dialogue_items(task.get("items"), lang)
            if lines:
                task_blocks.append("\n\n".join(lines))
        if not task_blocks:
            continue
        heading = title or SCENE_LABEL[lang]
        blocks.append(f"#### {heading}\n\n" + "\n\n".join(task_blocks))
    return "\n\n".join(blocks).strip()


def story_map(detail: dict[str, Any]) -> dict[int, dict[str, Any]]:
    result: dict[int, dict[str, Any]] = {}
    for row in ordered_records(detail.get("storyList")):
        try:
            result[int(row.get("id"))] = row
        except (TypeError, ValueError):
            continue
    return result


def localized_info(details: dict[str, dict[str, Any]], field: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for lang in LANGS:
        info = details[lang].get("info") if isinstance(details[lang].get("info"), dict) else {}
        result[lang] = clean_game_text(info.get(field), lang)
    return result


def localized_main_info(rows: dict[str, dict[str, Any]], field: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for lang in LANGS:
        info = rows[lang].get("info") if isinstance(rows[lang].get("info"), dict) else {}
        result[lang] = clean_game_text(info.get(field), lang)
    return result


def build_character_regions() -> dict[str, str]:
    path = ROOT / "data" / "stories_index.json"
    if not path.is_file():
        return {}
    result: dict[str, str] = {}
    for row in read_json(path):
        if row.get("story_group") != "character_stories":
            continue
        title = row.get("title") if isinstance(row.get("title"), dict) else {}
        key = normalize_title(title.get("en", ""))
        if key and row.get("region"):
            result[key] = str(row["region"])
    return result


def wiki_region_titles(cache_dir: Path, *, refresh: bool = False) -> dict[str, set[str]]:
    cache_path = cache_dir / "wiki_regions.json"
    if cache_path.is_file() and not refresh:
        raw = read_json(cache_path)
        return {region: set(titles) for region, titles in raw.items()}

    result: dict[str, set[str]] = {}
    base = "https://genshin-impact.fandom.com/api.php"
    for region, category in REGION_CATEGORIES.items():
        titles: set[str] = set()
        continuation = ""
        while True:
            query = {
                "action": "query",
                "list": "categorymembers",
                "cmtitle": f"Category:{category}",
                "cmnamespace": "0",
                "cmlimit": "500",
                "format": "json",
                "formatversion": "2",
            }
            if continuation:
                query["cmcontinue"] = continuation
            payload = request_json(base + "?" + urllib.parse.urlencode(query))
            members = payload.get("query", {}).get("categorymembers", [])
            for member in members:
                normalized = normalize_title(member.get("title", ""))
                if normalized:
                    titles.add(normalized)
            continuation = str(payload.get("continue", {}).get("cmcontinue") or "")
            if not continuation:
                break
        result[region] = titles
    write_json(cache_path, {region: sorted(titles) for region, titles in result.items()}, compact=True)
    return result


def direct_region(info: dict[str, Any]) -> str:
    image_title = normalize_title(info.get("chapterImageTitle", ""))
    if image_title in REGION_ALIASES:
        return REGION_ALIASES[image_title]
    icon = re.sub(r"[^a-z]", "", str(info.get("chapterIcon") or "").casefold())
    for token, region in ICON_REGION_TOKENS.items():
        if token in icon:
            return region
    for token, region in REGION_ALIASES.items():
        compact = token.replace("-", "").replace(" ", "")
        if compact and compact in icon:
            return region
    title = normalize_title(" ".join(str(info.get(field) or "") for field in ("chapterTitle", "route")))
    for token, region in TITLE_REGION_TOKENS.items():
        if token in title:
            return region
    return ""


def classify_regions(
    quest_type: str,
    details: dict[str, dict[str, Any]],
    region_titles: dict[str, set[str]],
    character_regions: dict[str, str],
) -> list[str]:
    english = details["en"]
    info = english.get("info") if isinstance(english.get("info"), dict) else {}
    regions: set[str] = set()

    prepared = direct_region(info)
    if prepared:
        regions.add(prepared)

    if prepared and quest_type in {"aq", "lq"}:
        return [prepared]

    image_title = normalize_title(info.get("chapterImageTitle", ""))
    if quest_type == "lq" and image_title in character_regions:
        regions.add(character_regions[image_title])

    english_titles = {
        normalize_title((row.get("info") or {}).get("title", ""))
        for row in story_map(english).values()
        if isinstance(row.get("info"), dict)
    }
    english_titles.add(normalize_title(info.get("chapterTitle", "")))
    english_titles.discard("")
    for region, titles in region_titles.items():
        if english_titles & titles:
            regions.add(region)

    if not regions:
        fuzzy_matches: list[tuple[float, str]] = []
        for query in english_titles:
            if len(query) < 14:
                continue
            for region, titles in region_titles.items():
                candidates = difflib.get_close_matches(query, titles, n=1, cutoff=0.9)
                if candidates:
                    fuzzy_matches.append((difflib.SequenceMatcher(None, query, candidates[0]).ratio(), region))
        if fuzzy_matches:
            best_score = max(score for score, _ in fuzzy_matches)
            best_regions = {region for score, region in fuzzy_matches if score >= best_score - 0.015}
            if len(best_regions) == 1:
                regions.update(best_regions)

    if not regions:
        regions.add("Тейват")
    return sorted(regions, key=lambda value: REGION_ORDER.index(value) if value in REGION_ORDER else len(REGION_ORDER))


def is_technical_main_quest(rows: dict[str, dict[str, Any]]) -> bool:
    titles = []
    for lang in LANGS:
        info = rows[lang].get("info") if isinstance(rows[lang].get("info"), dict) else {}
        titles.append(str(info.get("title") or ""))
    joined = " ".join(titles).casefold()
    markers = (
        "$hidden",
        "(test)",
        "appearance control logic",
        "first stage ended",
        "rollback isolation",
    )
    return any(marker in joined for marker in markers)


def is_unreleased_chapter(details: dict[str, dict[str, Any]], quest_type: str) -> bool:
    if quest_type == "eq":
        return False
    for lang in LANGS:
        info = details[lang].get("info") if isinstance(details[lang].get("info"), dict) else {}
        if "$unreleased" in str(info.get("chapterTitle") or "").casefold():
            return True
    return False


def build_entry(
    chapter_id: int,
    quest_type: str,
    details: dict[str, dict[str, Any]],
    region_titles: dict[str, set[str]],
    character_regions: dict[str, str],
    game_version: str,
) -> tuple[dict[str, Any], dict[str, Any], list[str]]:
    story_group = QUEST_TYPES[quest_type]
    title = localized_info(details, "chapterTitle")
    chapter_num = localized_info(details, "chapterNum")
    maps = {lang: story_map(details[lang]) for lang in LANGS}
    common_ids = set.intersection(*(set(rows) for rows in maps.values()))
    all_ids = set.union(*(set(rows) for rows in maps.values()))
    missing = [f"chapter {chapter_id}: main quest {main_id} отсутствует не во всех языках" for main_id in sorted(all_ids - common_ids)]

    parts: list[dict[str, Any]] = []
    descriptions: dict[str, list[str]] = {lang: [] for lang in LANGS}
    for number, main_id in enumerate(sorted(common_ids), start=1):
        rows = {lang: maps[lang][main_id] for lang in LANGS}
        if is_technical_main_quest(rows):
            continue
        part_title = localized_main_info(rows, "title")
        for lang in LANGS:
            if not part_title[lang]:
                part_title[lang] = f"{FALLBACK_PART[lang]} {main_id}"
            info = rows[lang].get("info") if isinstance(rows[lang].get("info"), dict) else {}
            description = clean_game_text(info.get("description"), lang)
            if description:
                descriptions[lang].append(description)
        text = {lang: render_main_quest(rows[lang], lang) for lang in LANGS}
        if not any(text.values()):
            continue
        parts.append({
            "number": len(parts) + 1,
            "source_id": main_id,
            "title": part_title,
            "text": text,
        })

    if not any(title.values()) and parts:
        title = dict(parts[0]["title"])
    for lang in LANGS:
        if not title.get(lang):
            title[lang] = f"{TYPE_LABELS[story_group][lang]} {chapter_id}"

    regions = classify_regions(quest_type, details, region_titles, character_regions)
    entry_id = f"quest_{quest_type}_{chapter_id}"
    detail_path = f"data/lore_corpus/{entry_id}.json"
    detail = {
        "id": entry_id,
        "category": "stories",
        "story_group": story_group,
        "category_type": story_group,
        "title": title,
        "chapter_num": chapter_num,
        "region": ", ".join(regions),
        "filter_regions": regions,
        "languages": list(LANGS),
        "part_count": len(parts),
        "parts": parts,
        "description": {lang: "\n\n".join(descriptions[lang]) for lang in LANGS},
        "data_version": game_version,
        "source_id": chapter_id,
    }
    index = {
        "id": entry_id,
        "category": "stories",
        "story_group": story_group,
        "category_type": story_group,
        "title": title,
        "chapter_num": chapter_num,
        "region": detail["region"],
        "filter_regions": regions,
        "languages": list(LANGS),
        "part_count": len(parts),
        "detail_path": detail_path,
        "data_version": game_version,
        "source_id": chapter_id,
        "search_text": " ".join(
            str(value)
            for value in (
                *title.values(),
                *chapter_num.values(),
                detail["region"],
                story_group,
                *(part["title"][lang] for part in parts for lang in LANGS),
            )
            if value
        ).casefold(),
    }
    return detail, index, missing


def fetch_indexes(cache_dir: Path, *, refresh: bool = False) -> dict[str, dict[int, dict[str, Any]]]:
    result: dict[str, dict[int, dict[str, Any]]] = {}
    for lang in LANGS:
        cache_path = cache_dir / "index" / f"{lang}.json"
        if refresh and cache_path.exists():
            cache_path.unlink()
        payload = cached_json(cache_path, f"https://gi.yatta.moe/api/v2/{API_LANGS[lang]}/quest")
        data = response_data(payload, f"index/{lang}")
        items = data.get("items") if isinstance(data.get("items"), dict) else {}
        result[lang] = {int(key): value for key, value in items.items() if isinstance(value, dict)}
    return result


def fetch_detail(cache_dir: Path, lang: str, chapter_id: int, refresh: bool) -> dict[str, Any]:
    cache_path = cache_dir / "details" / lang / f"{chapter_id}.json"
    if refresh and cache_path.exists():
        cache_path.unlink()
    payload = cached_json(
        cache_path,
        f"https://gi.yatta.moe/api/v2/{API_LANGS[lang]}/quest/{chapter_id}",
    )
    return response_data(payload, f"quest/{lang}/{chapter_id}")


def remove_stale_output(output_dir: Path, expected: set[str]) -> None:
    if not output_dir.is_dir():
        return
    for path in output_dir.glob("quest_*.json"):
        if path.name not in expected:
            path.unlink()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Импортировать корпус заданий RU/EN/ZH")
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--types", default=",".join(QUEST_TYPES), help="aq,wq,lq,eq")
    parser.add_argument("--limit", type=int, default=0, help="ограничить число цепочек для теста")
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--version", default="6.7")
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--refresh-regions", action="store_true")
    parser.add_argument("--skip-regions", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    selected_types = [value.strip().lower() for value in args.types.split(",") if value.strip()]
    unknown_types = sorted(set(selected_types) - set(QUEST_TYPES))
    if unknown_types:
        raise RuntimeError("Неизвестные типы: " + ", ".join(unknown_types))

    indexes = fetch_indexes(args.cache, refresh=args.refresh)
    common_ids = set.intersection(*(set(index) for index in indexes.values()))
    selected_ids = sorted(
        chapter_id
        for chapter_id in common_ids
        if str(indexes["en"][chapter_id].get("type") or "").lower() in selected_types
    )
    if args.limit > 0:
        selected_ids = selected_ids[: args.limit]

    print(f"Цепочек к загрузке: {len(selected_ids)}")
    details: dict[tuple[int, str], dict[str, Any]] = {}
    jobs = [(chapter_id, lang) for chapter_id in selected_ids for lang in LANGS]
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        future_jobs = {
            pool.submit(fetch_detail, args.cache, lang, chapter_id, args.refresh): (chapter_id, lang)
            for chapter_id, lang in jobs
        }
        completed = 0
        for future in concurrent.futures.as_completed(future_jobs):
            chapter_id, lang = future_jobs[future]
            details[(chapter_id, lang)] = future.result()
            completed += 1
            if completed % 100 == 0 or completed == len(jobs):
                print(f"Загружено языковых файлов: {completed}/{len(jobs)}")

    region_titles = {} if args.skip_regions else wiki_region_titles(args.cache, refresh=args.refresh_regions)
    character_regions = build_character_regions()
    args.output.mkdir(parents=True, exist_ok=True)
    index_rows: list[dict[str, Any]] = []
    warnings: list[str] = []
    counts = {QUEST_TYPES[key]: 0 for key in selected_types}

    for position, chapter_id in enumerate(selected_ids, start=1):
        quest_type = str(indexes["en"][chapter_id].get("type") or "").lower()
        localized = {lang: dict(details[(chapter_id, lang)]) for lang in LANGS}
        for lang in LANGS:
            info = dict(localized[lang].get("info") or {})
            for field in ("chapterNum", "chapterTitle", "chapterIcon", "chapterImageTitle", "route"):
                if not info.get(field) and indexes[lang][chapter_id].get(field):
                    info[field] = indexes[lang][chapter_id][field]
            localized[lang]["info"] = info
        if is_unreleased_chapter(localized, quest_type):
            warnings.append(f"chapter {chapter_id}: исключена незавершённая несобытийная цепочка")
            continue
        detail, index, entry_warnings = build_entry(
            chapter_id,
            quest_type,
            localized,
            region_titles,
            character_regions,
            args.version,
        )
        warnings.extend(entry_warnings)
        if not detail["parts"]:
            warnings.append(f"chapter {chapter_id}: нет отображаемого текста")
            continue
        write_json(args.output / f"{detail['id']}.json", detail, compact=True)
        index_rows.append(index)
        counts[detail["story_group"]] += 1
        if position % 100 == 0 or position == len(selected_ids):
            print(f"Собрано цепочек: {position}/{len(selected_ids)}")

    index_rows.sort(key=lambda row: (row["story_group"], row["title"].get("ru", ""), row["id"]))
    write_json(args.output / "index.json", index_rows, compact=True)
    write_json(args.output / "search.json", [
        {"id": row["id"], "search_text": row["search_text"]}
        for row in index_rows
    ], compact=True)
    write_json(args.output / "manifest.json", {
        "data_version": args.version,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "languages": list(LANGS),
        "counts": counts,
        "entry_count": len(index_rows),
        "warning_count": len(warnings),
    })
    write_json(args.output / "import_report.json", {"warnings": warnings})
    remove_stale_output(args.output, {f"{row['id']}.json" for row in index_rows})

    print("Готово:", len(index_rows), "цепочек")
    print("Предупреждений:", len(warnings))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
