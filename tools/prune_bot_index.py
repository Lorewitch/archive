#!/usr/bin/env python3
"""Fast, lossless pruning of bot search entries when this archive only removes content.

This is NOT a substitute for the full builder when *adding* new entries.
Run tools/build_bot_mentions_index.py for fresh content additions.
"""
from __future__ import annotations
import collections,hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'
SECTIONS=('books','artifacts','weapons','items','stories')

def main():
    original=json.loads((DATA/'bot_mentions_index.json').read_text(encoding='utf-8'))
    existing={f'{section}:{entry["id"]}' for section in SECTIONS for entry in json.loads((DATA/f'{section}_index.json').read_text(encoding='utf-8'))}
    old_keys={entry['key'] for entry in original['entries']}
    new_keys=existing-old_keys
    if new_keys:raise RuntimeError(f'New or changed entries require tools/build_bot_mentions_index.py: {sorted(new_keys)[:20]}')
    entries=[e for e in original['entries'] if e['key'] in existing]
    def filt_lookup(data):
        return {key:kept for key,values in data.items() if (kept:=[v for v in values if v in existing])}
    related=filt_lookup(original['related_lookup'])
    signature=filt_lookup(original['signature_lookup'])
    phrases=[phrase for phrase in original['mention_phrases'] if phrase.get('key') in existing]
    counts=collections.Counter(e['section'] for e in entries)
    report=original.get('report',{})
    report.update({
       'section_counts':dict(sorted(counts.items())),
       'signature_entries':sum(bool(e.get('signature_aliases')) for e in entries),
       'signature_aliases':sum(len(e.get('signature_aliases') or []) for e in entries),
       'related_terms':sum(len(e.get('related_terms') or []) for e in entries),
       'related_lookup_terms':len(related),
       'signature_lookup_terms':len(signature),
       'mention_phrases':len(phrases),
       'broken_entries':[],
    })
    source_counts={s:len(json.loads((DATA/f'{s}_index.json').read_text(encoding='utf-8'))) for s in SECTIONS}
    original.update({
       'generated_by':'tools/prune_bot_index.py',
       'source_counts':source_counts,
       'entry_count':len(entries),
       'entries':entries,
       'related_lookup':related,
       'signature_lookup':signature,
       'mention_phrases':phrases,
       'report':report,
    })
    dig=hashlib.sha256((json.dumps(entries,ensure_ascii=False,separators=(',',':'))+str(len(phrases))).encode('utf-8')).hexdigest()[:12]
    original['version']='bot_mentions:'+dig
    (DATA/'bot_mentions_index.json').write_text(json.dumps(original,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Pruned bot mentions:', len(entries), 'entries and',len(phrases),'phrases')

if __name__=='__main__':main()
