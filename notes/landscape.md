# Landscape: readable cross-repository call chains (markdown → HTML)

*Research note, November 2026. Statuses were checked by fetching vendor/OSS pages where possible; claims I could not confirm first-hand are marked **unverified**. Prior-art evidence for a static, single-file HTML prototype driven by a JSON/YAML spec with snippets extracted from local repos — not a design doc.*

## 1. Markdown + diagram status quo

[Mermaid](https://mermaid.js.org/intro/) is markdown's default answer: text definitions render to SVG, docs ship 12.3.0 with a v13 alpha, and GitHub/GitLab render it natively. It is also the ceiling: nodes carry labels, never code; nothing expands in place, and diagram and code drift independently.

[D2](https://d2lang.com/tour/intro) is the stronger diagram language (containers, imports, several layout engines) and compiles via CLI to SVG/PNG/PDF — the right shape for a build-time artifact. It is independent OSS, fiscally sponsored by Hack Club. [Graphviz](https://graphviz.org/) remains best for dense call graphs where layout quality beats hand-tuning; clusters map onto repos. Both are layout engines, not reading experiences.

[Excalidraw](https://excalidraw.com/) (MIT, self-hostable) and [tldraw](https://tldraw.dev/) are whiteboards — good for a human annotating *why* a chain matters, useless as generated output. (tldraw is source-available under its own license, not OSI, with a paid watermark tier; **unverified**.)

**Verdict:** diagrams carry topology, never code.

## 2. Docs generators

The closest thing to "publishable, readable, code-bearing" artifacts.

- **[MkDocs Material](https://squidfunk.github.io/mkdocs-material/)** — `???` collapsible admonitions (rendered as `<details>`), `# (1)`-style [annotations](https://squidfunk.github.io/mkdocs-material/reference/annotations/), line highlighting, content tabs. **Status: the banner announces "End of life on May 5, 2027" with [Zensical](https://zensical.org/) as successor** — adopting it means planning a migration.
- **[Docusaurus](https://docusaurus.io/docs/markdown-features/code-blocks)** (v3, MDX) — titles, line highlighting, code meta, and, uniquely, arbitrary React components in pages. That is the escape hatch for expandable context: you write the component. Cost: a Node build plus hosting.
- **[mdBook](https://rust-lang.github.io/mdBook/format/markdown.html)** — the relevant *extraction* primitive: `{{#include file.rs:2:5}}` pulls line ranges from real files, `#` hides scaffolding. Proof that spec-driven extraction is old, solved practice; no read-time expansion.
- **[Astro Starlight + Expressive Code](https://starlight.astro.build/)** — best code *presentation* available. The [collapsible-sections plugin](https://expressive-code.com/plugins/collapsible-sections/) folds line ranges (`collapse={1-5, 12-14}`) behind an "X collapsed lines" affordance, in three styles: `github` (one-way expand), `collapsible-start`/`-end`, and `collapsible-auto` (re-collapsible). Almost exactly the requested interaction, one nesting level deep, minus repo semantics.
- **[Quarto](https://quarto.org/docs/reference/formats/html.html)** — `code-fold: true` "collapses code into an HTML `<details>` tag", with `code-summary`, `code-line-numbers`, `code-annotations`, `code-tools`. The strongest evidence that `<details>` folding is the standard answer, not a hack.
- **Jupyter Book** v1 still serves at `/v1/`; the MyST-based v2 timeline is **unverified**. **Slidev/reveal.js** are presentational (highlight steps, Shiki/`highlight.js`) — fine for narrating one chain.

Common limitation: all attach code to *prose*, and none models a call edge — cross-repo structure is hand-authored markdown.

## 3. IDE-native

[VS Code Call Hierarchy](https://code.visualstudio.com/docs/editor/editingevolved#_call-hierarchy) gives incoming/outgoing trees from language servers plus peek widgets — the interaction people mean by "expand surrounding code". Per-workspace, ephemeral, shares nothing. [CodeTour](https://github.com/microsoft/codetour) is the counter-example: a JSON tour of file+line steps with markdown commentary, committed to the repo — good for onboarding, but ranges are fixed at authoring time, it assumes one cloned repo, and upstream looks thinly maintained (a `CodeTour+` fork exists on Open VSX; **status unverified**).

[JetBrains](https://www.jetbrains.com/help/idea/call-hierarchy.html) has the best in-IDE hierarchy and quick-definition popups, but is licensed, IDE-bound, unshareable. On the cross-repo axis **[Sourcegraph](https://sourcegraph.com/docs)** is the strongest commercial answer: multi-repo search plus precise code intelligence via [SCIP](https://github.com/sourcegraph/scip), an open, language-agnostic index others now consume; its weakness is the artifact — navigation and previews, not a curated chain. Whether [Notebooks](https://6.11.sourcegraph.com/notebooks/quickstart) still ships in 2026 is **unverified** (versioned docs exist through 6.11). **[OpenGrok](https://oracle.github.io/opengrok/)** (OSS, Oracle) still does solid multi-project search and cross-reference, but opens whole files.

Two back ends worth knowing: **[Kythe](https://kythe.io/)** (Google; schema, C++/Java indexers, sample cross-reference service, no reader UI) and Meta's **[Glean](https://glean.software/)** (open source, `facebookincubator/glean`): schema-defined facts including call relationships, LSIF/SCIP for Go/Java/Rust/TypeScript, Angle queries, pitched at IDEs and coding agents. Glean is the most credible way to *compute* a cross-repo call graph to render.

## 4. Diagram / visualization

[CodeCharta](https://codecharta.com/) (OSS, MaibornWolff) is alive: 3D metric city, domain word cloud, dependency view with cycle badges, CI CLI — but no code, only metrics and directory dependencies. [Structurizr](https://structurizr.com/)/[C4](https://c4model.com/) is architecture-as-code that deliberately stops above code level. **[Sourcetrail](https://github.com/CoatiSoftware/Sourcetrail)** came closest to "graph + readable code side by side" (select a node, read its source beside it); it is discontinued (Coati Software wound down in 2021) and unmaintained, with community revival attempts (**archival state not re-verified**). Steal its UX, not the tool.

**[AppMap](https://appmap.io/)** is alive but repositioned: "runtime evidence for AI-assisted development", with Gold Traces committed to the repo, VS Code/JetBrains plugins and behavior diagrams — it answers *what ran*, not *what could call what*. **[CodeSee](https://codesee.io/)** appears defunct: the domain failed to resolve/fetch on repeated attempts in November 2026 and third-party pages discuss it in the past tense ([codeindex.ai](https://codeindex.ai/blog/codesee-alternatives), [CB Insights](https://www.cbinsights.com/company/codesee)); an official shutdown notice is **unverified**.

## 5. AI code-doc products (2025–2026)

The category exploded but optimises for *prose about a repo*, not *reading a chain*.

- **[DeepWiki](https://deepwiki.com/)** (Cognition): AI-generated wiki per public repo, free, with diagrams and Q&A. Fetching hit a Vercel checkpoint; export and private-repo specifics **unverified**.
- **Google Code Wiki**: announced on the [Google Developers Blog](https://developers.googleblog.com/en/introducing-code-wiki-accelerating-your-code-understanding/); per-repo generated wiki with diagrams and chat. Date and preview availability **unverified** (page would not load; see [DevOps.com](https://devops.com/google-code-wiki-aims-to-solve-documentations-oldest-problem/)).
- **[Zread](https://zread.ai/)** (Zhipu/Z.ai): repo reading with generated wiki and Q&A. Returned HTTP 504; details **unverified**.
- **[GitDiagram](https://gitdiagram.com/)** (OSS, 18.8k stars, verified live): repo → diagram in seconds — file/directory level, not a symbol call graph, no code context.
- **[GitNexus](https://github.com/abhigyanpatwari/gitnexus)** (OSS): appears to expose a repo knowledge graph to agents over MCP (its MCP docs page now 404s). Scope, cross-repo support, output **unverified**.

Shared limits: **single repository** (keyed off one `owner/repo`), **hosted** (nothing attachable to a ticket), **no verified inline context expansion**, and hallucination risk on exactly the claim a call chain makes.

## 6. Building blocks for a static single-file HTML artifact

- **[Shiki](https://shiki.style/guide/) v4.6.0** — TextMate grammars/themes (the VS Code engine), MIT, ESM, runtime-agnostic; `shiki/core` ≈34 KB gzip before grammars. It highlights **at build time** into plain HTML + inline styles, so the artifact needs zero runtime highlighting JS. Transformers cover line focus/highlight/diff for annotations.
- **[Prism](https://prismjs.com/)**, **[highlight.js](https://highlightjs.org/)** and Go's [Chroma](https://github.com/alecthomas/chroma) — tiny highlighters; adequate, less accurate, work pushed into the browser.
- **[CodeMirror 6](https://codemirror.net/)** — modular, good read-only semantics, but an editor stack for static display. **[Monaco](https://microsoft.github.io/monaco-editor/)** supports `readOnly: true`, yet megabytes plus worker/loader plumbing make it poor for a self-contained offline file.
- **`<details>/<summary>`** ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/details)) — native disclosure, zero JS — Quarto's `code-fold` is literally this. Limits: no open/close transition, quirky marker styling, and the exclusive-accordion `name` attribute needs per-browser checks.
- **`<dialog>`** ([MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog)) — real modal semantics (focus trap, `::backdrop`, ESC) via `showModal()`; the natural peek-overlay host.
- **Scoped CSS** (`@scope` or shadow DOM) — isolates snippet styles; `@scope` support is uneven, so a unique class prefix or shadow-root boundary is the portable answer.
- **Peek-definition pattern** — imitate the IDE peek widget (VS Code `Alt+F12`, JetBrains quick definition): a dismissible panel anchored at the call site. Expressive Code's "N collapsed lines", GitHub's diff expand-context arrows and Sourcegraph hover previews are the same idea.

## Comparison

| Option | What it is | Cross-repo? | Expandable surrounding code? | Shareable artifact? | Authoring cost | Best for |
|---|---|---|---|---|---|---|
| Mermaid | text→SVG diagram in markdown | n/a | No (labels only) | Yes (md/SVG) | Low | topology sketch |
| D2 | diagram CLI, SVG/PNG/PDF | n/a | No | Yes | Low–Med | repo-grouped diagrams |
| Graphviz DOT | graph layout engine | n/a | No | Yes | Med | dense graphs |
| Excalidraw / tldraw | canvas whiteboards | No | No | Yes (PNG/JSON) | Med | human annotation |
| MkDocs Material | docs site | No | Partial (`???`, annotations) | Hosted site | Med | long-form docs (EOL 2027) |
| Docusaurus (MDX) | docs site with React | No | Via custom component | Hosted site | Med | custom interactive UI |
| mdBook | Rust book generator | No | No (line-range includes) | Static site/PDF | Low | snippets from real files |
| Starlight + Expressive Code | Astro docs + code renderer | No | **Yes** (collapse ranges) | Static site | Med | code presentation |
| Quarto | literate → publish | No | **Yes** (`code-fold` → `<details>`) | Single HTML/site | Low | analysis write-ups |
| Jupyter Book | executable notebook book | No | Partial | HTML/PDF | Med | teaching |
| Slidev / reveal.js | slide decks | No | Partial (highlight steps) | HTML deck | Low | narrating one chain |
| VS Code Call Hierarchy | IDE call tree + peek | Per workspace | Peek (separate view) | No | Free | exploration |
| CodeTour | JSON tour in IDE | No | No (fixed ranges) | `.tour` in repo | Med | onboarding |
| JetBrains hierarchy | IDE hierarchy + diagrams | Per project | Popups only | No | Paid IDE | IntelliJ users |
| Sourcegraph (SCIP) | cross-repo precise intel | **Yes** | Previews | Hosted (enterprise) | High | symbol-accurate refs |
| OpenGrok | OSS multi-project search | Yes | No (whole file) | Hosted | Med | legacy browsing |
| Kythe | graph schema + indexers | Yes | No UI | No | High | own index |
| Meta Glean | facts DB + Angle | Yes | No UI | No | High | call-graph backend |
| CodeCharta | 3D code map + deps | Multi-map | No | Yes (map JSON) | Med | hotspots, metrics |
| Structurizr / C4 | architecture DSL | System level | No | Yes (export) | Med | design intent |
| CodeSee | auto code maps (defunct?) | No | No | SaaS | — | historical |
| Sourcetrail | graph + adjacent code (discontinued) | No | Near-miss (side pane) | No | Free | reference UX |
| AppMap | runtime traces + diagrams | No | Partial (trace→code) | Trace files | Med | runtime behavior |
| Swimm | docs with CI-verified snippets | Multi-repo docs | Snippet in docs | Hosted/markdown | High | drift-resistant docs |
| DeepWiki / Code Wiki / Zread | AI per-repo wiki | No | No (unverified) | Hosted | Free/low | fast onboarding |
| GitDiagram | repo→diagram | No | No | Link/image | Free | 10-second repo map |
| GitNexus | repo knowledge graph (unverified) | Unverified | No | Local | Med | agent context |

## Research questions

**(a) Does anything already do "cross-repo call chain with inline expandable code context" well?** No single product; the capability is split three ways. Sourcegraph is the only widely deployed system with *precise cross-repo* call/reference data (SCIP), but it presents navigation, not a reading-first artifact, and is enterprise-hosted. IDE hierarchies nail inline context but are single-workspace and unshareable. Expressive Code and Quarto solve expandable code in a document but know nothing about repos or calls. Sourcetrail was the closest synthesis — graph plus adjacent code — and is dead. The AI wikis are single-repo prose generators with, as far as I could verify, no in-place expansion. **Closest: Sourcegraph for cross-repo truth, Expressive Code/Quarto for the affordance, Sourcetrail's pane as the UX ideal.** Nobody combines all three.

**(b) Best artifact format.** It depends on the audience; ranked for this problem:

1. **Single-file HTML** — shortest distance to reader: attaches to a ticket or chat, opens offline, survives access revocation. Costs: no cross-artifact search, no auth/redaction, size, silent staleness.
2. **Hosted docs** (Starlight/MkDocs/Docusaurus) — best for *many* chains: search, versioning, access control, theming. Costs: build infrastructure, deploy permissions, link rot, MkDocs Material's 2027 EOL.
3. **IDE plugin / CodeTour** — best fidelity and freshness (symbol resolution at read time), worst distributability: per-user install, per-repo clone, unusable for auditors.
4. **Notebook** (Jupyter/Quarto) — best when the chain is an argument with evidence; heavy runtime, poor review ergonomics, awkward as an attachment.

For one investigation read widely, single-file HTML wins; for a living wiki of chains, hosted docs win — not exclusive if both consume the same spec.

**(c) What breaks in practice with generated snippets.**

- **Drift.** Snippets are snapshots; the artifact lies at the next commit. Pin commit SHAs, render them in the header, expire by policy. Swimm's product is an admission of this cost (CI-verified snippets); mdBook's `{{#include}}` shares the failure mode with better ergonomics.
- **Line anchors.** Refactors shift lines, so "context around 118–124" silently points elsewhere. Anchor on symbol name plus content hash, and fail loudly on mismatch.
- **Repo layout change.** Paths break on monorepo splits and renames; key identity on repo URL + symbol FQN + SHA, not paths.
- **Size.** Expandable context invites generous windows; a 30-hop chain at ±60 lines, with repeated file content, reaches multiple MB, and Shiki emits per-token `<span>`s. Budget, dedupe, lazy-embed.
- **Trust and security.** Extracted code leaves the repos and their permissions — a data-classification question before a rendering one. Escape content, set a restrictive CSP, avoid CDN scripts, never inline secrets; license headers may travel with snippets.
- **Chain correctness.** Static call graphs approximate (dynamic dispatch, DI, reflection, codegen, FFI); LLM-inferred edges are worse. Label the chain as one plausible path and state the evidence.
- **Highlight fidelity.** Every language needs a grammar (bundle weight); unknown files fall back to plain text.

## Implications for our prototype

- **The gap is real and specific.** Nothing surveyed ships "cross-repo chain + inline context as a shareable file"; we assemble three proven pieces, not re-implement a competitor.
- **Copy Expressive Code's interaction, not its toolchain:** ranged collapse behind an inline "N collapsed lines", preferring the re-collapsible style over GitHub's one-way expand. Quarto's `code-fold` proves `<details>` is sufficient.
- **Build-time Shiki is the right call** — zero runtime JS, VS Code-accurate colours, readable offline — but pre-empt size by deduping ranges and capping context per hop. The spec's `context: 4` is tighter than peers (3–10 lines); make the window a per-step policy, not a global default.
- **Add provenance the spec lacks.** `chain.spec.json` anchors on `match` regex + `symbol` (good: no line numbers) but carries no commit SHA, timestamp or content hash, so drift is undetectable. Add them, render "built from `<sha>` at `<time>`", and show an expired state.
- **Distinguish asserted from verified edges.** The spec's hand-authored `edge` objects (`http`, `gRPC`, `event`, `return`) are author claims, not indexer output; label them as such so the artifact does not inherit the AI-wiki category's credibility problem.
- **Reuse the per-repo colour mapping** as the cross-repo legibility primitive (as D2/CodeCharta do).
- **Treat "expand" as peek, not navigation** — the IDE peek widget is the proven UX; `<dialog>` plus pre-rendered hidden ranges and a shadow-root style boundary delivers it natively.
- **Keep the spec the single source of truth** so the same input can emit single-file HTML now and a hosted Starlight page later — the hedge for (b). To verify before committing: Sourcegraph Notebooks' status, CodeTour upstream status, Glean's cost at our scale, and whether any 2026 AI code-wiki has shipped real inline context (none found).
