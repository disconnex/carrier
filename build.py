#!/usr/bin/env python3
"""Build dist/carrier.js: src/carrier.js with each //@include line replaced
by the file it names (relative to src/), so a sysop installs one file.

    python3 build.py           write dist/carrier.js
    python3 build.py --check   fail if dist/carrier.js is out of date
"""
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")
OUT = os.path.join(HERE, "dist", "carrier.js")
INCLUDE = re.compile(r"^//@include (\S+)[ \t]*$", re.M)


def expand(path):
    def one(m):
        inc = os.path.join(SRC, m.group(1))
        if not os.path.isfile(inc):
            sys.exit(f"{path}: //@include {m.group(1)}: no such file")
        return f"// ---- {m.group(1)} ----\n" + expand(inc).rstrip("\n") + f"\n// ---- end {m.group(1)} ----"
    with open(path, encoding="utf-8") as f:
        return INCLUDE.sub(one, f.read())


def main():
    text = expand(os.path.join(SRC, "carrier.js"))
    if "--check" in sys.argv[1:]:
        have = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
        if have != text:
            sys.exit("dist/carrier.js is out of date: run python3 build.py")
        print("dist/carrier.js is up to date")
        return
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print(f"wrote dist/carrier.js ({len(text)} bytes)")


if __name__ == "__main__":
    main()
