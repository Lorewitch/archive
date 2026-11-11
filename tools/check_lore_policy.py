#!/usr/bin/env python3
"""Verify the curated lore-only archive before publishing or rebuilding bot data."""
from __future__ import annotations
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def ids_in(section: str) -> list[dict]:
    return json.loads((ROOT/'data'/f'{section}_index.json').read_text(encoding='utf-8'))

def main() -> None:
    stories = ids_in('stories')
    quests = [x for x in stories if x.get('story_group') != 'character_stories']
    invalid = [(x['id'],x.get('story_group')) for x in quests if x.get('story_group') not in ('archon_quests', 'world_quests', 'legend_quests')]
    if invalid:
        raise SystemExit(f'Unexpected quest groups: {invalid[:10]}')
    whitelist = json.loads((ROOT/'curation/keep_world_quests.json').read_text(encoding='utf-8'))
    allowed_ids = {entry for group in whitelist['groups'].values() for entry in group}
    actual_ids = {x['id'] for x in quests if x.get('story_group') == 'world_quests'}
    if actual_ids != allowed_ids:
        raise SystemExit(f'World-quest whitelist mismatch: extra={sorted(actual_ids-allowed_ids)[:10]}, missing={sorted(allowed_ids-actual_ids)[:10]}')
    source_ids = {p.stem for p in (ROOT/'content/stories/quests/world_quests').glob('*.md')}
    if source_ids != allowed_ids:
        raise SystemExit(f'Source whitelist mismatch: extra={sorted(source_ids-allowed_ids)[:10]}, missing={sorted(allowed_ids-source_ids)[:10]}')
    import csv
    with (ROOT/'curation/review_all_quests_and_teapot.csv').open(encoding='utf-8-sig',newline='') as f:
        rows = list(csv.DictReader(f))
    legend_keep = {r['id'] for r in rows if r['group'] == 'legend_quests' and r['decision'] == 'KEEP'}
    actual_legends = {x['id'] for x in quests if x.get('story_group') == 'legend_quests'}
    source_legends = {p.stem for p in (ROOT/'content/stories/quests/legend_quests').glob('*.md')}
    if actual_legends != legend_keep or source_legends != legend_keep:
        raise SystemExit(f'Legend-quest selection mismatch: expected={len(legend_keep)}, catalog={len(actual_legends)}, sources={len(source_legends)}')
    pot_entries = [x for x in ids_in('items') if x.get('item_group') == 'serenitea_pot']
    non_blueprints = [(x['id'], x.get('item_type')) for x in pot_entries if x.get('item_type') != 'blueprint']
    if non_blueprints:
        raise SystemExit(f'Non-lore resources in Serenitea Pot: {non_blueprints[:10]}')
    print(f'Лорная политика: OK; Архонты: {sum(x.get("story_group")=="archon_quests" for x in quests)}, '
          f'крупные задания мира: {len(actual_ids)}, задания легенд: {len(actual_legends)}, истории персонажей: {len(stories)-len(quests)}, чертежи: {len(pot_entries)}')

if __name__ == '__main__':
    main()
