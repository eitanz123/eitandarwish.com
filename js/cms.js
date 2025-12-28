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

  function clean(v) {
    return String(v ?? "").trim();
  }

  function toBool(v) {
    return String(v ?? "").trim().toUpperCase() === "TRUE";
  }

  function splitTags(v) {
    const s = clean(v);
    if (!s) return [];
    return s
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 8);
  }

  function firstUrl(v) {
    const s = clean(v);
    if (!s) return "";
    return (
      s
        .split(/[\n,]+/g)
        .map((x) => x.trim())
        .filter(Boolean)[0] || ""
    );
  }

  function escapeHTML(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeText(s) {
    return clean(s).toLowerCase();
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

  function isYouTubeUrl(url) {
    return /(^https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(url);
  }

  function getYouTubeId(url) {
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtu.be")) {
        return u.pathname.replace("/", "").split("/")[0] || "";
      }
      if (u.searchParams.get("v")) return u.searchParams.get("v") || "";
      const parts = u.pathname.split("/").filter(Boolean);
      const iEmbed = parts.indexOf("embed");
      if (iEmbed >= 0 && parts[iEmbed + 1]) return parts[iEmbed + 1];
      const iShorts = parts.indexOf("shorts");
      if (iShorts >= 0 && parts[iShorts + 1]) return parts[iShorts + 1];
      return "";
    } catch {
      const m =
        url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/i) ||
        url.match(/[?&]v=([A-Za-z0-9_-]{6,})/i) ||
        url.match(/\/embed\/([A-Za-z0-9_-]{6,})/i) ||
        url.match(/\/shorts\/([A-Za-z0-9_-]{6,})/i);
      return m?.[1] || "";
    }
  }

  function youtubeThumb(url) {
    const id = getYouTubeId(url);
    if (!id) return "";
    return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  }

  function safeHref(url) {
    const u = clean(url);
    if (!u) return "";
    const lower = u.toLowerCase();
    if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("mailto:")) return u;
    return "";
  }

  function renderMarkdown(md) {
    const raw = String(md ?? "").trim();
    if (!raw) return "";

    let s = escapeHTML(raw).replace(/\r\n/g, "\n");

    // [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, text, url) => {
      const href = safeHref(url);
      if (!href) return text;
      return `<a href="${escapeHTML(href)}" target="_blank" rel="noopener">${text}</a>`;
    });

    // **bold**
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    const lines = s.split("\n");
    let html = "";
    let inList = false;

    const closeList = () => {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
    };

    for (const line of lines) {
      const l = line.trim();
      if (!l) {
        closeList();
        continue;
      }
      if (l.startsWith("### ")) {
        closeList();
        html += `<h4>${l.slice(4)}</h4>`;
        continue;
      }
      if (l.startsWith("## ")) {
        closeList();
        html += `<h3>${l.slice(3)}</h3>`;
        continue;
      }
      if (l.startsWith("# ")) {
        closeList();
        html += `<h2>${l.slice(2)}</h2>`;
        continue;
      }
      if (l.startsWith("- ") || l.startsWith("* ")) {
        if (!inList) {
          html += "<ul>";
          inList = true;
        }
        html += `<li>${l.slice(2)}</li>`;
        continue;
      }
      closeList();
      html += `<p>${l}</p>`;
    }

    closeList();
    return html;
  }

  async function fetchTiles() {
    const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch sheet: ${res.status}`);
    const csv = await res.text();

    const rows = parseCSV(csv);
    if (rows.length < 2) return [];

    const headers = rows[0].map(clean);
    const dataRows = rows.slice(1);

    return dataRows
      .map((r) => {
        const obj = {};
        headers.forEach((h, idx) => (obj[h] = r[idx] ?? ""));

        const tile = {
          slug: clean(obj.slug),
          lane: clean(obj.lane),
          size: clean(obj.size),

          parent_slug: clean(obj.parent_slug),
          child_order: Number(clean(obj.child_order) || 0),

          title: clean(obj.title),
          subtitle: clean(obj.subtitle),
          tags: splitTags(obj.tags),

          image_url: firstUrl(obj.image_url),
          video_url: firstUrl(obj.video_url),
          thumb_url: firstUrl(obj.thumb_url),

          href: clean(obj.href),
          body_md: String(obj.body_md ?? "").trim(),

          start_date: clean(obj.start_date),
          end_date: clean(obj.end_date),
          is_current: obj.is_current,

          published: obj.published,
          featured: obj.featured,
          sort: Number(clean(obj.sort) || 9999),
        };

        tile._search = normalizeText([tile.title, tile.subtitle, tile.tags.join(" ")].join(" "));
        return tile;
      })
      .filter((t) => t.slug && t.lane && t.size)
      .filter((t) => toBool(t.published))
      .sort((a, b) => a.sort - b.sort || a.title.localeCompare(b.title));
  }

  // CARD view: show media ONLY if image_url exists
  function cardMediaThumb(tile) {
    return tile.image_url ? tile.image_url : "";
  }

  // MODAL view: image, else video thumb
  function modalMediaThumb(tile) {
    if (tile.image_url) return tile.image_url;
    if (!tile.video_url) return "";
    if (tile.thumb_url) return tile.thumb_url;
    if (isYouTubeUrl(tile.video_url)) return youtubeThumb(tile.video_url);
    return "";
  }

  // MINIMAL card: title + subtitle + tags + optional image (image only)
  function tileCardHTML(tile, extraClass = "") {
    const laneClass = tile.lane === "creative" ? "tile--creative" : "tile--business";
    const sizeClass = tile.size ? `tile--${tile.size}` : "tile--medium";

    const thumb = cardMediaThumb(tile);
    const hasMedia = Boolean(thumb);

    const mediaHTML = hasMedia
      ? `<div class="tile__media hasImage" style="background-image:url('${thumb.replace(/'/g, "\\'")}')"></div>`
      : "";

    return `
      <button type="button"
        class="tile ${laneClass} ${sizeClass} ${hasMedia ? "tile--hasMedia" : "tile--noMedia"} ${extraClass}"
        data-slug="${escapeHTML(tile.slug)}"
        aria-haspopup="dialog">
        ${mediaHTML}
        <div class="tile__content">
          <h3 class="tile__title">${escapeHTML(tile.title)}</h3>
          ${tile.subtitle ? `<p class="tile__subtitle">${escapeHTML(tile.subtitle)}</p>` : ""}
          ${
            tile.tags.length
              ? `<div class="tile__metaRow">${tile.tags
                  .map((t) => `<span class="pill">${escapeHTML(t)}</span>`)
                  .join("")}</div>`
              : ""
          }
        </div>
      </button>
    `;
  }

  function buildLaneIndex(tiles, lane) {
    const topLevel = tiles.filter((t) => t.lane === lane && !t.parent_slug);
    const children = tiles.filter((t) => t.lane === lane && t.parent_slug);

    const bySlug = new Map();
    for (const t of tiles) bySlug.set(t.slug, t);

    const byParent = new Map();
    for (const c of children) {
      if (!byParent.has(c.parent_slug)) byParent.set(c.parent_slug, []);
      byParent.get(c.parent_slug).push(c);
    }
    for (const [k, arr] of byParent.entries()) {
      arr.sort((a, b) => (a.child_order - b.child_order) || (a.sort - b.sort));
    }

    return { tiles, lane, topLevel, byParent, bySlug };
  }

  function renderLaneFiltered(index, rootEl, matchFn) {
    const out = [];
    let shownCount = 0;

    for (const parent of index.topLevel) {
      const kids = index.byParent.get(parent.slug) || [];

      const parentMatches = matchFn(parent);
      const matchingKids = kids.filter(matchFn);

      // large parents: include if parent matches OR any child matches
      if (parent.size === "large" && kids.length) {
        if (!parentMatches && matchingKids.length === 0) continue;
        out.push(tileCardHTML(parent));
        shownCount += 1;
        continue;
      }

      if (!parentMatches) continue;
      out.push(tileCardHTML(parent));
      shownCount += 1;
    }

    rootEl.innerHTML = `<div class="tilesGrid">${out.join("")}</div>`;
    return shownCount;
  }

  function ensureModal() {
    let overlay = document.getElementById("tileModalOverlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "tileModalOverlay";
    overlay.className = "tileModalOverlay";
    overlay.setAttribute("aria-hidden", "true");

    overlay.innerHTML = `
      <div class="tileModal" role="dialog" aria-modal="true" aria-labelledby="tileModalTitle">
        <button type="button" class="tileModal__close" aria-label="Close">✕</button>
        <div class="tileModal__inner">
          <div id="tileModalMedia" class="tileModal__media" style="display:none;"></div>

          <div class="tileModal__head">
            <h2 id="tileModalTitle" class="tileModal__title"></h2>
            <div id="tileModalSub" class="tileModal__sub"></div>
            <div id="tileModalMeta" class="tileModal__meta"></div>
          </div>

          <div id="tileModalTags" class="tileModal__tags"></div>

          <div id="tileModalBody" class="tileModal__body"></div>

          <div id="tileModalChildrenWrap" class="tileModal__childrenWrap" style="display:none;">
            <div class="tileModal__childrenLabel">Included work</div>
            <div id="tileModalChildren" class="tileModal__children"></div>
          </div>

          <div id="tileModalActions" class="tileModal__actions" style="display:none;"></div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal();
    });

    overlay.querySelector(".tileModal__close")?.addEventListener("click", closeModal);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.body.classList.contains("modal-open")) closeModal();
    });

    return overlay;
  }

  function openModalWithTile(index, tile) {
    const overlay = ensureModal();

    const titleEl = overlay.querySelector("#tileModalTitle");
    const subEl = overlay.querySelector("#tileModalSub");
    const metaEl = overlay.querySelector("#tileModalMeta");
    const tagsEl = overlay.querySelector("#tileModalTags");
    const bodyEl = overlay.querySelector("#tileModalBody");
    const mediaEl = overlay.querySelector("#tileModalMedia");
    const childrenWrap = overlay.querySelector("#tileModalChildrenWrap");
    const childrenEl = overlay.querySelector("#tileModalChildren");
    const actionsEl = overlay.querySelector("#tileModalActions");

    titleEl.textContent = tile.title || "";
    subEl.textContent = tile.subtitle || "";

    const dates = formatDates(tile.start_date, tile.end_date, tile.is_current);
    const parts = [];
    if (tile.lane) parts.push(tile.lane.toUpperCase());
    if (tile.size) parts.push(tile.size.toUpperCase());
    if (dates) parts.push(dates);
    metaEl.textContent = parts.join(" • ");

    tagsEl.innerHTML = tile.tags?.length
      ? tile.tags.map((t) => `<span class="pill">${escapeHTML(t)}</span>`).join("")
      : "";

    bodyEl.innerHTML = tile.body_md ? renderMarkdown(tile.body_md) : "";

    const hero = modalMediaThumb(tile);
    if (hero) {
      mediaEl.style.display = "";
      mediaEl.style.backgroundImage = `url('${hero.replace(/'/g, "\\'")}')`;
    } else {
      mediaEl.style.display = "none";
      mediaEl.style.backgroundImage = "none";
    }

    const actions = [];
    const hrefSafe = safeHref(tile.href);
    const videoSafe = safeHref(tile.video_url);
    if (hrefSafe) actions.push(`<a class="btn" target="_blank" rel="noopener" href="${escapeHTML(hrefSafe)}">Open link</a>`);
    if (videoSafe) actions.push(`<a class="btn btn--ghost" target="_blank" rel="noopener" href="${escapeHTML(videoSafe)}">Watch video</a>`);

    if (actions.length) {
      actionsEl.style.display = "";
      actionsEl.innerHTML = actions.join("");
    } else {
      actionsEl.style.display = "none";
      actionsEl.innerHTML = "";
    }

    // ✅ children as REAL tiles (not mini tiles)
    const kids = index.byParent.get(tile.slug) || [];
    if (tile.size === "large" && kids.length) {
      childrenWrap.style.display = "";
      childrenEl.innerHTML = `
        <div class="tilesGrid tilesGrid--modal">
          ${kids.map((k) => tileCardHTML(k, "tile--inModal")).join("")}
        </div>
      `;
    } else {
      childrenWrap.style.display = "none";
      childrenEl.innerHTML = "";
    }

    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    overlay.querySelector(".tileModal__close")?.focus();

    // Clicking child tile opens it
    childrenEl.onclick = (e) => {
      e.preventDefault?.(); // extra safety
      const btn = e.target.closest("[data-slug]");
      if (!btn) return;
      const slug = btn.getAttribute("data-slug");
      const next = index.bySlug.get(slug);
      if (next) openModalWithTile(index, next);
    };
  }

  function closeModal() {
    const overlay = document.getElementById("tileModalOverlay");
    if (!overlay) return;
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  async function initFromBody() {
    const lane = document.body.getAttribute("data-lane");
    const rootId = document.body.getAttribute("data-tiles-root") || "tilesRoot";
    if (!lane) return;

    const root = document.getElementById(rootId);
    if (!root) return;

    const searchInput = document.getElementById("searchInput");
    const chipRoot = document.getElementById("tagChips");
    const clearBtn = document.getElementById("clearFilters");
    const resultsMeta = document.getElementById("resultsMeta");

    try {
      const tiles = await fetchTiles();
      const index = buildLaneIndex(tiles, lane);

      const allTags = Array.from(
        new Set(tiles.filter((t) => t.lane === lane).flatMap((t) => t.tags))
      ).sort((a, b) => a.localeCompare(b));

      const selected = new Set();
      let query = "";

      if (chipRoot) {
        chipRoot.innerHTML = allTags
          .map((t) => `<button type="button" class="chipBtn" data-tag="${escapeHTML(t)}">${escapeHTML(t)}</button>`)
          .join("");
      }

      function matches(tile) {
        if (selected.size) {
          const hasAny = tile.tags.some((t) => selected.has(t));
          if (!hasAny) return false;
        }
        if (query) {
          if (!tile._search.includes(query)) return false;
        }
        return true;
      }

      function rerender() {
        const shown = renderLaneFiltered(index, root, matches);
        if (resultsMeta) resultsMeta.textContent = `${shown} shown`;
      }

      if (chipRoot) {
        chipRoot.addEventListener("click", (e) => {
          const btn = e.target.closest(".chipBtn");
          if (!btn) return;
          const tag = btn.getAttribute("data-tag");
          if (!tag) return;

          if (selected.has(tag)) {
            selected.delete(tag);
            btn.classList.remove("is-active");
          } else {
            selected.add(tag);
            btn.classList.add("is-active");
          }
          rerender();
        });
      }

      if (searchInput) {
        searchInput.addEventListener("input", () => {
          query = normalizeText(searchInput.value);
          rerender();
        });
      }

      if (clearBtn) {
        clearBtn.addEventListener("click", () => {
          selected.clear();
          query = "";
          if (searchInput) searchInput.value = "";
          if (chipRoot) chipRoot.querySelectorAll(".chipBtn.is-active").forEach((b) => b.classList.remove("is-active"));
          rerender();
        });
      }

      // ✅ event delegation: ALWAYS prevent navigation
      root.addEventListener("click", (e) => {
        e.preventDefault?.();
        const el = e.target.closest("[data-slug]");
        if (!el) return;
        const slug = el.getAttribute("data-slug");
        const tile = index.bySlug.get(slug);
        if (tile) openModalWithTile(index, tile);
      });

      rerender();
    } catch (err) {
      console.error(err);
      root.innerHTML = `<p style="color: rgba(15,23,42,0.65);">Could not load tiles from the CMS.</p>`;
    }
  }

  document.addEventListener("DOMContentLoaded", initFromBody);
  window.PortfolioCMS = { fetchTiles };
})();

