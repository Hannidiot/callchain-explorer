#!/usr/bin/env python3
"""Scaffold a standalone call-chain project from this template.

The result is self-contained: it gets its own copy of ``build_callchain.py``,
``viewer/``, a starter ``chain.spec.json`` and a README. No runtime dependency
on this repository remains after scaffolding.

Usage:
    python new_chain.py ../my-chain --title "Checkout flow"
    python new_chain.py ../my-chain --from-example   # seed with the demo
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
IGNORE = shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store", "Thumbs.db")


def fail(message: str) -> int:
    print(f"error: {message}", file=sys.stderr)
    return 1


def write_readme(target: Path, title: str, seeded: bool) -> None:
    template = HERE / "template" / "README.template.md"
    if not template.is_file():
        raise FileNotFoundError(f"missing template README: {template}")

    text = template.read_text(encoding="utf-8")
    text = text.replace("{{TITLE}}", title)
    text = text.replace("{{DATE}}", _dt.date.today().isoformat())
    if seeded:
        text += (
            "\n---\n\nThis project was seeded with the included order-flow example. "
            "Run the build and open `dist/callchain.html`, then replace the example "
            "repositories and steps with your own.\n"
        )
    (target / "README.md").write_text(text, encoding="utf-8", newline="\n")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Create a standalone call-chain project from this template."
    )
    parser.add_argument("target", help="directory to create (must be empty or absent)")
    parser.add_argument(
        "--title",
        help="project title (default: derived from the target directory name)",
    )
    parser.add_argument(
        "--from-example",
        action="store_true",
        help="seed the project with the included five-repo order-flow demo",
    )
    args = parser.parse_args(argv)

    target = Path(args.target).resolve()
    if target.exists():
        if not target.is_dir():
            return fail(f"{target} exists and is not a directory")
        if any(target.iterdir()):
            return fail(f"{target} exists and is not empty")

    domain = (args.title or "").strip()
    if not domain:
        domain = target.name.replace("_", " ").replace("-", " ").strip().title()
    domain = domain or "Call chain"

    for required in (HERE / "build_callchain.py", HERE / "viewer", HERE / "template"):
        if not required.exists():
            return fail(f"template asset missing: {required}")

    target.mkdir(parents=True, exist_ok=True)

    shutil.copy2(HERE / "build_callchain.py", target / "build_callchain.py")
    if (HERE / ".gitignore").is_file():
        shutil.copy2(HERE / ".gitignore", target / ".gitignore")
    shutil.copytree(
        HERE / "viewer", target / "viewer", ignore=IGNORE, dirs_exist_ok=True
    )

    seeded = bool(args.from_example)
    if seeded:
        shutil.copy2(HERE / "chain.spec.json", target / "chain.spec.json")
        shutil.copytree(HERE / "demo", target / "demo", ignore=IGNORE, dirs_exist_ok=True)
        spec_path = target / "chain.spec.json"
        if args.title:
            spec = json.loads(spec_path.read_text(encoding="utf-8"))
            spec["title"] = args.title.strip()
            spec_path.write_text(
                json.dumps(spec, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
                newline="\n",
            )
    else:
        spec = json.loads(
            (HERE / "template" / "chain.spec.json").read_text(encoding="utf-8")
        )
        spec["title"] = domain
        (target / "chain.spec.json").write_text(
            json.dumps(spec, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        (target / "repos").mkdir()
        (target / "repos" / "README.md").write_text(
            "# Repository checkouts\n\n"
            "Put the repositories this chain crosses here, or anywhere else, and point\n"
            "`repos[*].root` in `chain.spec.json` at them. Roots are relative to the spec.\n",
            encoding="utf-8",
            newline="\n",
        )

    (target / "dist").mkdir(exist_ok=True)
    write_readme(target, domain, seeded)

    print(f"Created chain project: {target}")
    print("  build_callchain.py")
    print("  viewer/")
    print("  chain.spec.json")
    print("  README.md")
    if seeded:
        print("  demo/ (order-flow example)")
    else:
        print("  repos/ (empty - add checkouts and edit chain.spec.json)")
    print()
    print("Next:")
    print(f"  cd {target}")
    if not seeded:
        print("  # edit chain.spec.json: repo roots, files, match regexes")
    print("  python build_callchain.py --spec chain.spec.json --out dist/callchain.html")
    print("  open dist/callchain.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
