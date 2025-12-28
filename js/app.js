// Simple, fast, dependency-free.
// Data lives in /data/experiences.json (swap later for Google Sheets JSON).

const state = {
  all: [],
  lane: "business",
  search: "",
  selectedTags: new Set(), // serialized as "Group::Value"
  tagGroup: "__all__",
  theme: "dark",
};

function qs(sel, el=document){ return el.querySelector(sel); }
function qsa(sel, el=document){ return [...el.querySelectorAll(sel)]; }

function setTheme(theme){
  state.theme = theme;
  document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "dark");
  localStorage.setItem("theme", theme);
}

function loadTheme(){
  const saved = localStorage.getItem("theme");
  if (saved) setTheme(saved);
  else {
    const prefersLight = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    setTheme(prefersLight ? "light" : "dark");
  }
}

function normalize(s){ return (s || "").toString().toLowerCase(); }

function tagKey(tag){ return `${tag.group}::${tag.value}`; }

function laneLabel(){
  return state.lane === "business" ? "Business" : "Creative";
}

function escapeHtml(str){
  return (str || "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function escapeAttr(str){ return escapeHtml(str); }

function experienceMatches(exp){
  if (exp.bucket !== state.lane) return false;

  const haystack = normalize([
    exp.title, exp.subtitle, exp.timeframe, exp.location,
    exp.summary,
    ...(exp.tags || []).map(t => `${t.group} ${t.value}`),
    ...(exp.content?.paragraphs || [])
  ].join(" "));

  if (state.search && !haystack.includes(normalize(state.search))) return false;

  if (state.selectedTags.size > 0){
    const expKeys = new Set((exp.tags || []).map(tagKey));
    for (const key of state.selectedTags){
      if (!expKeys.has(key)) return false;
    }
  }
  return true;
}

function getFiltered(){
  return state.all.filter(experienceMatches);
}

function uniqueTagsForLane(){
  const tags = [];
  for (const exp of state.all){
    if (exp.bucket !== state.lane) continue;
    for (const t of (exp.tags || [])) tags.push(t);
  }
  const seen = new Set();
  const uniq = [];
  for (const t of tags){
    const k = tagKey(t);
    if (!seen.has(k)){
      seen.add(k);
      uniq.push(t);
    }
  }
  uniq.sort((a,b) => (a.group.localeCompare(b.group) || a.value.localeCompare(b.value)));
  return uniq;
}

function renderTagGroupSelect(){
  const sel = qs("#tagGroupSelect");
  if (!sel) return;

  const tags = uniqueTagsForLane();
  const groups = [...new Set(tags.map(t => t.group))];

  sel.innerHTML =
    `<option value="__all__">All</option>` +
    groups.map(g => `<option value="${escapeAttr(g)}">${escapeHtml(g)}</option>`).join("");

  sel.value = state.tagGroup;
}

function renderChips(){
  const wrap = qs("#tagChips");
  if (!wrap) return;

  const tags = uniqueTagsForLane().filter(t => state.tagGroup === "__all__" ? true : t.group === state.tagGroup);

  wrap.innerHTML = tags.map(t => {
    const key = tagKey(t);
    const active = state.selectedTags.has(key) ? "is-active" : "";
    return `<button class="chip ${active}" type="button" data-key="${escapeAttr(key)}">
      <span class="chip__group">${escapeHtml(t.group)}</span>${escapeHtml(t.value)}
    </button>`;
  }).join("");

  qsa(".chip", wrap).forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-key");
      if (state.selectedTags.has(key)) state.selectedTags.delete(key);
      else state.selectedTags.add(key);
      renderCards();
      renderChips();
    });
  });
}

function detailPill(level){
  if (level === "L") return `<span class="pill pill--l">L</span>`;
  if (level === "M") return `<span class="pill pill--m">M</span>`;
  return `<span class="pill pill--h">H</span>`;
}

