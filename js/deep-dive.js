// Deep dive page: deep-dive.html?slug=...
const qs = (sel, el=document) => el.querySelector(sel);

function setTheme(theme){
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

function escapeHtml(str){
  return (str || "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function escapeAttr(str){ return escapeHtml(str); }

function renderMedia(media){
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

function tagChip(t){
  return `<span class="chip is-active" style="cursor:default"><span class="chip__group">${escapeHtml(t.group)}</span>${escapeHtml(t.value)}</span>`;
}

function cardHtml(exp){
  const tagsShort = (exp.tags || []).slice(0, 3).map(t => `${t.value}`).join(" • ");
  const metaBits = [exp.subtitle, exp.timeframe, exp.location, tagsShort].filter(Boolean);

  const paragraphs = (exp.content?.paragraphs || []).map(p => `<p>${escapeHtml(p)}</p>`).join("");
  const links = (exp.content?.links || []).map(l => `<a class="btn btn--ghost" target="_blank" rel="noopener" href="${escapeAttr(l.url)}">${escapeHtml(l.label)}</a>`).join("");

  return `<article class="card">
    <div class="card__top">
      <div>
        <div class="kicker">${escapeHtml(exp.kicker || "")}</div>
        <h3 class="card__title">${escapeHtml(exp.title || "")}</h3>
        <p class="card__subtitle">${escapeHtml(exp.summary || "")}</p>
      </div>
    </div>
    <div class="card__meta">${metaBits.map(m => `<span>${escapeHtml(m)}</span>`).join(" • ")}</div>
    ${paragraphs ? `<div class="prose">${paragraphs}</div>` : ""}
    ${links ? `<div class="card__links">${links}</div>` : ""}
  </article>`;
}

async function init(){
  loadTheme();

  const year = qs("#year");
  if (year) year.textContent = new Date().getFullYear();

  const params = new URLSearchParams(window.location.search);
  const slug = params.get("slug");

  if (!slug){
    qs("#detailTitle").textContent = "Missing slug";
    return;
  }

  const res = await fetch("data/experiences.json", { cache: "no-store" });
  const data = await res.json();

  const exp = (data.experiences || []).find(e => e.slug === slug);
  if (!exp){
    qs("#detailTitle").textContent = "Not found";
    qs("#detailMeta").textContent = "No experience matches that slug.";
    return;
  }

  // Set back link based on lane
  const back = qs("#backLink");
  if (back){
    if (exp.bucket === "business"){
      back.href = "business-experiences.html#work";
      back.textContent = "Back to Business";
    } else {
      back.href = "creative-experiences.html#work";
      back.textContent = "Back to Creative";
    }
  }

  qs("#detailKicker").textContent = exp.kicker || (exp.bucket === "business" ? "Business" : "Creative");
  qs("#detailTitle").textContent = exp.title;

  const metaBits = [exp.subtitle, exp.timeframe, exp.location].filter(Boolean);
  qs("#detailMeta").innerHTML = metaBits.map(x => `<span>${escapeHtml(x)}</span>`).join(" • ");

  qs("#detailTags").innerHTML = (exp.tags || []).map(tagChip).join("");

  const body = [];
  if (exp.summary) body.push(`<p><strong>Summary:</strong> ${escapeHtml(exp.summary)}</p>`);
  (exp.content?.paragraphs || []).forEach(p => body.push(`<p>${escapeHtml(p)}</p>`));

  if ((exp.content?.links || []).length){
    body.push(`<div class="card__links">${exp.content.links.map(l => `<a class="btn btn--ghost" target="_blank" rel="noopener" href="${escapeAttr(l.url)}">${escapeHtml(l.label)}</a>`).join("")}</div>`);
  }

  if ((exp.content?.media || []).length){
    body.push(renderMedia(exp.content.media));
  }

  qs("#detailBody").innerHTML = body.join("");

  const subs = exp.sub_experiences || [];
  if (subs.length){
    qs("#subHead").style.display = "";
    qs("#subGrid").innerHTML = subs.map(cardHtml).join("");
  }
}

init().catch(err => {
  console.error(err);
  const t = qs("#detailTitle");
  if (t) t.textContent = "Failed to load data";
});
