#!/usr/bin/env python3
"""Build a single-file, offline HTML explorer for a cross-repo call chain.

Input:  a JSON spec that names repositories, files and the symbol to show
        for every hop of the chain (see chain.spec.json).
Output: one self-contained .html file with embedded snippets, no server and
        no network needed.

Design notes:
  * Snippets are embedded at build time. The spec points at a symbol with a
    regular expression; the generator finds the function boundary so authors
    never hand-count line numbers.
  * Full files up to ``MAX_INLINE_LINES`` are embedded, so the viewer can
    grow the context around a function indefinitely. Larger files embed a
    window around the symbol instead.
  * Only the Python standard library is used.
"""

from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import html
import json
import re
import sys
from pathlib import Path
from urllib.parse import quote

MAX_INLINE_LINES = 260
DEFAULT_OUT = "dist/callchain.html"

LANG_BY_EXT = {
    ".ts": "ts",
    ".tsx": "ts",
    ".js": "ts",
    ".jsx": "ts",
    ".mjs": "ts",
    ".cjs": "ts",
    ".py": "python",
    ".go": "go",
    ".java": "brace",
    ".kt": "brace",
    ".kts": "brace",
    ".rs": "brace",
    ".c": "brace",
    ".h": "brace",
    ".cc": "brace",
    ".cpp": "brace",
    ".hpp": "brace",
    ".cs": "brace",
    ".php": "brace",
    ".swift": "brace",
    ".scala": "brace",
}

LANG_NAMES = {
    "ts": "TypeScript",
    "python": "Python",
    "go": "Go",
    "brace": "C-like",
}

BRACE_LANGS = {"ts", "go", "brace"}


class SpecError(Exception):
    pass


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        raise SpecError(f"cannot read {path}: {exc}") from exc


def split_lines(text: str) -> list[str]:
    # Keep it simple and platform-neutral; a trailing newline does not
    # become a phantom last line.
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    return lines


def lang_for(path: Path) -> str:
    return LANG_BY_EXT.get(path.suffix.lower(), "brace")


def find_line(
    lines: list[str],
    pattern: str,
    *,
    what: str,
    start: int = 0,
    end: int | None = None,
) -> int:
    """Return the 0-based index of the first line matching *pattern*."""
    try:
        rx = re.compile(pattern)
    except re.error as exc:
        raise SpecError(f"invalid regex for {what}: {pattern!r} ({exc})") from exc
    stop = len(lines) if end is None else min(end + 1, len(lines))
    for idx in range(max(0, start), stop):
        if rx.search(lines[idx]):
            return idx
    scope = f"lines {start + 1}-{stop}" if end is not None else "the file"
    raise SpecError(f"{what}: pattern {pattern!r} not found in {scope}")


def find_python_end(lines: list[str], start: int) -> int:
    """End of a Python block, found by indentation.

    Multi-line signatures are common (and their closing ``) -> T:`` can sit
    at column 0), so the signature is consumed first, then indentation is
    measured from the ``def`` line.
    """
    base = len(lines[start]) - len(lines[start].lstrip())
    sig_end = start
    for idx in range(start, min(len(lines), start + 30)):
        stripped = lines[idx].strip()
        if stripped.endswith(":") and not stripped.startswith("#"):
            sig_end = idx
            break

    end = sig_end
    for idx in range(sig_end + 1, len(lines)):
        line = lines[idx]
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip())
        if indent <= base:
            break
        end = idx
    return end


def find_brace_end(lines: list[str], start: int) -> int:
    """End of a brace-delimited block, found by counting braces outside
    strings and comments. Handles multi-line signatures."""
    depth = 0
    seen = False
    state = "normal"  # normal | block | single | double | backtick
    for idx in range(start, len(lines)):
        line = lines[idx]
        i = 0
        while i < len(line):
            ch = line[i]
            nxt = line[i + 1] if i + 1 < len(line) else ""

            if state == "block":
                if ch == "*" and nxt == "/":
                    state = "normal"
                    i += 2
                    continue
                i += 1
                continue

            if state in ("single", "double", "backtick"):
                if ch == "\\":
                    i += 2
                    continue
                if (state == "single" and ch == "'") or (
                    state == "double" and ch == '"'
                ) or (state == "backtick" and ch == "`"):
                    state = "normal"
                i += 1
                continue

            if ch == "/" and nxt == "/":
                break
            if ch == "/" and nxt == "*":
                state = "block"
                i += 2
                continue
            if ch == "'":
                state = "single"
                i += 1
                continue
            if ch == '"':
                state = "double"
                i += 1
                continue
            if ch == "`":
                state = "backtick"
                i += 1
                continue
            if ch == "{":
                depth += 1
                seen = True
            elif ch == "}":
                depth -= 1
                if seen and depth == 0:
                    return idx
            i += 1
    if not seen:
        raise SpecError("no opening brace found for the symbol")
    raise SpecError("unbalanced braces: could not find the end of the symbol")


