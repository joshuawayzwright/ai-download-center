#!/usr/bin/env python3
"""Stage only reviewed public-directory assets; never publish the repository root."""
from pathlib import Path
import shutil

PUBLIC_FILES = (
    '.nojekyll', 'LICENSE',
    'index.html', 'featured-thanks.html', 'creator-studio.html',
    'coding-assistants.html', 'image-generators.html', 'local-ai-apps.html',
    'privacy.html', 'terms.html',
    'app.js', 'config.js', 'hf-classify.js', 'creator-studio.js',
    'styles.css', 'guide.css', 'creator-studio.css', 'favicon.svg',
    'data/tools.json', 'youtube-channel-kit.md',
    'robots.txt', 'sitemap.xml',
    'googled453b50bed92b924.html', 'd20756a2b7842282703f9c37069d3fe8.txt',
)


def build(root):
    root = Path(root).resolve()
    output = root / '_site'
    # Validate every source before replacing any previous staged output.
    for name in PUBLIC_FILES:
        source = root / name
        if not source.is_file() or source.is_symlink():
            raise ValueError(f'Missing or symlinked public asset: {name}')
        if any(parent.is_symlink() for parent in source.parents if parent != root):
            raise ValueError(f'Symlinked parent for public asset: {name}')
        if not source.resolve().is_relative_to(root):
            raise ValueError(f'Public asset escapes repository: {name}')
    if output.is_symlink():
        raise ValueError('Refusing symlinked _site output')
    if output.exists():
        shutil.rmtree(output)
    output.mkdir()
    for name in PUBLIC_FILES:
        destination = output / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / name, destination)
    return output


if __name__ == '__main__':
    destination = build(Path(__file__).resolve().parents[1])
    print(f'Staged {len(PUBLIC_FILES)} approved public files in {destination.name}/')