function renderModalMedia(media){
  if (!media || media.length === 0) return "";
  const items = media.map(m => {
    if (m.type === "image"){
      return `<div class="media__item">
        <img src="${escapeAttr(m.url)}" alt="${escapeAttr(m.caption || "")}"/>
        ${m.caption ? `<div class="media__caption">${escapeHtml(m.caption)}</div>` : ""}
      </div>`;
    }
    if (m.type === "embed"){
      return `<div class="media__item">
        <div class="embed"><iframe src="${escapeAttr(m.url)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>
        ${m.caption ? `<div class="media__caption">${escapeHtml(m.caption)}</div>` : ""}
      </div>`;
    }
    if (m.type === "video"){
      return `<div class="media__item">
        <video controls preload="metadata" style="width:100%;display:block;">
          <source src="${escapeAttr(m.url)}"/>
        </video>
        ${m.caption ? `<div class="media__caption">${escapeHtml(m.caption)}</div>` : ""}
      </div>`;
    }
    return "";
  }).join("");
  return `<div class="media">${items}</div>`;
}

function openModal(exp){
  const overlay = qs("#modalOverlay");
  if (!overlay) return;

  overlay.classList.add("is-open");
  overlay.setAttribute("aria-hidden", "false");

  const kicker = qs("#modalKicker");
  const title = qs("#modalTitle");
  const tagsWrap = qs("#modalTags");
  const body = qs("#modalBody");

  if (kicker) kicker.textContent = exp.kicker || laneLabel();
  if (title) title.textContent = exp.title;

  if (tagsWrap){
    tagsWrap.innerHTML = (exp.tags || []).map(t => `<span class="chip is-active" style="cursor:default"><span class="chip__group">${escapeHtml(t.group)}</span>${escapeHtml(t.value)}</span>`).join("");
  }

  const paragraphs = (exp.content?.paragraphs || []).map(p => `<p>${escapeHtml(p)}</p>`).join("");
  const links = (exp.content?.links || []).map(l => `<a class="btn btn--ghost" target="_blank" rel="noopener" href="${escapeAttr(l.url)}">${escapeHtml(l.label)}</a>`).join("");
  const media = renderModalMedia(exp.content?.media || []);

  if (body){
    body.innerHTML = `
      <div class="prose">${paragraphs || `<p>${escapeHtml(exp.summary || "")}</p>`}</div>
      ${media}
      ${links ? `<div class="card__links">${links}</div>` : ""}
    `;
  }

  const deep = qs("#modalDeepDive");
  if (deep){
    if (exp.detail_level === "H"){
      deep.style.display = "";
      deep.href = `deep-dive.html?slug=${encodeURIComponent(exp.slug)}`;
    } else {
      deep.style.display = "none";
      deep.href = "#";
    }
  }

  const close = () => closeModal();
  const closeBtn = qs("#modalClose");
  const doneBtn = qs("#modalDone");
  if (closeBtn) closeBtn.onclick = close;
  if (doneBtn) doneBtn.onclick = close;

  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  document.addEventListener("keydown", onEscClose, { once: true });
}

function onEscClose(e){
  if (e.key === "Escape") closeModal();
  else document.addEventListener("keydown", onEscClose, { once: true });
}

function closeModal(){
  const overlay = qs("#modalOverlay");
  if (!overlay) return;
  overlay.classList.remove("is-open");
  overlay.setAttribute("aria-hidden", "true");
}

function renderCards(){
  const grid = qs("#cards");
  if (!grid) return;

  const results = getFiltered();

  const meta = qs("#resultsMeta");
  if (meta) meta.textContent = `${results.length} result${results.length===1?"":"s"} in ${laneLabel()}`;

  grid.innerHTML = results.map(exp => {
    const tagsShort = (exp.tags || []).slice(0, 3).map(t => `${t.value}`).join(" • ");
    const metaBits = [exp.timeframe, exp.location, tagsShort].filter(Boolean);

    return `<article class="card" tabindex="0" role="button" aria-label="${escapeAttr(exp.title)}" data-slug="${escapeAttr(exp.slug)}">
      <div class="card__top">
        <div>
          <div class="kicker">${escapeHtml(exp.kicker || laneLabel())}</div>
          <h3 class="card__title">${escapeHtml(exp.title)}</h3>
          <p class="card__subtitle">${escapeHtml(exp.subtitle || "")}</p>
        </div>
        <div class="card__badges">
          ${detailPill(exp.detail_level)}
        </div>
      </div>

      <div class="card__meta">${metaBits.map(m => `<span>${escapeHtml(m)}</span>`).join(" • ")}</div>

      <div class="card__expand">
        <div class="prose">
          <p>${escapeHtml(exp.summary || "")}</p>
        </div>
        <div class="card__links">
          ${(exp.content?.links || []).slice(0,2).map(l => `<a class="btn btn--ghost" target="_blank" rel="noopener" href="${escapeAttr(l.url)}">${escapeHtml(l.label)}</a>`).join("")}
          ${exp.detail_level === "H" ? `<a class="btn btn--primary" href="deep-dive.html?slug=${encodeURIComponent(exp.slug)}">Open</a>` : ``}
        </div>
      </div>
    </article>`;
  }).join("");

  qsa(".card", grid).forEach(card => {
    const slug = card.getAttribute("data-slug");
    const exp = state.all.find(e => e.slug === slug);
    if (!exp) return;

    const open = () => {
      if (exp.detail_level === "L"){
        card.classList.toggle("is-expanded");
      } else if (exp.detail_level === "M"){
        openModal(exp);
      } else {
        window.location.href = `deep-dive.html?slug=${encodeURIComponent(exp.slug)}`;
      }
    };

    card.addEventListener("click", (e) => {
      if (e.target.closest("a,button")) return;
      open();
    });

    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " "){
        e.preventDefault();
        open();
      }
    });
  });
}

