#!/usr/bin/env python3
"""Copy trlibrary.com's sitemap into data/sitemap.json for the builder.

Run nightly by .github/workflows/sitemap.yml. Standard library only.
Keeps the previous file if the fetch fails or the result looks wrong.
"""
import datetime
import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request

SOURCE = "https://www.trlibrary.com/sitemap.xml"
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "sitemap.json"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "TRPL-Popup-sitemap/1.0 (+https://popup.labs.trlibrary.com)"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")


def locs(xml):
    return [m.replace("&amp;", "&").strip() for m in re.findall(r"<loc>([^<]+)</loc>", xml)]


def main():
    xml = fetch(SOURCE)
    urls = locs(xml)
    if "<sitemapindex" in xml:                      # an index of sitemaps, or paged sitemaps
        pages = urls
        urls = []
        for page in pages:
            urls += locs(fetch(page))
    paths = sorted({urllib.parse.urlparse(u).path or "/" for u in urls if "trlibrary.com" in u})
    old = json.loads(OUT.read_text()) if OUT.exists() else {"paths": []}
    if len(paths) < 50 or len(paths) < 0.5 * len(old.get("paths", [])):
        print(f"Refusing to replace {len(old.get('paths', []))} paths with {len(paths)}; keeping the old file.")
        return 1
    if paths == old.get("paths"):
        print(f"No change ({len(paths)} paths).")
        return 0
    OUT.write_text(json.dumps({
        "source": SOURCE,
        "fetched": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d"),
        "count": len(paths),
        "paths": paths,
    }, separators=(",", ":")))
    print(f"Wrote {len(paths)} paths (was {len(old.get('paths', []))}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
