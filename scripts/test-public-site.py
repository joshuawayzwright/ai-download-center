#!/usr/bin/env python3
"""Offline regression checks for the Pages artifact boundary and dependencies."""
import importlib.util
from pathlib import Path
import re
import tempfile
import unittest
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('public_site', ROOT / 'scripts/build-public-site.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PublicSiteTests(unittest.TestCase):
    def fixture(self, root):
        for name in module.PUBLIC_FILES:
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('public fixture')

    def test_exact_allowlist_and_clean_output(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.fixture(root)
            forbidden = ['.env', '.env.production', 'new-file.html', 'source.zip',
                         'docs/private.md', 'powerhouse-website/api/solo-chat.js',
                         '.git/config', 'apps/solo-android/private.txt']
            for name in forbidden:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('must not publish')
            (root / '_site').mkdir()
            (root / '_site/stale-private.txt').write_text('old artifact')
            out = module.build(root)
            actual = {p.relative_to(out).as_posix() for p in out.rglob('*') if p.is_file()}
            self.assertEqual(actual, set(module.PUBLIC_FILES))

    def test_missing_asset_fails_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.fixture(root)
            (root / 'config.js').unlink()
            with self.assertRaises(ValueError):
                module.build(root)
            self.assertFalse((root / '_site').exists())

    def test_source_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.fixture(root)
            (root / 'config.js').unlink()
            (root / 'config.js').symlink_to(root / 'app.js')
            with self.assertRaises(ValueError):
                module.build(root)

    def test_parent_directory_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.fixture(root)
            (root / "data").rename(root / "alternate-data")
            (root / "data").symlink_to(root / "alternate-data", target_is_directory=True)
            with self.assertRaises(ValueError):
                module.build(root)

    def test_output_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            self.fixture(root)
            (root / '_site').symlink_to(root / 'data', target_is_directory=True)
            with self.assertRaises(ValueError):
                module.build(root)
            self.assertTrue((root / 'data/tools.json').exists())

    def test_real_asset_bytes_and_local_dependencies(self):
        out = module.build(ROOT)
        for name in module.PUBLIC_FILES:
            self.assertEqual((out / name).read_bytes(), (ROOT / name).read_bytes(), name)
            if Path(name).suffix not in ('.html', '.js', '.css', '.xml', '.txt'):
                continue
            text = (out / name).read_text()
            refs = re.findall(r'''(?:href|src|action)=["']([^"']+)|fetch\(["']([^"']+)|url\(["']?([^\)"']+)''', text)
            for group in refs:
                for ref in filter(None, group):
                    if '${' in ref or ref.startswith('#'):
                        continue
                    parsed = urlsplit(ref)
                    if parsed.scheme or parsed.netloc:
                        continue
                    self.assertTrue((out / name).parent.joinpath(unquote(parsed.path)).is_file(), (name, ref))
        # Preserve every existing sitemap page and check artifact-only publication.
        for url in re.findall(r'<loc>([^<]+)</loc>', (out / 'sitemap.xml').read_text()):
            path = urlsplit(url).path.removeprefix('/ai-download-center/').strip('/') or 'index.html'
            self.assertTrue((out / path).is_file(), url)
        workflow = (ROOT / '.github/workflows/pages.yml').read_text()
        self.assertIn('          path: _site', workflow)
        self.assertNotIn('          path: .\n', workflow)
        # Runtime catalog fetch and public Creator Studio download guide are explicit dependencies.
        self.assertIn('data/tools.json', module.PUBLIC_FILES)
        self.assertIn('youtube-channel-kit.md', module.PUBLIC_FILES)
        self.assertNotIn('README.md', module.PUBLIC_FILES)
        self.assertFalse((out / 'powerhouse-website').exists())
        self.assertFalse((out / 'docs').exists())
        self.assertFalse(list(out.rglob('*.zip')))


if __name__ == '__main__':
    unittest.main()