def function_end(lines: list[str], start: int, lang: str) -> int:
    if lang == "python":
        return find_python_end(lines, start)
    return find_brace_end(lines, start)


def signature_text(lines: list[str], start: int, end: int, lang: str) -> str:
    """A short single-line preview of the declaration."""
    parts: list[str] = []
    limit = min(end, start + 8)
    for idx in range(start, limit + 1):
        chunk = lines[idx].strip()
        if chunk:
            parts.append(chunk)
        if lang == "python" and chunk.endswith(":"):
            break
        if lang != "python" and "{" in lines[idx]:
            break
    text = " ".join(parts)
    text = re.sub(r"\s+", " ", text)
    return text[:220]


def vscode_uri(abs_path: Path, line: int) -> str:
    posix = abs_path.as_posix()
    if posix.startswith("/"):
        return f"vscode://file{posix}:{line}"
    return f"vscode://file/{quote(posix, safe='/:')}:{line}"


def load_spec(spec_path: Path) -> dict:
    try:
        spec = json.loads(spec_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SpecError(f"{spec_path} is not valid JSON: {exc}") from exc
    except OSError as exc:
        raise SpecError(f"cannot read spec {spec_path}: {exc}") from exc
    if not isinstance(spec, dict):
        raise SpecError("spec root must be an object")
    if not spec.get("steps"):
        raise SpecError("spec has no steps")
    return spec


def build_data(spec: dict, spec_path: Path) -> dict:
    base_dir = spec_path.parent
    repos_spec = spec.get("repos") or {}
    steps_spec = spec["steps"]

    repo_meta: dict[str, dict] = {}
    for repo_id, cfg in repos_spec.items():
        root_rel = (cfg or {}).get("root")
        if not root_rel:
            raise SpecError(f"repo {repo_id!r} has no root")
        root = (base_dir / root_rel).resolve()
        if not root.is_dir():
            raise SpecError(f"repo {repo_id!r} root does not exist: {root}")
        repo_meta[repo_id] = {
            "id": repo_id,
            "name": (cfg.get("name") or repo_id),
            "root": root_rel,
            "rootAbs": str(root),
            "color": cfg.get("color") or "#6b7280",
            "ref": cfg.get("ref"),
            "stepCount": 0,
            "languages": [],
        }

    step_ids: list[str] = []
    for n, step in enumerate(steps_spec, start=1):
        sid = step.get("id")
        if not sid:
            raise SpecError(f"step #{n} has no id")
        if sid in step_ids:
            raise SpecError(f"duplicate step id {sid!r}")
        step_ids.append(sid)

    steps_out: list[dict] = []
    for n, step in enumerate(steps_spec, start=1):
        sid = step["id"]
        where = f"step #{n} ({sid})"
        repo_id = step.get("repo")
        if repo_id not in repo_meta:
            raise SpecError(f"{where}: unknown repo {repo_id!r}")
        repo = repo_meta[repo_id]
        root = Path(repo["rootAbs"])

        rel_file = step.get("file")
        if not rel_file:
            raise SpecError(f"{where}: missing file")
        abs_file = (root / rel_file).resolve()
        if not abs_file.is_file():
            raise SpecError(f"{where}: file not found: {abs_file}")

        lines = split_lines(read_text(abs_file))
        lang = lang_for(abs_file)

        start = find_line(lines, step["match"], what=f"{where}: symbol")
        end = function_end(lines, start, lang)
        if end <= start:
            raise SpecError(f"{where}: could not determine symbol body")
        if end - start > 400:
            print(
                f"warning: {where}: symbol spans {end - start + 1} lines; "
                "check the match pattern",
                file=sys.stderr,
            )

        callsites: list[dict] = []
        edge_type = (step.get("edge") or {}).get("type")
        for index, cs in enumerate(step.get("callsites") or []):
            pattern = cs.get("match")
            if not pattern:
                raise SpecError(f"{where}: callsite without a match pattern")
            cs_line = find_line(
                lines,
                pattern,
                what=f"{where}: callsite {pattern!r}",
                start=start,
                end=end,
            )
            target = cs.get("to")
            if (
                target is None
                and index == 0
                and edge_type
                and edge_type != "return"
                and n < len(steps_spec)
            ):
                # The first marker is the call that leads to the next step.
                # A "return" hop is control flow, not a call, so it gets no
                # automatic jump target.
                target = steps_spec[n]["id"]
            if target is not None and target not in step_ids:
                raise SpecError(f"{where}: callsite points at unknown step {target!r}")
            callsites.append(
                {
                    "line": cs_line + 1,
                    "label": cs.get("label") or "next hop",
                    "to": target,
                }
            )

        if step.get("edge"):
            if n == len(steps_spec):
                raise SpecError(f"{where}: last step must not have an edge")
            if not callsites:
                raise SpecError(f"{where}: a hop needs at least one callsite marker")

        if len(lines) <= MAX_INLINE_LINES:
            win_start, win_end = 0, len(lines) - 1
        else:
            win_start = max(0, start - 80)
            win_end = min(len(lines) - 1, end + 80)

        repo["stepCount"] += 1
        if LANG_NAMES.get(lang, lang) not in repo["languages"]:
            repo["languages"].append(LANG_NAMES.get(lang, lang))

        edge = step.get("edge")
        if edge is not None:
            edge = dict(edge)
            edge.setdefault("verified", False)

        step_context = step.get("context", spec.get("context", 4))
        try:
            step_context = max(0, int(step_context))
        except (TypeError, ValueError):
            raise SpecError(f"{where}: context must be an integer") from None

        steps_out.append(
            {
                "id": sid,
                "n": n,
                "repo": repo_id,
                "repoName": repo["name"],
                "repoColor": repo["color"],
                "repoRef": repo.get("ref"),
                "lang": lang,
                "langName": LANG_NAMES.get(lang, lang),
                "file": rel_file,
                "absPath": str(abs_file),
                "contentHash": hashlib.sha256(abs_file.read_bytes()).hexdigest(),
                "symbol": step.get("symbol") or abs_file.stem,
                "signature": signature_text(lines, start, end, lang),
                "startLine": start + 1,
                "endLine": end + 1,
                "context": step_context,
                "note": step.get("note") or "",
                "callsites": callsites,
                "edge": edge,
                "vscodeUri": vscode_uri(abs_file, start + 1),
                "snippet": {
                    "startLine": win_start + 1,
                    "endLine": win_end + 1,
                    "wholeFile": win_start == 0 and win_end == len(lines) - 1,
                    "totalLines": len(lines),
                    "lines": [[idx + 1, lines[idx]] for idx in range(win_start, win_end + 1)],
                },
            }
        )

    repos_out = [r for r in repo_meta.values() if r["stepCount"] > 0]
    languages: list[str] = []
    for step in steps_out:
        if step["langName"] not in languages:
            languages.append(step["langName"])

    return {
        "title": spec.get("title") or "Cross-repo call chain",
        "subtitle": spec.get("subtitle") or "",
        "context": int(spec.get("context") or 4),
        "generatedAt": _dt.datetime.now().astimezone().isoformat(timespec="seconds"),
        "specFile": spec_path.name,
        "repos": repos_out,
        "steps": steps_out,
        "stats": {
            "steps": len(steps_out),
            "repos": len(repos_out),
            "files": len({(s["absPath"]) for s in steps_out}),
            "languages": languages,
        },
    }


def render(data: dict, spec_path: Path, out_path: Path) -> None:
    viewer_dir = spec_path.parent / "viewer"
    template_path = viewer_dir / "template.html"
    css_path = viewer_dir / "viewer.css"
    js_path = viewer_dir / "viewer.js"
    for path in (template_path, css_path, js_path):
        if not path.is_file():
            raise SpecError(f"viewer asset missing: {path}")

    template = read_text(template_path)
    css = read_text(css_path)
    js = read_text(js_path)

    data_json = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    # Keep the payload from closing the surrounding <script> element.
    data_json = data_json.replace("</", "<\\/")

    title = html.escape(data["title"])
    doc = template.replace("__TITLE__", title)
    doc = doc.replace("__STYLE__", css)
    doc = doc.replace("__SCRIPT__", js)
    doc = doc.replace("__DATA__", data_json)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(doc, encoding="utf-8", newline="\n")


def print_summary(data: dict, out_path: Path) -> None:
    print(f'Chain: {data["title"]}')
    for step in data["steps"]:
        cs = step["callsites"][0]["line"] if step["callsites"] else "-"
        print(
            f'  {step["n"]:>2}. {step["id"]:<18} {step["repoName"]:<18} '
            f'{step["file"]:<44} L{step["startLine"]}-{step["endLine"]}  '
            f'callsite L{cs}'
        )
    size_kb = out_path.stat().st_size / 1024
    print(
        f'\nWrote {out_path} ({size_kb:.1f} KB, '
        f'{data["stats"]["steps"]} hops, {data["stats"]["repos"]} repos)'
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build a single-file HTML call-chain explorer."
    )
    parser.add_argument(
        "--spec",
        default="chain.spec.json",
        help="path to the chain spec (default: chain.spec.json)",
    )
    parser.add_argument(
        "--out",
        default=DEFAULT_OUT,
        help=f"output HTML path (default: {DEFAULT_OUT})",
    )
    args = parser.parse_args(argv)

    spec_path = Path(args.spec).resolve()
    out_path = Path(args.out)
    if not out_path.is_absolute():
        out_path = (spec_path.parent / out_path).resolve()

    try:
        spec = load_spec(spec_path)
        data = build_data(spec, spec_path)
        render(data, spec_path, out_path)
    except SpecError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    print_summary(data, out_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
