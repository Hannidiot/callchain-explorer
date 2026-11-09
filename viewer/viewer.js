/* ============================================================
   Call chain explorer — viewer logic
   Input: JSON in #chain-data (embedded at build time).
   No network, no dependencies.
   ============================================================ */

(function () {
  "use strict";

  var DATA;
  try {
    DATA = JSON.parse(document.getElementById("chain-data").textContent);
  } catch (err) {
    fatal("Could not parse the embedded chain data: " + err);
    return;
  }

  var KIND_COLORS = {
    http: "#3b82f6",
    grpc: "#8b5cf6",
    event: "#f59e0b",
    return: "#94a3b8",
    internal: "#94a3b8"
  };

  var STORAGE_THEME = "callchain-theme";

  var state = {
    expanded: new Set(),
    windows: new Map(),
    repos: new Set(DATA.repos.map(function (r) { return r.id; })),
    query: ""
  };

  var refs = Object.create(null);
  var toastTimer = null;

  /* ---------- small helpers ---------- */

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function byId(id) {
    for (var i = 0; i < DATA.steps.length; i++) {
      if (DATA.steps[i].id === id) return DATA.steps[i];
    }
    return null;
  }

  function setText(selector, text) {
    var node = document.querySelector(selector);
    if (node) node.textContent = text;
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric"
      });
    } catch (err) {
      return "";
    }
  }

  function fatal(message) {
    var panel = document.createElement("div");
    panel.style.cssText =
      "margin:2rem auto;max-width:60rem;padding:1rem 1.2rem;border:1px solid #d33;" +
      "border-radius:12px;font-family:ui-monospace,monospace;font-size:13px;white-space:pre-wrap";
    panel.textContent = message;
    document.body.appendChild(panel);
  }

  /* ---------- windows / context ---------- */

  function defaultWindow(step) {
    var c = Number(step.context);
    if (!isFinite(c)) c = Number(DATA.context) || 4;
    return {
      start: Math.max(step.snippet.startLine, step.startLine - c),
      end: Math.min(step.snippet.endLine, step.endLine + c)
    };
  }

  function getWindow(step) {
    if (!state.windows.has(step.id)) {
      state.windows.set(step.id, defaultWindow(step));
    }
    return state.windows.get(step.id);
  }

  /* ---------- header ---------- */

  function renderMeta() {
    var stats = DATA.stats;
    var parts = [];
    parts.push('<span class="stat"><b>' + stats.steps + "</b> hops</span>");
    parts.push('<span class="stat"><b>' + stats.repos + "</b> repositories</span>");
    parts.push('<span class="stat">' + esc(stats.languages.join(" · ")) + "</span>");
    if (DATA.generatedAt) {
      parts.push('<span class="stat">generated ' + esc(formatDate(DATA.generatedAt)) + "</span>");
    }
    document.getElementById("page-meta").innerHTML = parts.join("");
  }

  function renderFilters() {
    var wrap = document.getElementById("repo-filters");
    var html =
      '<button type="button" class="filter" data-repo="all">' +
      '<span class="filter-name">All</span>' +
      '<span class="count">' + DATA.steps.length + "</span></button>";

    DATA.repos.forEach(function (repo) {
      html +=
        '<button type="button" class="filter" data-repo="' + esc(repo.id) + '"' +
        ' style="--repo:' + esc(repo.color) + '">' +
        '<span class="dot"></span>' +
        '<span class="filter-name">' + esc(repo.name) + "</span>" +
        '<span class="count">' + repo.stepCount + "</span></button>";
    });

    wrap.innerHTML = html;
  }

  function syncFilters() {
    var all = state.repos.size === DATA.repos.length;
    var buttons = document.querySelectorAll("#repo-filters .filter");
    for (var i = 0; i < buttons.length; i++) {
      var id = buttons[i].dataset.repo;
      var pressed = id === "all" ? all : state.repos.has(id);
      buttons[i].setAttribute("aria-pressed", String(pressed));
    }
  }

  /* ---------- minimap ---------- */

  function renderMinimap() {
    var html = "";
    DATA.steps.forEach(function (step, index) {
      html +=
        '<button type="button" class="map-step" data-target="' + esc(step.id) + '"' +
        ' style="--repo:' + esc(step.repoColor) + '">' +
        '<span class="dot"></span>' +
        '<span class="num">' + step.n + "</span>" +
        '<span class="map-symbol">' + esc(step.symbol) + "</span></button>";
      if (index < DATA.steps.length - 1) {
        html += '<span class="map-arrow" aria-hidden="true">›</span>';
      }
    });
    document.getElementById("minimap").innerHTML = html;
  }

  /* ---------- step markup ---------- */

  function headerHtml(step) {
    return (
      '<span class="head-main">' +
        '<span class="kicker">' +
          '<span class="repo-dot"></span>' + esc(step.repoName) +
          '<span class="slash">/</span>' + esc(step.langName) +
        "</span>" +
        '<span class="head-line">' +
          '<code class="sym">' + esc(step.symbol) + "</code>" +
          '<span class="file">' + esc(step.file) + "</span>" +
        "</span>" +
      "</span>" +
      '<span class="head-side">' +
        '<span class="range">L' + step.startLine + "–" + step.endLine + "</span>" +
        '<span class="chev" aria-hidden="true"></span>' +
      "</span>" +
      '<span class="preview">' + esc(step.signature) + "</span>"
    );
  }

  function bodyHtml(step) {
    var wholeDisabled = step.snippet.wholeFile
      ? ""
      : ' disabled title="Only a window of this file was embedded at build time"';

    return (
      '<p class="note">' + esc(step.note) + "</p>" +
      '<div class="code-shell">' +
        '<div class="code-head">' +
          '<span class="code-range" data-range></span>' +
          '<span class="code-tools">' +
            '<button type="button" class="tool" data-action="fit">Fit function</button>' +
            '<button type="button" class="tool" data-action="whole"' + wholeDisabled + ">Whole file</button>" +
            '<button type="button" class="tool" data-action="copy">Copy</button>' +
          "</span>" +
        "</div>" +
        '<div class="code-block" data-code></div>' +
      "</div>" +
      '<div class="step-links">' +
        '<a href="' + esc(step.vscodeUri) + '" title="Open ' + esc(step.absPath) + ' in VS Code">Open in VS Code</a>' +
        '<button type="button" class="step-link" data-action="link">Copy link</button>' +
        '<span class="provenance" title="sha256: ' + esc(step.contentHash) +
          (step.repoRef ? " · pinned at " + esc(step.repoRef) : "") +
          '">blob ' + esc(String(step.contentHash).slice(0, 7)) + "</span>" +
        '<span class="marker-count" data-markers></span>' +
      "</div>"
    );
  }

  function hopHtml(step) {
    var edge = step.edge;
    if (!edge) return "";
    var credibility = edge.verified
      ? "verified by an indexer"
      : "asserted by the chain author";
    return (
      '<div class="hop" data-kind="' + esc(edge.type) + '" data-for="' + esc(step.id) + '"' +
      ' style="--hop-color:' + esc(KIND_COLORS[edge.type] || "#94a3b8") + '">' +
        '<div class="hop-pill" title="' + esc((edge.detail || "") + " · " + credibility) + '">' +
          '<span class="hop-kind">' + esc(edge.kind || String(edge.type).toUpperCase()) + "</span>" +
          '<span class="hop-label">' + esc(edge.label) + "</span>" +
          '<span class="hop-detail">' + esc(edge.detail || "") + "</span>" +
        "</div>" +
      "</div>"
    );
  }

  function buildSteps() {
    var wrap = document.getElementById("steps");
    var html = "";

    DATA.steps.forEach(function (step) {
      html +=
        '<article class="step" id="step-' + esc(step.id) + '" data-step="' + esc(step.id) + '"' +
        ' data-expanded="false" style="--repo:' + esc(step.repoColor) + '">' +
          '<div class="step-index" aria-hidden="true">' + step.n + "</div>" +
          '<div class="step-card">' +
            '<button type="button" class="step-head" aria-expanded="false"' +
            ' aria-controls="body-' + esc(step.id) + '">' + headerHtml(step) + "</button>" +
            '<div class="step-body" id="body-' + esc(step.id) + '" hidden>' + bodyHtml(step) + "</div>" +
          "</div>" +
        "</article>" +
        hopHtml(step);
    });

    wrap.innerHTML = html;

    DATA.steps.forEach(function (step) {
      var article = document.getElementById("step-" + step.id);
      refs[step.id] = {
        article: article,
        head: article.querySelector(".step-head"),
        body: article.querySelector(".step-body"),
        code: article.querySelector("[data-code]"),
        range: article.querySelector("[data-range]"),
        markers: article.querySelector("[data-markers]"),
        hop: document.querySelector('.hop[data-for="' + step.id + '"]')
      };
    });
  }

  /* ---------- syntax highlighting ---------- */

  function wordSet(words) {
    var set = Object.create(null);
    words.split(" ").forEach(function (word) { set[word] = true; });
    return set;
  }

  var KEYWORDS = {
    ts: wordSet(
      "const let var function async await return if else for while do switch case break " +
      "continue import from export default class extends new throw try catch finally typeof " +
      "instanceof in of this super yield static public private protected readonly interface " +
      "type enum namespace declare abstract implements void string number boolean any unknown " +
      "never object as is keyof infer asserts satisfies"
    ),
    python: wordSet(
      "def class async await return if elif else for while import from as with try except " +
      "finally raise yield lambda pass break continue and or not in is None True False match " +
      "case global nonlocal assert del self cls"
    ),
    go: wordSet(
      "func package import return if else for range switch case default type struct interface " +
      "map chan go defer select break continue var const nil true false string int int64 " +
      "float64 bool error byte rune make new len cap append panic recover"
    ),
    brace: wordSet(
      "public private protected class interface extends implements new return if else for " +
      "while switch case break continue import package static final void int long double " +
      "float boolean true false null this super try catch finally throw throws"
    )
  };

  function span(cls, text) {
    return '<span class="tk-' + cls + '">' + esc(text) + "</span>";
  }

  function highlightLines(lines, lang) {
    var key = KEYWORDS[lang] ? lang : "brace";
    var st = { mode: "normal", delim: "" };
    return lines.map(function (line) {
      return highlightLine(line, key, st);
    });
  }

  function scanQuoted(line, start, quote) {
    var i = start + 1;
    var escaped = false;
    while (i < line.length) {
      var ch = line[i];
      if (escaped) { escaped = false; i += 1; continue; }
      if (ch === "\\") { escaped = true; i += 1; continue; }
      if (ch === quote) return { end: i + 1, open: false };
      i += 1;
    }
    return { end: line.length, open: true };
  }

  function highlightLine(line, lang, st) {
    var out = "";
    var i = 0;
    var n = line.length;
    var py = lang === "python";

    while (i < n) {
      if (st.mode === "block") {
        var blockEnd = line.indexOf("*/", i);
        if (blockEnd === -1) {
          out += span("com", line.slice(i));
          return out;
        }
        out += span("com", line.slice(i, blockEnd + 2));
        i = blockEnd + 2;
        st.mode = "normal";
        continue;
      }

      if (st.mode === "string") {
        var stringEnd = line.indexOf(st.delim, i);
        if (stringEnd === -1) {
          out += span("str", line.slice(i));
          return out;
        }
        out += span("str", line.slice(i, stringEnd + st.delim.length));
        i = stringEnd + st.delim.length;
        st.mode = "normal";
        st.delim = "";
        continue;
      }

      var ch = line[i];

      if (!py && ch === "/" && line[i + 1] === "/") {
        out += span("com", line.slice(i));
        break;
      }
      if (py && ch === "#") {
        out += span("com", line.slice(i));
        break;
      }
      if (ch === "/" && line[i + 1] === "*") {
        var close = line.indexOf("*/", i + 2);
        if (close === -1) {
          out += span("com", line.slice(i));
          st.mode = "block";
          break;
        }
        out += span("com", line.slice(i, close + 2));
        i = close + 2;
        continue;
      }

      if (py && line.slice(i, i + 3) === '"""') {
        var triple = '"""';
        var tripleEnd = line.indexOf(triple, i + 3);
        if (tripleEnd === -1) {
          out += span("str", line.slice(i));
          st.mode = "string";
          st.delim = triple;
          break;
        }
        out += span("str", line.slice(i, tripleEnd + 3));
        i = tripleEnd + 3;
        continue;
      }
      if (py && line.slice(i, i + 3) === "'''") {
        var triple2 = "'''";
        var tripleEnd2 = line.indexOf(triple2, i + 3);
        if (tripleEnd2 === -1) {
          out += span("str", line.slice(i));
          st.mode = "string";
          st.delim = triple2;
          break;
        }
        out += span("str", line.slice(i, tripleEnd2 + 3));
        i = tripleEnd2 + 3;
        continue;
      }

      if (ch === '"' || ch === "'") {
        var quoted = scanQuoted(line, i, ch);
        out += span("str", line.slice(i, quoted.end));
        i = quoted.end;
        continue;
      }

      if (ch === "`" && (lang === "ts" || lang === "brace")) {
        var tickEnd = line.indexOf("`", i + 1);
        if (tickEnd === -1) {
          out += span("str", line.slice(i));
          st.mode = "string";
          st.delim = "`";
          break;
        }
        out += span("str", line.slice(i, tickEnd + 1));
        i = tickEnd + 1;
        continue;
      }

      if (/[0-9]/.test(ch)) {
        var numberMatch = /^[0-9][0-9A-Za-z_.]*/.exec(line.slice(i));
        out += span("num", numberMatch[0]);
        i += numberMatch[0].length;
        continue;
      }

      if (/[A-Za-z_$]/.test(ch)) {
        var wordMatch = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(line.slice(i));
        var word = wordMatch[0];
        var rest = line.slice(i + word.length);
        var nextChar = rest.replace(/^\s+/, "").charAt(0);
        var cls = null;
        if (KEYWORDS[lang][word]) cls = "kw";
        else if (nextChar === "(") cls = "fn";
        else if (/^[A-Z]/.test(word)) cls = "type";
        out += cls ? span(cls, word) : esc(word);
        i += word.length;
        continue;
      }

      out += esc(ch);
      i += 1;
    }

    return out;
  }

  /* ---------- code rendering ---------- */

  function moreRow(direction, hidden) {
    var amount = Math.min(10, hidden);
    return (
      '<button type="button" class="more-row" data-more="' + direction + '">' +
        '<span class="more-arrow">' + (direction === "up" ? "↑" : "↓") + "</span>" +
        "Show " + amount + " more line" + (amount === 1 ? "" : "s") + " " +
        (direction === "up" ? "above" : "below") +
        '<span class="hidden-count">' + hidden + " hidden</span>" +
      "</button>"
    );
  }

  function callsiteFor(step, lineNo) {
    for (var i = 0; i < step.callsites.length; i++) {
      if (step.callsites[i].line === lineNo) return step.callsites[i];
    }
    return null;
  }

  function renderCode(step) {
    var r = refs[step.id];
    var sn = step.snippet;
    var win = getWindow(step);

    // Highlight from the snippet start so multi-line strings and comments
    // keep their state even when the visible window starts mid-block.
    var prefix = sn.lines.filter(function (pair) {
      return pair[0] >= sn.startLine && pair[0] <= win.end;
    });
    var highlighted = highlightLines(
      prefix.map(function (pair) { return pair[1]; }),
      step.lang
    );
    var byLine = Object.create(null);
    prefix.forEach(function (pair, index) { byLine[pair[0]] = highlighted[index]; });

    var visible = sn.lines.filter(function (pair) {
      return pair[0] >= win.start && pair[0] <= win.end;
    });

    var parts = [];
    var hiddenAbove = win.start - sn.startLine;
    var hiddenBelow = sn.endLine - win.end;

    if (hiddenAbove > 0) parts.push(moreRow("up", hiddenAbove));

    visible.forEach(function (pair) {
      var lineNo = pair[0];
      var classes = ["code-row"];
      if (lineNo >= step.startLine && lineNo <= step.endLine) classes.push("is-target");
      if (lineNo === step.startLine) classes.push("is-start");

      var callsite = callsiteFor(step, lineNo);
      if (callsite) classes.push("is-callsite");

      var marker = "";
      if (callsite) {
        if (callsite.to) {
          marker =
            '<button type="button" class="callsite-tag" data-goto="' + esc(callsite.to) +
            '" title="Jump to ' + esc(callsite.to) + '">↳ ' + esc(callsite.label) + "</button>";
        } else {
          marker =
            '<span class="callsite-tag is-static" title="' + esc(callsite.label) +
            '">↳ ' + esc(callsite.label) + "</span>";
        }
      }

      parts.push(
        '<div class="' + classes.join(" ") + '" data-line="' + lineNo + '">' +
          '<span class="ln">' + lineNo + "</span>" +
          '<span class="src">' + (byLine[lineNo] || " ") + "</span>" +
          marker +
        "</div>"
      );
    });

    if (hiddenBelow > 0) parts.push(moreRow("down", hiddenBelow));

    r.code.innerHTML = parts.join("");
  }

  function updateRange(step) {
    var r = refs[step.id];
    var win = getWindow(step);
    var sn = step.snippet;
    r.range.innerHTML =
      "Lines <b>" + win.start + "</b>–<b>" + win.end + "</b> of " + sn.totalLines +
      " · function <b>" + step.startLine + "</b>–<b>" + step.endLine + "</b>";
  }

  function syncStep(step) {
    var r = refs[step.id];
    var expanded = state.expanded.has(step.id);
    r.article.dataset.expanded = String(expanded);
    r.head.setAttribute("aria-expanded", String(expanded));
    r.body.hidden = !expanded;

    if (expanded) {
      getWindow(step);
      renderCode(step);
      updateRange(step);
    }

    var count = step.callsites.length;
    r.markers.textContent = count
      ? count + " call marker" + (count === 1 ? "" : "s")
      : "no call markers";
  }

  function syncAll() {
    DATA.steps.forEach(syncStep);
  }

  /* ---------- interactions ---------- */

  function toggleStep(id) {
    var step = byId(id);
    if (!step) return;
    if (state.expanded.has(id)) {
      state.expanded.delete(id);
    } else {
      state.expanded.add(id);
      if (!state.windows.has(id)) state.windows.set(id, defaultWindow(step));
    }
    syncStep(step);
  }

  function scrollWithoutSmooth(fn) {
    var root = document.documentElement;
    var previous = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    fn();
    root.style.scrollBehavior = previous;
  }

  function growWindow(id, direction) {
    var step = byId(id);
    if (!step) return;
    var win = getWindow(step);
    var sn = step.snippet;
    var next;

    if (direction === "up") {
      next = { start: Math.max(sn.startLine, win.start - 10), end: win.end };
    } else {
      next = { start: win.start, end: Math.min(sn.endLine, win.end + 10) };
    }
    if (next.start === win.start && next.end === win.end) return;

    var anchor = null;
    var anchorTop = 0;
    if (direction === "up") {
      anchor = refs[id].code.querySelector('.code-row[data-line="' + win.start + '"]');
      if (anchor) anchorTop = anchor.getBoundingClientRect().top;
    }

    state.windows.set(id, next);
    renderCode(step);
    updateRange(step);

    if (anchor) {
      var again = refs[id].code.querySelector('.code-row[data-line="' + win.start + '"]');
      if (again) {
        var delta = again.getBoundingClientRect().top - anchorTop;
        scrollWithoutSmooth(function () { window.scrollBy(0, delta); });
      }
    }
  }

  function openAndScroll(id) {
    var step = byId(id);
    if (!step) return;
    state.expanded.add(id);
    if (!state.windows.has(id)) state.windows.set(id, defaultWindow(step));
    syncStep(step);
    setActiveChip(id);

    requestAnimationFrame(function () {
      var article = document.getElementById("step-" + id);
      if (!article) return;
      article.scrollIntoView({ behavior: "smooth", block: "start" });
      article.dataset.flash = "true";
      setTimeout(function () { delete article.dataset.flash; }, 1200);
      try {
        history.replaceState(null, "", "#" + id);
      } catch (err) {
        /* file:// or sandboxed contexts may refuse this; not important */
      }
    });
  }

  function handleAction(button) {
    var step = byId(button.closest(".step").dataset.step);
    if (!step) return;
    var action = button.dataset.action;

    if (action === "fit") {
      state.windows.set(step.id, defaultWindow(step));
      renderCode(step);
      updateRange(step);
      return;
    }

    if (action === "whole") {
      state.windows.set(step.id, {
        start: step.snippet.startLine,
        end: step.snippet.endLine
      });
      renderCode(step);
      updateRange(step);
      return;
    }

    if (action === "copy") {
      var win = getWindow(step);
      var text = step.snippet.lines
        .filter(function (pair) { return pair[0] >= win.start && pair[0] <= win.end; })
        .map(function (pair) { return pair[1]; })
        .join("\n");
      var lineCount = win.end - win.start + 1;
      copyText(text, "Copied " + lineCount + " line" + (lineCount === 1 ? "" : "s"));
      return;
    }

    if (action === "link") {
      var url = location.href.split("#")[0] + "#" + step.id;
      copyText(url, "Link copied");
    }
  }

  function applyFilters() {
    var query = state.query;
    var visible = Object.create(null);
    var visibleCount = 0;

    DATA.steps.forEach(function (step) {
      var repoOk = state.repos.has(step.repo);
      var haystack = [
        step.repoName,
        step.langName,
        step.file,
        step.symbol,
        step.note,
        step.edge ? step.edge.label : "",
        step.edge ? step.edge.detail : ""
      ]
        .concat(step.callsites.map(function (c) { return c.label; }))
        .join(" ")
        .toLowerCase();

      var show = repoOk && (!query || haystack.indexOf(query) !== -1);
      visible[step.id] = show;
      refs[step.id].article.hidden = !show;
      if (show) visibleCount += 1;
    });

    // A hop only makes sense when both ends of the transition are visible.
    DATA.steps.forEach(function (step, index) {
      var hop = refs[step.id].hop;
      if (!hop) return;
      var next = DATA.steps[index + 1];
      hop.hidden = !visible[step.id] || (next ? !visible[next.id] : false);
    });

    var chips = document.querySelectorAll("#minimap .map-step");
    for (var i = 0; i < chips.length; i++) {
      var targetStep = byId(chips[i].dataset.target);
      if (!targetStep) continue;
      chips[i].hidden = refs[targetStep.id].article.hidden;
    }

    document.getElementById("empty").hidden = visibleCount !== 0;
    updateActiveChip();
  }

  function copyText(text, message) {
    function done() { toast(message || "Copied"); }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        fallbackCopy(text);
        done();
      });
      return;
    }

    fallbackCopy(text);
    done();
  }

  function fallbackCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
    } catch (err) {
      /* ignore */
    }
    area.remove();
  }

  function toast(message) {
    var node = document.getElementById("toast");
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.classList.remove("show"); }, 1800);
  }

  /* ---------- theme ---------- */

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    var button = document.getElementById("btn-theme");
    var dark = theme === "dark";
    button.textContent = dark ? "☀" : "☾";
    button.title = dark ? "Switch to light theme" : "Switch to dark theme";
    button.setAttribute("aria-label", button.title);
  }

  function toggleTheme() {
    var next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_THEME, next);
    } catch (err) {
      /* storage may be unavailable */
    }
    applyTheme(next);
  }

  /* ---------- events ---------- */

  function bindEvents() {
    document.getElementById("repo-filters").addEventListener("click", function (event) {
      var button = event.target.closest("button[data-repo]");
      if (!button) return;
      var id = button.dataset.repo;

      if (id === "all") {
        state.repos = new Set(DATA.repos.map(function (repo) { return repo.id; }));
      } else if (state.repos.size === DATA.repos.length) {
        // First click on a repository isolates it; later clicks toggle.
        state.repos = new Set([id]);
      } else if (state.repos.has(id)) {
        state.repos.delete(id);
        if (state.repos.size === 0) {
          state.repos = new Set(DATA.repos.map(function (repo) { return repo.id; }));
        }
      } else {
        state.repos.add(id);
      }

      syncFilters();
      applyFilters();
    });

    document.getElementById("search").addEventListener("input", function () {
      state.query = this.value.trim().toLowerCase();
      applyFilters();
    });

    document.getElementById("btn-expand-all").addEventListener("click", function () {
      DATA.steps.forEach(function (step) {
        state.expanded.add(step.id);
        if (!state.windows.has(step.id)) state.windows.set(step.id, defaultWindow(step));
      });
      syncAll();
    });

    document.getElementById("btn-collapse-all").addEventListener("click", function () {
      state.expanded.clear();
      syncAll();
    });

    document.getElementById("btn-theme").addEventListener("click", toggleTheme);

    document.getElementById("btn-reset-filter").addEventListener("click", function () {
      state.repos = new Set(DATA.repos.map(function (repo) { return repo.id; }));
      state.query = "";
      document.getElementById("search").value = "";
      syncFilters();
      applyFilters();
    });

    document.getElementById("steps").addEventListener("click", function (event) {
      var more = event.target.closest("[data-more]");
      if (more) {
        var moreStep = more.closest(".step");
        if (moreStep) growWindow(moreStep.dataset.step, more.dataset.more);
        return;
      }

      var goto = event.target.closest("[data-goto]");
      if (goto) {
        openAndScroll(goto.dataset.goto);
        return;
      }

      var action = event.target.closest("[data-action]");
      if (action) {
        handleAction(action);
        return;
      }

      var head = event.target.closest(".step-head");
      if (head) {
        var article = head.closest(".step");
        if (article) toggleStep(article.dataset.step);
      }
    });

    document.getElementById("minimap").addEventListener("click", function (event) {
      var button = event.target.closest(".map-step");
      if (button) openAndScroll(button.dataset.target);
    });

    document.addEventListener("keydown", function (event) {
      var target = event.target;
      var typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (event.key === "Escape" && target && target.id === "search") {
        target.value = "";
        state.query = "";
        applyFilters();
        target.blur();
        return;
      }
      if (typing || event.ctrlKey || event.metaKey || event.altKey) return;

      if (event.key === "/") {
        event.preventDefault();
        document.getElementById("search").focus();
        return;
      }

      var visible = DATA.steps.filter(function (step) {
        return !refs[step.id].article.hidden;
      });
      if (!visible.length) return;

      if (event.key === "j" || event.key === "k") {
        event.preventDefault();
        var current = -1;
        for (var i = 0; i < visible.length; i++) {
          if (refs[visible[i].id].article.contains(document.activeElement)) {
            current = i;
            break;
          }
        }
        var nextIndex;
        if (current === -1) nextIndex = 0;
        else if (event.key === "j") nextIndex = Math.min(current + 1, visible.length - 1);
        else nextIndex = Math.max(current - 1, 0);
        refs[visible[nextIndex].id].head.focus();
        return;
      }

      if (event.key === "e") {
        var focused = null;
        for (var j = 0; j < visible.length; j++) {
          if (refs[visible[j].id].article.contains(document.activeElement)) {
            focused = visible[j];
            break;
          }
        }
        event.preventDefault();
        toggleStep((focused || visible[0]).id);
      }
    });
  }

  function setActiveChip(id) {
    var chips = document.querySelectorAll("#minimap .map-step");
    for (var i = 0; i < chips.length; i++) {
      chips[i].dataset.active = String(chips[i].dataset.target === id);
    }
  }

  function updateActiveChip() {
    var visible = DATA.steps.filter(function (step) {
      return !refs[step.id].article.hidden;
    });
    if (!visible.length) {
      setActiveChip("");
      return;
    }

    var current = visible[0];
    for (var i = 0; i < visible.length; i++) {
      var top = refs[visible[i].id].article.getBoundingClientRect().top;
      if (top <= 150) current = visible[i];
    }
    setActiveChip(current.id);
  }

  var chipFrame = false;
  function onScroll() {
    if (chipFrame) return;
    chipFrame = true;
    requestAnimationFrame(function () {
      chipFrame = false;
      updateActiveChip();
    });
  }

  function setupScrollSpy() {
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    updateActiveChip();
  }

  function openFromHash() {
    var raw = (location.hash || "").replace(/^#/, "");
    if (!raw) return;
    var id = raw.indexOf("step-") === 0 ? raw.slice(5) : raw;
    var step = byId(id);
    if (!step) return;

    state.expanded.add(id);
    if (!state.windows.has(id)) state.windows.set(id, defaultWindow(step));
    syncStep(step);

    setTimeout(function () {
      var article = document.getElementById("step-" + id);
      if (article) article.scrollIntoView({ block: "start" });
    }, 80);
  }

  function preparePrint() {
    // Print shows every step even when collapsed on screen; render the code
    // for hidden steps so the print stylesheet has something to reveal.
    DATA.steps.forEach(function (step) {
      if (!state.windows.has(step.id)) state.windows.set(step.id, defaultWindow(step));
      renderCode(step);
      updateRange(step);
    });
  }

  /* ---------- boot ---------- */

  function init() {
    document.title = DATA.title + " · Call chain explorer";
    setText("#page-title", DATA.title);
    setText("#page-subtitle", DATA.subtitle);
    setText("#foot-generated", "Generated " + formatDate(DATA.generatedAt));
    setText("#foot-spec", DATA.specFile);

    renderMeta();
    renderFilters();
    renderMinimap();
    buildSteps();
    bindEvents();

    if (DATA.steps.length) {
      state.expanded.add(DATA.steps[0].id);
      state.windows.set(DATA.steps[0].id, defaultWindow(DATA.steps[0]));
    }

    syncFilters();
    applyFilters();
    syncAll();
    setupScrollSpy();
    applyTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
    window.addEventListener("beforeprint", preparePrint);
    openFromHash();
  }

  try {
    init();
  } catch (err) {
    fatal("Failed to initialise the viewer: " + (err && err.stack ? err.stack : err));
  }
})();
