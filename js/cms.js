// js/cms.js
(() => {
  const SHEET_CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vTXOM47UPnUjDub8Ev9ClMwivKa8hS4lttp8cR3Tn_P_vlTHXWtiSfncU4XDUu13oL7GCb0UrA0---o/pub?gid=0&single=true&output=csv";

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (ch === '"' && inQuotes && next === '"') {
        cur += '"';
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        row.push(cur);
        cur = "";
        continue;
      }
      if ((ch === "\n" || ch === "\r") && !inQuotes) {
        if (ch === "\r" && next === "\n") i++;
        row.push(cur);
        cur = "";
        if (row.some((c) => c.trim() !== "")) rows.push(row);
        row = [];
        continue;
      }
      cur += ch;
    }
    row.push(cur);
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    return rows;
  }

  function toBool(v) {
    return String(v || "").trim().toUpperCase() === "TRUE";
  }

  function clean(v) {
    return String(v || "").trim();
  }

  function splitTags(v) {
    const s = clean(v);
    if (!s) return [];
    return s
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  function formatDates(start, end, isCurrent) {
    const s = clean(start);
    const e = clean(end);
    const curr = toBool(isCurrent);
    if (!s && !e && !curr) return "";
    if (s && (e || curr)) return `${s} — ${curr ? "Present" : e}`;
    if (s) return s;
    if (e) return e;
    return "Present";
  }

  async function fetchTiles() {
    const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status}`);
    const csv = await res.text();

    const rows = parseCSV(csv);
    if (rows.length < 2) return [];

    const headers = rows[0].map((h) => clean(h));
    const dataRows = rows.slice(1);

    return dataRows
      .map((r) => {
        const obj = {};
        headers.forEach((h, idx) => (obj[h] = r[idx] ?? ""));
        return {
          slug: clean(obj.slug),
          lane: clean(obj.lane),
          size: clean(obj.size), // small | medium | large
          parent_slug: clean(obj.parent_slug),
          child_order: Number(clean(obj.child_order) || 0),
          title: clean(obj.title),
          subtitle: clean(obj.subtitle),
          tags: splitTags(obj.tags),
          image_url: clean(obj.image_url),
          thumb_url: clean(obj.thumb_url),
          href: clean(obj.href),
          body_md: String(obj.body_md || "").trim(),
          start_date: clean(obj.start_date),
          end_date: clean(obj.end_date),
          is_current: obj.is_current,
          published: obj.published,
          featured: obj.featured,
          sort: Number(clean(obj.sort) || 9999),
        };
      })
      .filter((t) => t.slug && t.lane && t.size)
      .filter((t) => toBool(t.published))
      .sort((a, b) => (a.sort - b.sort) || a.title.localeCompare(b.title));
  }

  function escapeHTML(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function tileHref(tile) {
    if (tile.href) return tile.href;
    return `deep-dive.html?slug=${encodeURIComponent(tile.slug)}`;
  }

  function tileHTML(tile) {
    const laneClass = tile.lane === "creative" ? "tile--creative" : "tile--business";
    const sizeClass = tile.size ? `tile--${tile.size}` : "tile--medium";
    const mediaStyle = tile.image_url
      ? `style="background-image:url('${tile.image_url.replace(/'/g, "\\'")}')"`
      : "";

    const dates = formatDates(tile.start_date, tile.end_date, tile.is_current);

    return `
      <a class="tile ${laneClass} ${sizeClass}" href="${tileHref(tile)}" data-slug="${tile.slug}">
        <div class="tile__media ${tile.image_url ? "hasImage" : ""}" ${mediaStyle}></div>

        <div class="tile__content">
          <p class="tile__kicker">${escapeHTML(tile.lane.toUpperCase())} • ${escapeHTML(tile.size.toUpperCase())}</p>
          <h3 class="tile__title">${escapeHTML(tile.title)}</h3>
          ${tile.subtitle ? `<p class="tile__subtitle">${escapeHTML(tile.subtitle)}</p>` : ""}
          ${dates ? `<div class="tile__dates">${escapeHTML(dates)}</div>` : ""}
          ${
            tile.tags.length
              ? `<div class="tile__metaRow">${tile.tags
                  .map((t) => `<span class="pill">${escapeHTML(t)}</span>`)
                  .join("")}</div>`
              : ""
          }
        </div>
      </a>
    `;
  }

  // ---------- Filtering logic ----------
  const state = {
    lane: null,
    q: "",
    activeTag: "",
    allTiles: [],
  };

  function normalize(s) {
    return clean(s).toLowerCase();
  }

  function matches(tile) {
    // Tag filter
    if (state.activeTag) {
      const tagMatch = tile.tags.some((t) => normalize(t) === normalize(state.activeTag));
      if (!tagMatch) return false;
    }

    // Search filter: title/subtitle/tags/body
    const q = normalize(state.q);
    if (!q) return true;

    const hay = [
      tile.title,
      tile.subtitle,
      tile.tags.join(" "),
      tile.body_md,
      tile.slug,
    ]
      .map(normalize)
      .join(" • ");

    return hay.includes(q);
  }

  function applyFilters(tiles) {
    return tiles.filter(matches);
  }

  function buildTagList(tilesForLane) {
    const map = new Map(); // tag -> count
    for (const t of tilesForLane) {
      for (const tag of t.tags) {
        const key = clean(tag);
        if (!key) continue;
        map.set(key, (map.get(key) || 0) + 1);
      }
    }
    // sort by count desc, then alpha
    return [...map.entries()]
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      .map(([tag]) => tag);
  }

  function renderTagChips(tags, el) {
    if (!el) return;
    el.innerHTML = tags
      .map((tag) => {
        const active = normalize(tag) === normalize(state.activeTag);
        return `<button class="chipBtn ${active ? "is-active" : ""}" type="button" data-tag="${escapeHTML(tag)}">${escapeHTML(tag)}</button>`;
      })
      .join("");

    el.querySelectorAll("button[data-tag]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tag = btn.getAttribute("data-tag") || "";
        state.activeTag = normalize(tag) === normalize(state.activeTag) ? "" : tag;
        refresh();
      });
    });
  }

  function setResultsMeta(el, count, total) {
    if (!el) return;
    const tagPart = state.activeTag ? ` • tag: ${state.activeTag}` : "";
    const qPart = state.q ? ` • search: “${state.q}”` : "";
    el.textContent = `${count} / ${total} shown${tagPart}${qPart}`;
  }

  // ---------- Rendering lane with grouping ----------
  function renderLane(tiles, lane, rootEl) {
    const bySlug = new Map(tiles.map((t) => [t.slug, t]));

    // Top-level = no parent OR parent missing (orphan children become standalone)
    const topLevel = tiles.filter(
        (t) => t.lane === lane && (!t.parent_slug || !bySlug.has(t.parent_slug))
    );

    // Children = only those whose parent exists in this render set
    const children = tiles.filter(
        (t) => t.lane === lane && t.parent_slug && bySlug.has(t.parent_slug)
    );


    const groups = topLevel.map((parent) => {
      const kids = children
        .filter((c) => c.parent_slug === parent.slug)
        .sort((a, b) => (a.child_order - b.child_order) || (a.sort - b.sort));

      if (parent.size === "large" && kids.length) {
        return `
          <section class="tileGroup">
            ${tileHTML(parent)}
            <div class="tileGroup__children">
              ${kids.map(tileHTML).join("")}
            </div>
          </section>
        `;
      }
      return tileHTML(parent);
    });

    const standalone = groups.filter((g) => g.trimStart().startsWith("<a "));
    const grouped = groups.filter((g) => g.trimStart().startsWith("<section"));


    rootEl.innerHTML = `
      ${grouped.join("")}
      <div class="tilesGrid">
        ${standalone.join("")}
      </div>
    `;
  }

  // ---------- Wire UI + refresh ----------
  function refresh() {
    const rootId = document.body.getAttribute("data-tiles-root") || "tilesRoot";
    const root = document.getElementById(rootId);
    if (!root) return;

    const laneTiles = state.allTiles.filter((t) => t.lane === state.lane);
    const filtered = applyFilters(laneTiles);

    // IMPORTANT: keep hierarchy coherent:
    // - If a child matches, include its parent.
    // - If a parent matches, include it (and allow its kids to show only if they match).
    const bySlug = new Map(laneTiles.map((t) => [t.slug, t]));
    const keep = new Map();

    for (const t of filtered) {
      keep.set(t.slug, t);
      if (t.parent_slug) {
        const p = bySlug.get(t.parent_slug);
        if (p) keep.set(p.slug, p);
      }
    }

    // Now decide which children to show:
    // - show children if they themselves match filters
    // - but only under parents that are kept
    const keptList = [...keep.values()];

    // We want to render:
    // - Top-level parents that are kept
    // - Children that match, under their parent
    // So we pass a tiles list that includes:
    // - all kept top-level tiles
    // - matching children only
    const matchingChildren = filtered.filter((t) => t.parent_slug);
    const matchingTopLevel = keptList.filter((t) => !t.parent_slug);

    const renderList = [...matchingTopLevel, ...matchingChildren]
      .filter((t) => t.lane === state.lane)
      .sort((a, b) => (a.sort - b.sort) || a.title.localeCompare(b.title));

    renderLane(renderList, state.lane, root);

    const resultsMeta = document.getElementById("resultsMeta");
    setResultsMeta(resultsMeta, filtered.length, laneTiles.length);

    // Update chip active state
    const chipWrap = document.getElementById("tagChips");
    if (chipWrap) {
      chipWrap.querySelectorAll("button[data-tag]").forEach((btn) => {
        const tag = btn.getAttribute("data-tag") || "";
        btn.classList.toggle("is-active", normalize(tag) === normalize(state.activeTag));
      });
    }
  }

  async function initFromBody() {
    state.lane = document.body.getAttribute("data-lane");
    if (!state.lane) return;

    const rootId = document.body.getAttribute("data-tiles-root") || "tilesRoot";
    const root = document.getElementById(rootId);
    if (!root) return;

    try {
      state.allTiles = await fetchTiles();

      // Build tag chips from this lane only
      const laneTiles = state.allTiles.filter((t) => t.lane === state.lane);
      const tags = buildTagList(laneTiles);

      renderTagChips(tags, document.getElementById("tagChips"));

      // Wire search + clear if present
      const searchInput = document.getElementById("searchInput");
      if (searchInput) {
        searchInput.addEventListener("input", (e) => {
          state.q = e.target.value || "";
          refresh();
        });
      }

      const clearBtn = document.getElementById("clearFilters");
      if (clearBtn) {
        clearBtn.addEventListener("click", () => {
          state.q = "";
          state.activeTag = "";
          const si = document.getElementById("searchInput");
          if (si) si.value = "";
          refresh();
        });
      }

      // Initial render
      refresh();
    } catch (err) {
      console.error(err);
      root.innerHTML = `<p style="color: rgba(255,255,255,0.75);">Could not load tiles from the CMS.</p>`;
    }
  }

  document.addEventListener("DOMContentLoaded", initFromBody);

  window.PortfolioCMS = { fetchTiles };
})();
