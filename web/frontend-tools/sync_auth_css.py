#!/usr/bin/env python3
"""Keep the auth stylesheet used by bundled pages equal to its standalone source."""
from pathlib import Path
import re
import sys


def sync_auth_css(root):
    bundle = root / 'css/sl-bundle-7d.css'
    content = bundle.read_text()
    pattern = re.compile(r'(/\* === css/sl-auth-ui\.css === \*/)[\s\S]*?(?=/\* === css/[^ ]+ === \*/|\Z)')
    if len(list(pattern.finditer(content))) != 1:
        raise ValueError('Expected exactly one named auth CSS section')
    source = (root / 'css/sl-auth-ui.css').read_text().strip()
    # Preserve every unrelated section byte-for-byte, including the legacy minification.
    updated = pattern.sub(lambda match: match[1] + '\n' + source + '\n', content)
    if updated != content:
        bundle.write_text(updated)


if __name__ == '__main__':
    sync_auth_css(Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / 'frontend')
