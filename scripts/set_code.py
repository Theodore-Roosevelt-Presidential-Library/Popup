#!/usr/bin/env python3
"""Change the builder's four-digit code.

    python3 scripts/set_code.py 4821

Rewrites the GATE line in <builder folder>/builder.js with a new salt and hash, then commit and push.
The code is a courtesy gate: the builder is a static public page and cannot change the live site.
"""
import hashlib
import pathlib
import re
import secrets
import sys

root = pathlib.Path(__file__).resolve().parent.parent
if len(sys.argv) != 2 or not re.fullmatch(r"\d{4}", sys.argv[1]):
    sys.exit("usage: python3 scripts/set_code.py <four digits>")
files = list(root.glob("*/builder.js"))
if len(files) != 1:
    sys.exit("Could not find exactly one builder.js")
salt = secrets.token_hex(8)
digest = hashlib.sha256(f"{salt}:{sys.argv[1]}".encode()).hexdigest()
src = files[0].read_text()
new, n = re.subn(r'var GATE = \{[^}]*\};', f'var GATE = {{ salt: "{salt}", hash: "{digest}" }};', src)
if n != 1:
    sys.exit("GATE line not found")
files[0].write_text(new)
print(f"Code updated in {files[0].relative_to(root)}. Editors will be asked for the new code once.")
