from pathlib import Path
import tempfile
import unittest

from check_source import assert_clean_text, source_errors


class SourceChecks(unittest.TestCase):
    def test_conflicted_html_is_rejected_before_precaching(self):
        html = '<!doctype html>\n<head>\n' + '<' * 7 + ' HEAD\n<meta name="theme-color">\n' + '=' * 7 + '\n' + '>' * 7 + ' commit\n</head>'
        with self.assertRaisesRegex(ValueError, 'index.html.*3, 5, 6'):
            assert_clean_text(html, 'index.html')

    def test_checker_covers_source_and_skips_git_metadata(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / '.git').mkdir()
            (root / '.git' / 'sample.html').write_text('<' * 7 + ' HEAD\n')
            (root / 'index.html').write_text('<!doctype html>\n')
            self.assertEqual(source_errors(root), [])
            (root / 'app.js').write_text('>' * 7 + ' branch\n')
            self.assertEqual(len(source_errors(root)), 1)
            self.assertIn('app.js', source_errors(root)[0])

    def test_regular_code_and_markdown_are_accepted(self):
        assert_clean_text('# Архив\n---\nconst equal = a === b;\n', 'README.md')


if __name__ == '__main__':
    unittest.main()
