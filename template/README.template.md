# {{TITLE}}

A generated, single-file HTML walkthrough for a call chain that spans multiple repositories.
Scaffolded on {{DATE}} from the call-chain template; replace this README as you go.

## 1. Add the repositories

Put checkouts under `repos/` (or anywhere) and point `repos[*].root` in `chain.spec.json` at
them. Roots are resolved relative to the spec file. Add a `ref` (commit or tag) per repo so
readers know which revision the snippets came from.

## 2. Describe the chain

Edit `chain.spec.json`:

- one `steps[]` entry per function in the chain;
- `match` is a regular expression that finds the declaration — not a line number;
- `callsites[]` marks the line(s) where the next hop starts;
- `edge` describes the hop (`http`, `grpc`, `event`, `return`); set `"verified": true` only
  when an indexer produced it, otherwise it is shown as asserted by the author;
- `note` explains why the hop matters;
- `context` (global or per step) sets the default lines shown around the function.

The starter spec is intentionally invalid until you replace the `REPLACE_*` values. The
generator fails loudly instead of producing a misleading page.

## 3. Build and open

```bash
python build_callchain.py --spec chain.spec.json --out dist/callchain.html
```

Open `dist/callchain.html` directly. It is self-contained and works offline.

## 4. Share

Attach `dist/callchain.html` to a ticket or chat, or publish it. Before sharing outside your
machine, strip absolute paths and `vscode://` links if they should not leave your workstation.

## Updating the engine

This project has its own copy of `build_callchain.py` and `viewer/` so it can stand alone.
To pull in future template improvements, copy those files from the template repository.

## Troubleshooting

- `pattern ... not found`: the `match` regex does not hit the declaration; check the file and
  language.
- `repo ... root does not exist`: fix `repos[*].root` (relative to the spec).
- `unbalanced braces`: the function-boundary heuristic needs a clearer `match`; point it at a
  line that opens the body, or switch to a parser-based extractor.
- Files larger than 260 lines embed a window around the function; `Whole file` is disabled for
  those. Use the `vscode://` link for the full file.