function updateLaneButtonsUI(){
  const b = qs("#laneBusiness");
  const c = qs("#laneCreative");
  if (!b || !c) return;

  const isBiz = state.lane === "business";

  b.classList.toggle("is-active", isBiz);
  c.classList.toggle("is-active", !isBiz);

  b.setAttribute("aria-selected", isBiz ? "true" : "false");
  c.setAttribute("aria-selected", !isBiz ? "true" : "false");
}

function setLane(lane){
  if (lane !== "business" && lane !== "creative") return;
  state.lane = lane;

  // reset filters when switching lanes
  state.search = "";
  state.selectedTags.clear();
  state.tagGroup = "__all__";

  const search = qs("#searchInput");
  if (search) search.value = "";

  const groupSel = qs("#tagGroupSelect");
  if (groupSel) groupSel.value = "__all__";

  updateLaneButtonsUI();
  render();
}

function getInitialLane(){
  const laneAttr = document.body?.dataset?.lane;
  if (laneAttr === "business" || laneAttr === "creative") return laneAttr;

  const p = new URLSearchParams(window.location.search).get("lane");
  if (p === "business" || p === "creative") return p;

  return "business";
}

function render(){
  renderTagGroupSelect();
  renderChips();
  renderCards();
}

async function init(){
  loadTheme();

  const year = qs("#year");
  if (year) year.textContent = new Date().getFullYear();

  state.lane = getInitialLane();

  const res = await fetch("data/experiences.json", { cache: "no-store" });
  const data = await res.json();
  state.all = data.experiences || [];

  // Optional lane toggle (exists on index.html)
  const laneBusinessBtn = qs("#laneBusiness");
  const laneCreativeBtn = qs("#laneCreative");

  if (laneBusinessBtn) laneBusinessBtn.addEventListener("click", () => setLane("business"));
  if (laneCreativeBtn) laneCreativeBtn.addEventListener("click", () => setLane("creative"));

  updateLaneButtonsUI();

  // Filters
  const search = qs("#searchInput");
  if (search){
    search.addEventListener("input", (e) => {
      state.search = e.target.value || "";
      renderCards();
    });
  }

  const groupSel = qs("#tagGroupSelect");
  if (groupSel){
    groupSel.addEventListener("change", (e) => {
      state.tagGroup = e.target.value;
      renderChips();
    });
  }

  const clear = qs("#clearFilters");
  if (clear){
    clear.addEventListener("click", () => {
      state.search = "";
      if (search) search.value = "";
      state.selectedTags.clear();
      state.tagGroup = "__all__";
      if (groupSel) groupSel.value = "__all__";
      render();
    });
  }

  // Theme toggle
  const themeBtn = qs("#themeToggle");
  if (themeBtn){
    themeBtn.addEventListener("click", () => {
      setTheme(state.theme === "light" ? "dark" : "light");
    });
  }

  // Copy email (exists only on index.html)
  const copyBtn = qs("#copyEmail");
  if (copyBtn){
    copyBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      try{
        await navigator.clipboard.writeText("hello@eitandarwish.com");
        const prev = copyBtn.textContent;
        copyBtn.textContent = "Copied";
        setTimeout(()=>copyBtn.textContent=prev, 1200);
      }catch(_){}
    });
  }

  render();
}

init().catch(err => {
  console.error(err);
  const meta = qs("#resultsMeta");
  if (meta) meta.textContent = "Failed to load data. Are you running a local server?";
});
