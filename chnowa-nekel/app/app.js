// ---------- storage ----------
const S = {
  get(k, d) { try { const v = localStorage.getItem("cn_" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("cn_" + k, JSON.stringify(v)); } catch (e) {} }
};
let prices = S.get("prices", {});
let cart = S.get("cart", {});              // ING key -> {q, done}
let cartX = S.get("cartX", {});            // free-text items (world recipes) name -> {name, q:[...], shop, price, done}
let cartRecipes = S.get("cartRecipes", []);
let favs = S.get("favs", []);
let history = S.get("history", []);
let have = S.get("have", STAPLES.slice());
let ans = S.get("ans", { meal: "d", people: 4, budgetTotal: 25, time: 60, cuisine: "any", diet: [] });
if (ans.budgetTotal === undefined) ans.budgetTotal = ans.budget >= 999 ? null : (ans.budget || 6) * (ans.people || 4);
let halal = S.get("halal", true);
let monthBudget = S.get("monthBudget", null);
let wikiCache = S.get("wiki", {});

const $ = id => document.getElementById(id);
const price = k => (prices[k] != null ? prices[k] : ING[k][2]);
const fmt = n => { const r = Math.round(n * 100) / 100; return (r >= 100 ? Math.round(r) : r >= 10 ? r.toFixed(1) : r.toFixed(2)).replace(/\.?0+$/, "") + " DT"; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MEALDB = "https://www.themealdb.com/images/media/meals/";

// ---------- build the full recipe list ----------
RECIPES.forEach(r => { const h = PHOTO_HINT[r.id]; if (h && h.m && MEALDB_PHOTOS[h.m]) r.img = MEALDB + MEALDB_PHOTOS[h.m]; if (h && h.w) r.wiki = h.w; });
const WORLD_R = WORLD.map(w => {
  const [id, name, area, cat, thumb, ing, steps, meals, diet, time, spicy, haram, cost, emoji, yt, cuisine] = w;
  const tags = [cat.toLowerCase()];
  if (cat === "Dessert") tags.push("sweet");
  if (time <= 20) tags.push("quick");
  if (cost <= 2.2) tags.push("cheap");
  return { id: "w" + id, name, sub: (area ? area + " · " : "") + cat, emoji, img: MEALDB + thumb, cuisine, meals, time, diet, spicy, tags, world: true, area, cat, ingW: ing, steps, haram, costPP: cost, yt };
});
const ALL = RECIPES.concat(WORLD_R);
const BYID = {}; ALL.forEach(r => BYID[r.id] = r);
const R = id => BYID[id];
const AREAS = [...new Set(WORLD_R.map(r => r.area).filter(Boolean))].sort();

// ---------- quantities & cost ----------
function buyQty(k, q) {
  const u = ING[k][1];
  if (u === "kg") return Math.ceil(q * 20 - 1e-9) / 20;
  if (u === "L") return Math.ceil(q * 4 - 1e-9) / 4;
  return Math.max(1, Math.ceil(q - 1e-9));
}
function showQty(k, q) {
  const u = ING[k][1];
  if (u === "kg") return q < 1 ? Math.round(q * 1000) + " g" : (+q.toFixed(2)) + " kg";
  if (u === "L") return q < 1 ? Math.round(q * 1000) + " ml" : (+q.toFixed(2)) + " L";
  const n = Math.round(q * 10) / 10;
  return n + " " + (u === "pc" ? "" : u + (n > 1 ? "s" : ""));
}
const FR = { "½": .5, "¼": .25, "¾": .75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": .125 };
function scaleM(q, f) {
  if (!q || Math.abs(f - 1) < 1e-6) return q || "";
  return q.replace(/^\s*(\d+)?\s*(?:[- ]?(\d+)\/(\d+)|([½¼¾⅓⅔⅛]))?(?:\.(\d+))?/, (m, a, b, c, u, d) => {
    if (!m.trim()) return m;
    let v = (a ? parseFloat(a + (d ? "." + d : "")) : 0) + (b ? b / c : 0) + (u ? FR[u] : 0);
    if (!v) return m;
    v *= f; const r = Math.round(v * 4) / 4;
    const w = Math.floor(r), fr = r - w, fs = { 0.25: "¼", 0.5: "½", 0.75: "¾" }[fr] || "";
    return (w ? w : "") + fs + " ";
  }).replace(/\s+/g, " ").trim();
}
const ingKey = i => i[2] || i[0].toLowerCase();
function haveRatio(r) {
  if (r.world) return r.ingW.length ? r.ingW.filter(i => have.includes(ingKey(i))).length / r.ingW.length : 0;
  return r.ing.filter(([k]) => have.includes(k)).length / r.ing.length;
}
function recipeCost(r, n, onlyMissing) {
  if (r.world) return r.costPP * n * (onlyMissing ? 1 - .6 * haveRatio(r) : 1);
  let t = 0;
  r.ing.forEach(([k, q]) => { if (onlyMissing && have.includes(k)) return; t += buyQty(k, q * n) * price(k); });
  return t;
}
const costLabel = (r, c) => (r.world ? "≈ " : "") + fmt(c);

function toast(m) { const t = $("toast"); t.textContent = m; t.classList.add("on"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("on"), 2200); }
function openExt(url) { if (location.protocol === "file:") location.href = url; else window.open(url, "_blank"); }

// ---------- photos ----------
function imgOf(r, big) {
  if (r.img) return r.img + (r.world && !big ? "/small" : "");
  if (r.wiki) for (const t of r.wiki) if (wikiCache[t]) return wikiCache[t];
  return "";
}
function pic(r, cls, big) {
  const u = imgOf(r, big);
  return `<div class="${cls}" data-pic="${r.id}" data-big="${big ? 1 : ""}">${u ? `<img src="${esc(u)}" loading="lazy" alt="" onerror="this.remove()">` : ""}<span>${r.emoji}</span></div>`;
}
async function loadWikiPhotos() {
  const titles = [...new Set(RECIPES.flatMap(r => r.wiki || []))].filter(t => !(t in wikiCache));
  if (!titles.length || !navigator.onLine) return;
  for (let i = 0; i < titles.length; i += 45) {
    const part = titles.slice(i, i + 45);
    try {
      const u = "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=pageimages&piprop=thumbnail&pithumbsize=640&titles=" + encodeURIComponent(part.join("|"));
      const j = await (await fetch(u)).json(), q = j.query || {};
      const back = {}; part.forEach(t => back[t] = t);
      (q.normalized || []).forEach(n => { back[n.to] = back[n.from] || n.from; });
      (q.redirects || []).forEach(n => { back[n.to] = back[n.from] || n.from; });
      part.forEach(t => wikiCache[t] = "");
      Object.values(q.pages || {}).forEach(p => { const orig = back[p.title] || p.title; if (p.thumbnail) wikiCache[orig] = p.thumbnail.source; });
    } catch (e) { return; }
  }
  S.set("wiki", wikiCache);
  document.querySelectorAll("[data-pic]").forEach(el => {
    if (el.querySelector("img")) return; const r = R(el.dataset.pic), u = r && imgOf(r, el.dataset.big);
    if (u) el.insertAdjacentHTML("afterbegin", `<img src="${esc(u)}" loading="lazy" alt="" onerror="this.remove()">`);
  });
}

// ---------- navigation ----------
let stack = ["home"];
function go(v, push = true) {
  document.querySelectorAll(".view").forEach(e => e.classList.remove("on"));
  $("v-" + v).classList.add("on");
  document.querySelectorAll(".navbar button").forEach(b => b.classList.toggle("on", b.dataset.v === v));
  if (push && stack[stack.length - 1] !== v) stack.push(v);
  window.scrollTo(0, 0);
  if (v === "home") renderHome();
  if (v === "recipes") renderRecipes(true);
  if (v === "list") renderList();
  if (v === "map") initMap();
}
window.appBack = function () {
  if ($("v-wizard").classList.contains("on") && wizStep > 0) { wizBack(); return true; }
  if (stack.length > 1) { stack.pop(); go(stack[stack.length - 1], false); return true; }
  return false;
};

// ---------- home ----------
const okDiet = r => !(halal && r.haram);
function renderHome() {
  const h = new Date().getHours();
  $("greet").textContent = h < 11 ? "Sbeh el khir! ☀️" : h < 17 ? "Ahla! 👋" : "Msa el khir! 🌙";
  $("rcount").textContent = ALL.filter(okDiet).length;
  const m = new Date().toISOString().slice(0, 7);
  const mine = history.filter(x => x.date.startsWith(m)), spent = mine.reduce((a, x) => a + x.cost, 0);
  $("st-month").textContent = fmt(spent);
  $("st-cooked").textContent = mine.length;
  const bb = $("budget-box");
  if (monthBudget) {
    const p = Math.min(100, spent / monthBudget * 100), left = monthBudget - spent;
    bb.innerHTML = `<div class="total" style="font-size:15px"><span>💼 Monthly budget</span><button class="link" onclick="setMonthBudget()">${fmt(monthBudget)} ✏️</button></div>
      <div class="progress" style="margin:8px 0 6px"><i style="width:${p}%;background:${p > 90 ? "var(--red)" : "var(--olive)"}"></i></div>
      <div class="muted">${left >= 0 ? `${fmt(left)} left this month` : `⚠️ ${fmt(-left)} over budget`}</div>`;
  } else bb.innerHTML = `<button class="btn ghost" onclick="setMonthBudget()">💼 Set my monthly food budget</button>`;
  const meal = h < 11 ? "b" : h < 16 ? "l" : "d";
  const pool = ALL.filter(r => r.meals.includes(meal) && okDiet(r));
  const tn = pool.filter(r => r.cuisine === "tn").sort(() => Math.random() - .5).slice(0, 2);
  const wd = pool.filter(r => r.cuisine !== "tn").sort(() => Math.random() - .5).slice(0, 2);
  $("home-picks").innerHTML = tn.concat(wd).map(r => card(r, ans.people)).join("");
  updateDot();
}
function setMonthBudget() {
  const v = prompt("Your monthly food budget (DT):", monthBudget || "");
  if (v == null) return; const n = parseFloat(String(v).replace(",", "."));
  monthBudget = n > 0 ? n : null; S.set("monthBudget", monthBudget); renderHome();
}
function surprise() {
  const h = new Date().getHours(), meal = h < 11 ? "b" : h < 16 ? "l" : "d";
  const pool = ALL.filter(r => r.meals.includes(meal) && okDiet(r));
  openRecipe(pool[Math.floor(Math.random() * pool.length)].id);
}

// ---------- recipe card ----------
function card(r, n) {
  const cost = recipeCost(r, n, true), ratio = haveRatio(r);
  return `<button class="rc" onclick="openRecipe('${r.id}')">
    ${pic(r, "e")}
    <div style="flex:1;min-width:0"><div class="t">${esc(r.name)} ${favs.includes(r.id) ? "❤️" : ""}</div><div class="s">${esc(r.sub)}</div>
    <div class="badges"><span class="b">⏱ ${r.world ? "~" : ""}${r.time < 60 ? r.time + " min" : Math.round(r.time / 6) / 10 + " h"}</span>
    <span class="b y">💰 ${costLabel(r, cost)} for ${n}</span>
    ${ratio >= .5 ? `<span class="b g">✅ you have ${Math.round(ratio * 100)}%</span>` : ""}
    ${r.cuisine === "tn" ? '<span class="b">🇹🇳</span>' : ""}${r.spicy >= 2 ? '<span class="b r">🌶️</span>' : ""}${r.tags.includes("sfax") ? '<span class="b g">⭐ Sfax</span>' : ""}</div></div></button>`;
}

// ---------- wizard ----------
let wizStep = 0;
const PANTRY = ["egg","tomato","onion","pepper","potato","carrot","chicken","beef","mince","fish","tuna","pasta","couscous","rice","bread","cheese","chickpeas","lentils","flour","semolina","milk","butter","garlic","harissa","tpaste","oliveoil","oil","spices","olives","parsley","lemon","merguez","sugar","honey"];
const WIZ = [
  { q: "What meal is it? 🍽️", render() {
      const o = [["b","☀️","Breakfast"],["l","🌤️","Lunch"],["d","🌙","Dinner"],["s","🍩","Snack / sweet"]];
      return `<div class="big-opts">${o.map(([v,e,t]) => `<button class="opt ${ans.meal===v?"on":""}" onclick="ans.meal='${v}';wizNext()"><span class="e">${e}</span>${t}</button>`).join("")}</div>`; } },
  { q: "How many people? 👨‍👩‍👧‍👦", render() {
      return `<div class="stepper"><button onclick="ans.people=Math.max(1,ans.people-1);wizRender()">−</button><b>${ans.people}</b><button onclick="ans.people=Math.min(30,ans.people+1);wizRender()">+</button></div>
      <div class="chips" style="justify-content:center">${[1,2,4,6,8,12].map(n=>`<button class="chip ${ans.people===n?"on":""}" onclick="ans.people=${n};wizRender()">${n}</button>`).join("")}</div>
      <button class="btn" style="margin-top:24px" onclick="wizNext()">Next →</button>`; } },
  { q: "What's your budget? 💸", render() {
      const bt = ans.budgetTotal;
      return `<p class="muted">Type how much you want to spend on this meal for ${ans.people} ${ans.people > 1 ? "people" : "person"}.</p>
      <div style="display:flex;gap:10px;align-items:center"><input type="number" inputmode="decimal" id="bud" min="0" step="0.5" placeholder="e.g. 20" value="${bt != null ? bt : ""}" style="font-size:24px;font-weight:800;text-align:center" oninput="ans.budgetTotal=this.value?parseFloat(this.value):null;$('bud-pp').textContent=ans.budgetTotal?'= '+fmt(ans.budgetTotal/ans.people)+' per person':''"><b style="font-size:20px">DT</b></div>
      <div class="muted" id="bud-pp" style="text-align:center;margin:6px 0 12px">${bt ? "= " + fmt(bt / ans.people) + " per person" : ""}</div>
      <div class="chips" style="justify-content:center">${[5,10,15,20,30,50,80].map(v => `<button class="chip ${bt===v?"on":""}" onclick="ans.budgetTotal=${v};wizRender()">${v} DT</button>`).join("")}
      <button class="chip ${bt==null?"on":""}" onclick="ans.budgetTotal=null;wizRender()">👑 No limit</button></div>
      <button class="btn" style="margin-top:24px" onclick="wizNext()">Next →</button>`; } },
  { q: "How much time do you have? ⏱️", render() {
      const o = [[15,"⚡","15 min"],[30,"⏱️","30 min"],[60,"🕐","1 hour"],[999,"🍲","No rush"]];
      return `<div class="big-opts">${o.map(([v,e,t]) => `<button class="opt ${ans.time===v?"on":""}" onclick="ans.time=${v};wizNext()"><span class="e">${e}</span>${t}</button>`).join("")}</div>`; } },
  { q: "What are you in the mood for? 😋", render() {
      const o = [["tn","🇹🇳","Tunisian"],["sfax","⭐","Sfax specials"],["intl","🌍","World food"],["any","🤷","Anything"]];
      return `<div class="big-opts">${o.map(([v,e,t]) => `<button class="opt ${ans.cuisine===v?"on":""}" onclick="ans.cuisine='${v}';${v==="intl"?"wizRender()":"wizNext()"}"><span class="e">${e}</span>${t}</button>`).join("")}</div>
      ${ans.cuisine === "intl" ? `<div class="lbl">Which country? (optional)</div><select id="area" onchange="ans.area=this.value" style="width:100%;padding:13px;border-radius:14px;border:2px solid var(--line);font:inherit;background:#fff"><option value="">🌍 Any country</option>${AREAS.map(a => `<option ${ans.area===a?"selected":""}>${a}</option>`).join("")}</select><button class="btn" style="margin-top:16px" onclick="wizNext()">Next →</button>` : ""}`; } },
  { q: "Anything to avoid? 🚫", render() {
      const o = [["nomeat","🥩 No meat"],["nofish","🐟 No fish"],["mild","🧊 Not spicy"],["healthy","🥗 Healthy please"]];
      return `<p class="muted">Pick any (or none)</p><div class="chips"><button class="chip ${halal?"on":""}" onclick="halal=!halal;S.set('halal',halal);wizRender()">🕌 No pork / alcohol</button>${o.map(([v,t]) => `<button class="chip ${ans.diet.includes(v)?"on":""}" onclick="toggleDiet('${v}')">${t}</button>`).join("")}</div>
      <button class="btn" style="margin-top:24px" onclick="wizNext()">Next →</button>`; } },
  { q: "What do you already have at home? 🧺", render() {
      return `<p class="muted">Tap what's in your kitchen — I'll pick dishes that use it and won't make you buy it.</p>
      <div class="chips">${PANTRY.map(k => `<button class="chip ${have.includes(k)?"on":""}" onclick="toggleHave('${k}');wizRender()">${ING[k][4]} ${ING[k][0].replace(/ \(.*\)/,"")}</button>`).join("")}</div>
      <button class="btn" style="margin-top:24px" onclick="showResults()">🍽️ Show me what to cook</button>`; } }
];
function startWizard() { wizStep = 0; go("wizard"); wizRender(); }
function wizRender() { $("wiz-bar").style.width = ((wizStep + 1) / WIZ.length * 100) + "%"; $("wiz-body").innerHTML = `<h2>${WIZ[wizStep].q}</h2><div class="muted" style="margin-bottom:14px">Question ${wizStep + 1} of ${WIZ.length}</div>` + WIZ[wizStep].render(); }
function wizNext() { S.set("ans", ans); if (wizStep < WIZ.length - 1) { wizStep++; wizRender(); window.scrollTo(0, 0); } else showResults(); }
function wizBack() { if (wizStep > 0) { wizStep--; wizRender(); } else { stack.pop(); go(stack[stack.length - 1] || "home", false); } }
function toggleDiet(v) { ans.diet = ans.diet.includes(v) ? ans.diet.filter(x => x !== v) : ans.diet.concat(v); wizRender(); }
function toggleHave(k) { have = have.includes(k) ? have.filter(x => x !== k) : have.concat(k); S.set("have", have); }

function score(r) {
  if (!r.meals.includes(ans.meal) || !okDiet(r)) return null;
  if (ans.diet.includes("nomeat") && r.diet === "meat") return null;
  if (ans.diet.includes("nofish") && r.diet === "fish") return null;
  if (ans.diet.includes("mild") && r.spicy >= 2) return null;
  if (ans.cuisine === "tn" && r.cuisine !== "tn") return null;
  if (ans.cuisine === "intl" && (r.cuisine === "tn" || (ans.area && r.area !== ans.area))) return null;
  if (ans.cuisine === "sfax" && !r.tags.includes("sfax")) return null;
  let s = 50 + haveRatio(r) * 40 + Math.random() * 8;
  if (r.time > ans.time) s -= 30;
  if (ans.budgetTotal != null && recipeCost(r, ans.people, true) > ans.budgetTotal) s -= 35;
  if (ans.diet.includes("healthy") && (r.tags.includes("healthy") || r.diet === "veg" && r.cat !== "Dessert")) s += 12;
  if (!r.world) s += 4; // local recipes have exact prices
  return s;
}
let resList = [], resShown = 0;
function showResults() {
  S.set("ans", ans);
  resList = ALL.map(r => [r, score(r)]).filter(x => x[1] != null).sort((a, b) => b[1] - a[1]).map(x => x[0]);
  let relaxed = false;
  if (!resList.length) { relaxed = true; resList = ALL.filter(r => r.meals.includes(ans.meal) && okDiet(r)).slice(0, 20); }
  const meal = { b: "breakfast", l: "lunch", d: "dinner", s: "a snack" }[ans.meal];
  $("res-sum").innerHTML = `${meal} · ${ans.people} people · ${ans.budgetTotal != null ? "budget " + fmt(ans.budgetTotal) : "any budget"} · ${ans.time < 999 ? "≤ " + ans.time + " min" : "no rush"} · ${resList.length} matches${relaxed ? "<br>Nothing matched everything, so here's the closest." : ""}`;
  resShown = 0; $("res-list").innerHTML = ""; moreResults(); go("results");
}
function moreResults() {
  const add = resList.slice(resShown, resShown + 10).map((r, j) => {
    const i = resShown + j, warn = [];
    if (r.time > ans.time) warn.push("takes longer");
    if (ans.budgetTotal != null && recipeCost(r, ans.people, true) > ans.budgetTotal) warn.push("over your budget");
    return (i === 0 ? '<div class="lbl">🏆 Best match</div>' : i === 1 ? '<div class="lbl">Other good ideas</div>' : "") + card(r, ans.people) + (warn.length ? `<div class="muted" style="margin:-6px 0 6px 8px">⚠️ ${warn.join(", ")}</div>` : "");
  }).join("");
  $("res-list").insertAdjacentHTML("beforeend", add); resShown += 10;
  $("res-more").style.display = resShown < resList.length ? "flex" : "none";
}

// ---------- recipe detail ----------
let cur = null, curN = 4, timerH = null, timerLeft = 0;
function openRecipe(id) { cur = R(id); curN = ans.people || 4; renderDetail(); go("detail"); }
function ingRows(r, n) {
  if (r.world) {
    const f = n / 4;
    return r.ingW.map((i, idx) => { const k = ingKey(i), h = have.includes(k);
      return `<div class="ing ${h ? "have" : ""}" onclick="toggleHave(${JSON.stringify(k).replace(/"/g, "&quot;")});renderDetail()"><div class="ck ${h ? "on" : ""}">${h ? "✓" : ""}</div><div class="n">${i[2] ? ING[i[2]][4] + " " : ""}${esc(i[0])}</div><div class="q">${esc(scaleM(i[1], f))}</div></div>`; }).join("");
  }
  return r.ing.map(([k, q]) => { const h = have.includes(k); return `<div class="ing ${h ? "have" : ""}" onclick="toggleHave('${k}');renderDetail()">
    <div class="ck ${h ? "on" : ""}">${h ? "✓" : ""}</div><div class="n">${ING[k][4]} ${ING[k][0]}</div><div class="q">${showQty(k, q * n)}</div><div class="p">${h ? "—" : fmt(buyQty(k, q * n) * price(k))}</div></div>`; }).join("");
}
function renderDetail() {
  const r = cur, n = curN, missing = recipeCost(r, n, true), full = recipeCost(r, n, false);
  const bt = ans.budgetTotal;
  $("v-detail").innerHTML = `<button class="back" onclick="appBack()">← Back</button>
  ${pic(r, "detail-hero", true)}
  <h1 style="margin-top:12px">${esc(r.name)}</h1><div class="muted">${esc(r.sub)}</div>
  <div class="badges" style="margin-top:8px"><span class="b">⏱ ${r.world ? "~" : ""}${r.time} min</span><span class="b">${r.cuisine === "tn" ? "🇹🇳 Tunisian" : "🌍 " + esc(r.area || "International")}</span>${r.spicy ? `<span class="b r">${"🌶️".repeat(Math.max(1, r.spicy))}</span>` : ""}${r.haram ? '<span class="b r">contains pork/alcohol</span>' : ""}${(r.world ? [] : r.tags).map(t => `<span class="b">#${t}</span>`).join("")}</div>
  <div class="card"><div class="total"><span>People</span>
    <div class="stepper" style="margin:0;gap:12px"><button style="width:42px;height:42px;font-size:22px" onclick="curN=Math.max(1,curN-1);renderDetail()">−</button><b style="font-size:28px;min-width:36px">${n}</b><button style="width:42px;height:42px;font-size:22px" onclick="curN=Math.min(30,curN+1);renderDetail()">+</button></div></div>
    <div class="row" style="margin-top:10px"><div class="stat" style="background:#FFF0D2"><b>${costLabel(r, missing)}</b><span class="muted">to buy</span></div><div class="stat" style="background:#E5F0D8"><b>${costLabel(r, full / n)}</b><span class="muted">per person</span></div></div>
    ${bt != null ? `<div class="muted" style="margin-top:8px;text-align:center">${missing <= bt ? `✅ Fits your budget of ${fmt(bt)}` : `⚠️ ${fmt(missing - bt)} over your budget of ${fmt(bt)}`}</div>` : ""}
    ${r.world ? `<div class="muted" style="margin-top:6px;text-align:center">World recipe: cost is a rough estimate.</div>` : ""}
  </div>
  <div class="card"><h2>🧺 Ingredients</h2><div class="muted" style="margin:-6px 0 6px">Tick what you already have</div>${ingRows(r, n)}</div>
  <button class="btn" onclick="addToCart()">🛒 Add missing to shopping list</button>
  <div class="row" style="margin-top:10px"><button class="btn ghost" onclick="toggleFav()">${favs.includes(r.id) ? "💔 Unsave" : "❤️ Save"}</button><button class="btn ghost" onclick="go('map')">📍 Where to buy</button></div>
  ${r.yt ? `<button class="btn ghost" style="margin-top:10px" onclick="openExt('https://www.youtube.com/watch?v=${r.yt}')">▶️ Watch the video</button>` : ""}
  <div class="card"><h2>👩‍🍳 How to cook</h2><ol class="steps">${r.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol></div>
  <div class="card"><h2>⏲️ Kitchen timer</h2><div class="timer" id="timer">${tfmt(timerLeft)}</div>
    <div class="chips" style="justify-content:center;margin-top:8px">${[1, 5, 10, 20, 30].map(m => `<button class="chip" onclick="startTimer(${m})">${m} min</button>`).join("")}<button class="chip" onclick="stopTimer()">⏹</button></div></div>
  <button class="btn green" onclick="cooked()">✅ I cooked it! (add ${costLabel(r, missing)} to my spending)</button>
  ${r.world ? '<div class="muted" style="text-align:center;margin-top:10px">Recipe & photo: TheMealDB</div>' : ""}
  <div style="height:10px"></div>`;
}
function toggleFav() { favs = favs.includes(cur.id) ? favs.filter(x => x !== cur.id) : favs.concat(cur.id); S.set("favs", favs); renderDetail(); toast(favs.includes(cur.id) ? "Saved ❤️" : "Removed"); }
function addToCart() {
  let added = 0;
  if (cur.world) {
    const f = curN / 4;
    cur.ingW.forEach(i => { const k = ingKey(i); if (have.includes(k)) return;
      const id = i[0].toLowerCase(); const it = cartX[id] = cartX[id] || { name: i[0], q: [], shop: i[2] ? ING[i[2]][3] : (i[3] || "grocery"), price: null, done: false };
      const sq = scaleM(i[1], f); it.q.push(sq || "some"); it.done = false; added++;
      const e = i[2] ? estPrice(i[2], sq) : null; if (e != null) it.price = Math.round(((it.price || 0) + e) * 100) / 100; });
  } else cur.ing.forEach(([k, q]) => { if (have.includes(k)) return; cart[k] = cart[k] || { q: 0, done: false }; cart[k].q += q * curN; cart[k].done = false; added++; });
  if (!cartRecipes.includes(cur.name)) cartRecipes.push(cur.name);
  saveCart(true); toast(added ? `Added ${added} items to your list 🛒` : "You already have everything! 🎉");
}
function estPrice(k, q) {
  const u = ING[k][1], m = String(q || "").match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l|lb|lbs|oz)\b/i);
  if (u === "kg" || u === "L") {
    if (!m) return null; let v = +m[1]; const un = m[2].toLowerCase();
    v = un === "g" || un === "ml" ? v / 1000 : un.startsWith("lb") ? v * .454 : un === "oz" ? v * .0283 : v;
    return v * price(k);
  }
  return price(k);
}
function cooked() {
  history.push({ id: cur.id, name: cur.name, cost: Math.round(recipeCost(cur, curN, true) * 100) / 100, people: curN, date: new Date().toISOString() });
  S.set("history", history); toast("Bon appétit! 😋 Saved to your spending");
}
const tfmt = s => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
function startTimer(m) {
  stopTimer(); timerLeft = m * 60;
  timerH = setInterval(() => { timerLeft--; const t = $("timer"); if (t) t.textContent = tfmt(timerLeft);
    if (timerLeft <= 0) { stopTimer(); toast("⏰ Time's up!"); try { navigator.vibrate && navigator.vibrate([400, 200, 400, 200, 400]); } catch (e) {} beep(); } }, 1000);
  $("timer").textContent = tfmt(timerLeft);
}
function stopTimer() { clearInterval(timerH); timerH = null; }
function beep() { try { const c = new (window.AudioContext || window.webkitAudioContext)(); [0, .4, .8].forEach(d => { const o = c.createOscillator(); o.frequency.value = 880; o.connect(c.destination); o.start(c.currentTime + d); o.stop(c.currentTime + d + .25); }); } catch (e) {} }

// ---------- recipes browser ----------
let rf = "all", rArea = "", rList = [], rShown = 0;
function renderRecipes(reset) {
  const F = [["all", "All"], ["fav", "❤️ Saved"], ["tn", "🇹🇳 Tunisian"], ["sfax", "⭐ Sfax"], ["intl", "🌍 World"], ["quick", "⚡ Quick"], ["cheap", "💸 Cheap"], ["veg", "🥬 Veggie"], ["sweet", "🍰 Sweet"], ["fish", "🐟 Fish"]];
  $("rfilters").innerHTML = `<button class="chip ${halal ? "on" : ""}" onclick="halal=!halal;S.set('halal',halal);renderRecipes(true)">🕌 No pork/alcohol</button>` + F.map(([v, t]) => `<button class="chip ${rf === v ? "on" : ""}" onclick="rf='${v}';renderRecipes(true)">${t}</button>`).join("");
  if ($("rarea").options.length <= 1) $("rarea").insertAdjacentHTML("beforeend", AREAS.map(a => `<option>${a}</option>`).join(""));
  const q = ($("q").value || "").toLowerCase().trim();
  rList = ALL.filter(r => {
    if (!okDiet(r)) return false;
    if (rArea && r.area !== rArea) return false;
    if (rf === "fav" && !favs.includes(r.id)) return false;
    if (rf === "tn" && r.cuisine !== "tn") return false;
    if (rf === "intl" && r.cuisine === "tn") return false;
    if (["sfax", "quick", "cheap", "sweet"].includes(rf) && !r.tags.includes(rf)) return false;
    if (rf === "veg" && (r.diet !== "veg" || r.cat === "Dessert")) return false;
    if (rf === "fish" && r.diet !== "fish") return false;
    if (q) { const hay = (r.name + " " + r.sub + " " + (r.world ? r.ingW.map(i => i[0]).join(" ") : r.ing.map(i => ING[i[0]][0]).join(" "))).toLowerCase(); if (!q.split(/\s+/).every(w => hay.includes(w))) return false; }
    return true;
  });
  if (!q && rf === "all" && !rArea) rList.sort((a, b) => (a.cuisine === "tn" ? 0 : 1) - (b.cuisine === "tn" ? 0 : 1));
  $("rcount2").textContent = rList.length + " recipes";
  rShown = 0; $("rlist").innerHTML = rList.length ? "" : `<div class="empty"><div class="e">🤷</div>Nothing found</div>`; moreRecipes();
}
function moreRecipes() {
  $("rlist").insertAdjacentHTML("beforeend", rList.slice(rShown, rShown + 25).map(r => card(r, ans.people)).join(""));
  rShown += 25; $("r-more").style.display = rShown < rList.length ? "flex" : "none";
}

// ---------- shopping list ----------
function updateDot() { const n = Object.values(cart).filter(x => !x.done).length + Object.values(cartX).filter(x => !x.done).length; const d = $("cart-dot"); d.style.display = n ? "block" : "none"; d.textContent = n; }
function renderList() {
  const keys = Object.keys(cart), xk = Object.keys(cartX);
  if (!keys.length && !xk.length) { $("list-body").innerHTML = `<div class="empty"><div class="e">🛒</div>Your list is empty.<br>Open a recipe and tap "Add missing to shopping list".</div><button class="btn" onclick="startWizard()">🎯 Find something to cook</button>`; updateDot(); return; }
  let total = 0, left = 0, noPrice = 0, html = `<div class="muted">For: ${esc(cartRecipes.join(", "))}</div>`;
  Object.keys(SHOPS).forEach(sk => {
    const items = keys.filter(k => ING[k][3] === sk), xitems = xk.filter(k => cartX[k].shop === sk);
    if (!items.length && !xitems.length) return;
    html += `<div class="shopgrp"><h3><span>${SHOPS[sk].emoji} ${SHOPS[sk].name}</span><button class="link" onclick="mapFilter='${sk}';go('map')">📍 nearby</button></h3><div class="card" style="margin:4px 0">`;
    items.forEach(k => {
      const it = cart[k], bq = buyQty(k, it.q), c = bq * price(k); total += c; if (!it.done) left += c;
      html += `<div class="ing ${it.done ? "have" : ""}"><div class="ck ${it.done ? "on" : ""}" onclick="cart['${k}'].done=!cart['${k}'].done;saveCart()">${it.done ? "✓" : ""}</div>
        <div class="n" onclick="cart['${k}'].done=!cart['${k}'].done;saveCart()">${ING[k][4]} ${ING[k][0]}<div class="muted">${showQty(k, bq)}</div></div>
        <button class="p link" onclick="editPrice('${k}')">${fmt(c)} ✏️</button><button onclick="delete cart['${k}'];saveCart()" style="padding:4px 6px">✕</button></div>`;
    });
    xitems.forEach(k => {
      const it = cartX[k], kk = JSON.stringify(k).replace(/"/g, "&quot;");
      if (it.price != null) { total += it.price; if (!it.done) left += it.price; } else if (!it.done) noPrice++;
      html += `<div class="ing ${it.done ? "have" : ""}"><div class="ck ${it.done ? "on" : ""}" onclick="cartX[${kk}].done=!cartX[${kk}].done;saveCart()">${it.done ? "✓" : ""}</div>
        <div class="n" onclick="cartX[${kk}].done=!cartX[${kk}].done;saveCart()">${esc(it.name)}<div class="muted">${esc(it.q.join(" + "))}</div></div>
        <button class="p link" onclick="editPriceX(${kk})">${it.price != null ? fmt(it.price) : "add price"} ✏️</button><button onclick="delete cartX[${kk}];saveCart()" style="padding:4px 6px">✕</button></div>`;
    });
    html += `</div></div>`;
  });
  const bt = ans.budgetTotal;
  html += `<div class="card"><div class="total"><span>Total</span><span>${fmt(total)}</span></div><div class="total" style="font-size:15px;color:var(--mute);margin-top:6px"><span>Still to buy</span><span>${fmt(left)}</span></div>
    ${noPrice ? `<div class="muted" style="margin-top:6px">+ ${noPrice} item${noPrice > 1 ? "s" : ""} without a price yet</div>` : ""}
    ${bt != null ? `<div style="margin-top:8px;font-weight:700">${left <= bt ? "✅" : "⚠️"} Your meal budget: ${fmt(bt)}</div>` : ""}
    <div class="muted" style="margin-top:8px">Prices are based on Sfax market reports (Nov 2026) and change often. Tap ✏️ to put the real price you paid — the app remembers it.</div></div>
    <button class="btn green" onclick="shareList()">📤 Send list on WhatsApp</button>
    <button class="btn ghost" style="margin-top:10px" onclick="if(confirm('Clear the whole list?')){cart={};cartX={};cartRecipes=[];saveCart()}">🗑️ Clear list</button>`;
  $("list-body").innerHTML = html; updateDot();
}
function saveCart(quiet) { S.set("cart", cart); S.set("cartX", cartX); S.set("cartRecipes", cartRecipes); if (!quiet) renderList(); else updateDot(); }
function askNum(msg, d) { const v = prompt(msg, d == null ? "" : d); if (v == null) return undefined; const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) || n < 0 ? undefined : n; }
function editPrice(k) { const n = askNum(`Price of ${ING[k][0]} per ${ING[k][1]} (DT):`, price(k)); if (n !== undefined) { prices[k] = n; S.set("prices", prices); renderList(); toast("Price saved ✅"); } }
function editPriceX(k) { const n = askNum(`Price you'll pay for ${cartX[k].name} (DT):`, cartX[k].price); if (n !== undefined) { cartX[k].price = n; saveCart(); } }
function shareList() {
  let t = "🛒 *Chnowa Nekel? — shopping list*\n" + (cartRecipes.length ? "For: " + cartRecipes.join(", ") + "\n" : "");
  let total = 0;
  Object.keys(SHOPS).forEach(sk => {
    const items = Object.keys(cart).filter(k => ING[k][3] === sk && !cart[k].done), xi = Object.keys(cartX).filter(k => cartX[k].shop === sk && !cartX[k].done);
    if (!items.length && !xi.length) return;
    t += `\n${SHOPS[sk].emoji} ${SHOPS[sk].name}\n`;
    items.forEach(k => { const bq = buyQty(k, cart[k].q), c = bq * price(k); total += c; t += `• ${ING[k][0]} — ${showQty(k, bq)} (~${fmt(c)})\n`; });
    xi.forEach(k => { const it = cartX[k]; if (it.price != null) total += it.price; t += `• ${it.name} — ${it.q.join(" + ")}${it.price != null ? ` (~${fmt(it.price)})` : ""}\n`; });
  });
  t += `\n💰 Total ≈ ${fmt(total)}`;
  openExt("https://wa.me/?text=" + encodeURIComponent(t));
}

// ---------- map (Google Maps) ----------
const SFAX = [34.7406, 10.7603];
let mapFilter = "all", center = SFAX, located = false;
const MAPQ = { all: "supermarché", meat: "boucherie", fish: "poissonnerie", veg: "fruits et légumes", bakery: "boulangerie", grocery: "supermarché", market: "marché" };
function initMap() {
  const F = [["all", "🛍️ All"], ["meat", "🥩 Butcher"], ["fish", "🐟 Fish"], ["veg", "🥬 Veg"], ["bakery", "🥖 Bakery"], ["grocery", "🛒 Supermarket"], ["market", "🏪 Markets"]];
  $("mfilters").innerHTML = F.map(([v, t]) => `<button class="chip ${mapFilter === v ? "on" : ""}" onclick="mapFilter='${v}';initMap()">${t}</button>`).join("");
  const term = MAPQ[mapFilter];
  const src = `https://maps.google.com/maps?q=${encodeURIComponent(term)}&ll=${center[0].toFixed(5)},${center[1].toFixed(5)}&z=15&hl=fr&output=embed`;
  if ($("gmap").getAttribute("src") !== src) $("gmap").setAttribute("src", src);
  $("map-status").textContent = navigator.onLine === false ? "📶 You're offline — the map needs internet." : `Showing "${term}" ${located ? "near you" : "in Sfax"}. Tap a pin for details, or open the Google Maps app for directions.`;
  if (!located && !initMap._tried) { initMap._tried = true; locateMe(true); }
}
function centerSfax() { center = SFAX; located = false; initMap(); }
function locateMe(silent) {
  if (!navigator.geolocation) { if (!silent) toast("Location not available"); return; }
  navigator.geolocation.getCurrentPosition(p => { center = [p.coords.latitude, p.coords.longitude]; located = true; if ($("v-map").classList.contains("on")) initMap(); },
    () => { if (!silent) toast("Turn on GPS and allow location for the app"); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 });
}
function openGMaps() { openExt(`https://www.google.com/maps/search/${encodeURIComponent(MAPQ[mapFilter])}/@${center[0]},${center[1]},15z`); }

// ---------- Chef AI ----------
let aiHist = [];
const AI_NAMES = RECIPES.map(r => r.name);
function aiSystem() {
  const pantry = have.filter(k => ING[k]).map(k => ING[k][0]).join(", ");
  return `You are "Chef AI", a friendly cooking assistant inside the app "Chnowa Nekel?" for people in Sfax, Tunisia. Money is Tunisian dinars (DT).
Approximate Sfax market prices (Nov 2026): chicken 8.5 DT/kg, chicken escalope 18, beef 40, lamb 60, merguez 30, dorade/loup 22, shrimp 20, tomatoes 1.4, onions 1.4, peppers 1.9, potatoes 2, eggs 0.45 each, olive oil 12.5 DT/L, couscous 2.2/kg, pasta 1.3 per 500g, baguette 0.25.
User's kitchen already has: ${pantry || "unknown"}. Usual group size: ${ans.people} people.${ans.budgetTotal != null ? " Usual meal budget: " + ans.budgetTotal + " DT." : ""}
Rules: ALWAYS reply in exactly the same language as the user's last message (if they write English, answer in English; French → French; Arabic or Tunisian Derja → same). Be short and practical (max 100 words, no long recipe — the app has the full recipe), use simple words and a few emojis. Give quick cost estimates in DT when useful. Halal by default (no pork, no alcohol) unless the user asks otherwise.
Always suggest 1–3 dishes, preferring app recipes. When you suggest a dish that exists in the app, write its exact name inside double brackets, like [[Ojja Merguez]]. App recipes include: ${AI_NAMES.join(", ")}. You may also suggest other world dishes in [[brackets]].
Only talk about food, cooking, groceries and budgets.`;
}
function cleanAI(t) {
  return String(t || "").replace(/\n+-{3,}[\s\S]*$/m, m => /pollinations|sponsor|ad\b/i.test(m) ? "" : m).replace(/^.*🌸.*$/gm, "").trim();
}
function findRecipes(text) {
  const out = [], low = text.toLowerCase();
  (text.match(/\[\[([^\]]+)\]\]/g) || []).forEach(m => {
    const n = m.slice(2, -2).toLowerCase().trim();
    const r = ALL.find(x => x.name.toLowerCase().trim() === n) || ALL.find(x => okDiet(x) && (x.name.toLowerCase().includes(n) || n.includes(x.name.toLowerCase().trim())));
    if (r && !out.includes(r)) out.push(r);
  });
  if (!out.length) RECIPES.forEach(r => { if (low.includes(r.name.toLowerCase()) && !out.includes(r)) out.push(r); });
  return out.slice(0, 4);
}
function aiRender(extra) {
  $("ai-out").innerHTML = aiHist.slice(-6).map(m => m.role === "user" ? `<div class="bub me">${esc(m.content)}</div>`
    : `<div class="bub bot">${esc(m.content).replace(/\[\[([^\]]+)\]\]/g, "<b>$1</b>").replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").replace(/^#{1,4}\s*/gm, "").replace(/ {2,}\n/g, "\n")}</div>` + (m.recipes || []).map(id => card(R(id), ans.people)).join("")).join("") + (extra || "")
    + (aiHist.length ? `<div style="text-align:right"><button class="link" onclick="aiHist=[];aiRender()">✕ clear chat</button></div>` : "");
}
async function askAI() {
  const inp = $("ai-in"), q = inp.value.trim(); if (!q) return;
  inp.value = ""; aiHist.push({ role: "user", content: q });
  aiRender(`<div class="bub bot typing">Chef AI is thinking… 🍳</div>`);
  let reply = null;
  for (let attempt = 0; attempt < 2 && !reply; attempt++) {
    try {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 45000);
      const res = await fetch("https://text.pollinations.ai/openai", { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "openai", messages: [{ role: "system", content: aiSystem() }].concat(aiHist.slice(-8).map(m => ({ role: m.role, content: m.content }))) }) });
      clearTimeout(to);
      if (res.ok) { const j = await res.json(); reply = cleanAI(j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content); }
    } catch (e) { if (navigator.onLine === false) break; }
  }
  if (!reply) reply = localAI(q);
  aiHist.push({ role: "assistant", content: reply, recipes: findRecipes(reply).map(r => r.id) });
  aiRender();
}
// offline fallback: understands people, budget and ingredients (English / French / Derja)
const WORDS = { chicken: /chicken|poulet|djej|dajaj|دجاج/i, beef: /beef|boeuf|bœuf|viande|lham|لحم/i, lamb: /lamb|agneau|allouch|علوش/i, fish: /fish|poisson|hout|حوت/i, egg: /egg|oeuf|œuf|adhm|3dham|عظم|بيض/i,
  tomato: /tomat|tmatem|طماطم/i, potato: /potato|pomme de terre|batata|بطاطا/i, pasta: /pasta|pâtes|makrouna|مقرونة/i, couscous: /couscous|kosksi|كسكسي/i, rice: /rice|riz|rouz|روز/i, tuna: /tuna|thon|tonn|تن/i, merguez: /merguez|مرقاز/i, shrimp: /shrimp|crevette|قمبري/i };
function localAI(q) {
  const pm = q.match(/(\d+)\s*(people|persons?|personnes?|pers|ness|nfar|عباد|أشخاص)/i), bm = q.match(/(\d+(?:[.,]\d+)?)\s*(dt|tnd|dinars?|dinar|د)/i);
  const n = pm ? +pm[1] : ans.people, budget = bm ? parseFloat(bm[1].replace(",", ".")) : ans.budgetTotal;
  const want = Object.keys(WORDS).filter(k => WORDS[k].test(q));
  const hits = r => r.ing.filter(([k]) => want.includes(k)).length;
  const pool = RECIPES.filter(r => okDiet(r) && (!want.length || hits(r) > 0))
    .map(r => [r, recipeCost(r, n, true)]).filter(([r, c]) => budget == null || c <= budget).sort((a, b) => hits(b[0]) - hits(a[0]) || a[1] - b[1]).slice(0, 3);
  if (!pool.length) return `I couldn't reach the AI (check your internet) and nothing fits${budget != null ? " " + budget + " DT" : ""}. Try a bigger budget or fewer people.`;
  return `📶 I couldn't reach the AI right now, but here's what fits${want.length ? " with " + want.map(k => ING[k][0].toLowerCase()).join(", ") : ""} for ${n} people${budget != null ? " under " + budget + " DT" : ""}:\n` +
    pool.map(([r, c]) => `• [[${r.name}]] — about ${fmt(c)}`).join("\n");
}

// ---------- start ----------
renderHome();
loadWikiPhotos();
