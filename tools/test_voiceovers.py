"""Voice-over imports must not mix character history and spoken lines."""
import tempfile
import unittest
from pathlib import Path

from build_archive import build_generic


class VoiceOverImportTests(unittest.TestCase):
    def test_separate_language_sections_and_stable_source_ids(self):
        source = """# id: test_character
# story_group: character_stories
# title_ru: Персонаж
# title_en: Character
# title_zh: 角色
# voice_source_ids: 101,102

## RU
### История
Исходная история.
## EN
### Story
Original story.
## ZH
### 故事
原来的故事。

## REPLICAS_RU
### Приветствие
Привет!
### Прощание
До встречи.
## REPLICAS_EN
### Hello
Hello!
### Goodbye
See you.
## REPLICAS_ZH
### 初次见面
你好！
### 再见
再见。
"""
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/"character.md"
            path.write_text(source, encoding="utf-8")
            entry = build_generic(path, "stories")
        self.assertEqual(entry["part_count"], 1)
        self.assertEqual(entry["parts"][0]["text"]["ru"], "Исходная история.")
        self.assertEqual(entry["replica_count"], 2)
        self.assertEqual([part["source_id"] for part in entry["replicas"]], [101, 102])
        self.assertEqual(entry["replicas"][1]["text"]["en"], "See you.")
        self.assertEqual(entry["replicas"][1]["text"]["zh"], "再见。")
        self.assertNotIn("Привет", entry["text"]["ru"])

    def test_legacy_character_needs_no_voice_sections(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)/"legacy.md"
            path.write_text("# id: legacy\n# story_group: character_stories\n## RU\n### История\nТекст.\n", encoding="utf-8")
            entry = build_generic(path, "stories")
        self.assertNotIn("replicas", entry)
        self.assertEqual(entry["parts"][0]["text"]["ru"], "Текст.")


if __name__ == "__main__":
    unittest.main()
