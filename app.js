const LS_ITEMS = "storyous_inventory_items_v1";
const LS_VALUES = "storyous_inventory_values_v1";

let items = [];
let values = {};
let pendingVoice = null;

const $ = (id) => document.getElementById(id);

function normalizeText(s) {
  return (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s.,-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCSV(text) {
  const firstLine = text.split(/\r?\n/)[0] || "";
  const delimiter = firstLine.includes(";") ? ";" : ",";
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
  if (lines.length < 2) throw new Error("CSV neobsahuje žádná data.");

  const parseLine = (line) => {
    const out = [];
    let cur = "", inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) {
        out.push(cur.trim()); cur = "";
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };

  const headers = parseLine(lines[0]).map(normalizeText);
  const idx = (name) => headers.indexOf(normalizeText(name));
  if (idx("nazev") < 0 || idx("jednotka") < 0) {
    throw new Error("CSV musí obsahovat sloupce „nazev“ a „jednotka“.");
  }

  return lines.slice(1).map((line, rowIndex) => {
    const cells = parseLine(line);
    const get = (name, fallback = "") => idx(name) >= 0 ? (cells[idx(name)] ?? fallback).trim() : fallback;
    return {
      id: get("kod") || `ROW-${rowIndex + 1}`,
      code: get("kod"),
      name: get("nazev"),
      unit: get("jednotka"),
      warehouse: get("sklad", "Bez skladu"),
      category: get("kategorie", "Bez kategorie"),
      order: Number(get("poradi", rowIndex + 1)) || rowIndex + 1
    };
  }).filter(x => x.name);
}

function saveState() {
  localStorage.setItem(LS_ITEMS, JSON.stringify(items));
  localStorage.setItem(LS_VALUES, JSON.stringify(values));
}

function loadState() {
  items = JSON.parse(localStorage.getItem(LS_ITEMS) || "[]");
  values = JSON.parse(localStorage.getItem(LS_VALUES) || "{}");
  if (items.length) showInventory();
}

function showInventory() {
  $("setupPanel").classList.add("hidden");
  $("inventoryPanel").classList.remove("hidden");
  buildFilters();
  renderItems();
}

function buildFilters() {
  const warehouses = [...new Set(items.map(x => x.warehouse))].sort();
  const categories = [...new Set(items.map(x => x.category))].sort();

  const wh = $("warehouseFilter");
  const cat = $("categoryFilter");
  const oldWh = wh.value;
  const oldCat = cat.value;

  wh.innerHTML = `<option value="">Všechny sklady</option>` + warehouses.map(x => `<option>${escapeHtml(x)}</option>`).join("");
  cat.innerHTML = `<option value="">Všechny kategorie</option>` + categories.map(x => `<option>${escapeHtml(x)}</option>`).join("");

  if (warehouses.includes(oldWh)) wh.value = oldWh;
  if (categories.includes(oldCat)) cat.value = oldCat;
}

function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

function getFilteredItems() {
  const wh = $("warehouseFilter").value;
  const cat = $("categoryFilter").value;
  const q = normalizeText($("searchInput").value);
  return items
    .filter(x => !wh || x.warehouse === wh)
    .filter(x => !cat || x.category === cat)
    .filter(x => !q || normalizeText(`${x.name} ${x.code}`).includes(q))
    .sort((a,b) => a.order - b.order || a.name.localeCompare(b.name, "cs"));
}

function renderItems() {
  const filtered = getFilteredItems();
  $("itemsList").innerHTML = filtered.map(item => {
    const val = values[item.id] ?? "";
    const filled = val !== "" && val !== null;
    return `
      <article class="item-card ${filled ? "filled" : ""}" data-id="${escapeHtml(item.id)}">
        <div>
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="item-meta">${escapeHtml(item.warehouse)} · ${escapeHtml(item.category)}${item.code ? ` · ${escapeHtml(item.code)}` : ""}</div>
        </div>
        <div class="qty-wrap">
          <input class="qty-input" inputmode="decimal" type="number" step="any" min="0"
                 value="${escapeHtml(String(val))}" data-id="${escapeHtml(item.id)}" aria-label="Množství ${escapeHtml(item.name)}" />
          <span class="unit">${escapeHtml(item.unit)}</span>
        </div>
      </article>`;
  }).join("");

  document.querySelectorAll(".qty-input").forEach(input => {
    input.addEventListener("input", e => {
      const id = e.target.dataset.id;
      const raw = e.target.value;
      if (raw === "") delete values[id];
      else values[id] = Number(raw.replace(",", "."));
      saveState();
      e.target.closest(".item-card").classList.toggle("filled", raw !== "");
      updateProgress();
    });
  });
  updateProgress();
}

function updateProgress() {
  const relevant = getFilteredItems();
  const filled = relevant.filter(x => values[x.id] !== undefined && values[x.id] !== "").length;
  const pct = relevant.length ? Math.round((filled / relevant.length) * 100) : 0;
  $("progressText").textContent = `${filled} / ${relevant.length}`;
  $("progressBar").value = pct;
  $("statusText").textContent = `${pct} % vyplněno`;
}

function download(filename, content, type) {
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportCSV() {
  const header = ["kod","nazev","jednotka","sklad","kategorie","skutecny_stav"];
  const rows = items.map(x => [
    x.code, x.name, x.unit, x.warehouse, x.category,
    values[x.id] ?? ""
  ]);
  const esc = v => `"${String(v ?? "").replace(/"/g,'""')}"`;
  const csv = "\ufeff" + [header, ...rows].map(r => r.map(esc).join(";")).join("\r\n");
  const date = new Date().toISOString().slice(0,10);
  download(`inventura_${date}.csv`, csv, "text/csv;charset=utf-8");
}

function parseSpokenNumber(text) {
  const numeric = text.match(/(-?\d+(?:[.,]\d+)?)/);
  if (numeric) return Number(numeric[1].replace(",", "."));
  const map = {
    nula:0, jeden:1, jedna:1, dve:2, dva:2, tri:3, ctyri:4, pet:5, sest:6, sedm:7, osm:8, devet:9,
    deset:10, jedenact:11, dvanact:12, trinact:13, ctrnact:14, patnact:15, sestnact:16,
    sedmnact:17, osmnact:18, devatenact:19, dvacet:20, tricet:30, ctyricet:40, padesat:50
  };
  const words = normalizeText(text).split(" ");
  let total = 0, found = false;
  for (const w of words) {
    if (map[w] !== undefined) { total += map[w]; found = true; }
  }
  return found ? total : null;
}

function bestMatches(spoken) {
  const n = parseSpokenNumber(spoken);
  const cleaned = normalizeText(spoken)
    .split(" ")
    .filter(w => !/^\d/.test(w))
    .filter(w => !["kus","kusu","ks","kg","kilogramu","litru","l","lahvi","lahve"].includes(w))
    .filter(w => !["nula","jeden","jedna","dve","dva","tri","ctyri","pet","sest","sedm","osm","devet","deset","jedenact","dvanact","trinact","ctrnact","patnact","sestnact","sedmnact","osmnact","devatenact","dvacet","tricet","ctyricet","padesat"].includes(w))
    .join(" ");

  const tokens = cleaned.split(" ").filter(Boolean);
  const scored = items.map(item => {
    const name = normalizeText(`${item.name} ${item.code}`);
    let score = 0;
    for (const t of tokens) {
      if (name.includes(t)) score += Math.max(2, t.length);
    }
    if (cleaned && name.includes(cleaned)) score += 20;
    return {item, score};
  }).filter(x => x.score > 0).sort((a,b) => b.score - a.score).slice(0,5);
  return { quantity: n, matches: scored };
}

function handleTranscript(text) {
  $("voiceTranscript").textContent = text;
  const result = bestMatches(text);
  if (result.quantity === null || !result.matches.length) {
    $("voiceState").textContent = "Nepodařilo se bezpečně určit položku nebo množství.";
    return;
  }
  pendingVoice = { quantity: result.quantity, matches: result.matches, selectedId: result.matches[0].item.id };
  $("matchSummary").textContent = `Rozpoznané množství: ${result.quantity}`;
  $("matchOptions").innerHTML = result.matches.map((m, i) => `
    <label class="match-row">
      <input type="radio" name="matchItem" value="${escapeHtml(m.item.id)}" ${i===0 ? "checked" : ""}>
      <span><strong>${escapeHtml(m.item.name)}</strong><br><span class="subtle">${escapeHtml(m.item.warehouse)} · ${escapeHtml(m.item.unit)}</span></span>
    </label>
  `).join("");
  $("voiceDialog").close();
  $("matchDialog").showModal();
}

function startVoice() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    $("voiceState").textContent = "Tento prohlížeč nepodporuje hlasové rozpoznávání. Použijte Chrome na Androidu.";
    return;
  }
  const rec = new Recognition();
  rec.lang = "cs-CZ";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  $("voiceState").textContent = "Poslouchám…";
  rec.onresult = e => handleTranscript(e.results[0][0].transcript);
  rec.onerror = e => $("voiceState").textContent = `Chyba rozpoznávání: ${e.error}`;
  rec.onend = () => {
    if ($("voiceState").textContent === "Poslouchám…") $("voiceState").textContent = "Poslech ukončen.";
  };
  rec.start();
}

function loadDemo() {
  items = [
    {id:"PU05",code:"PU05",name:"Pilsner Urquell 0,5 l",unit:"ks",warehouse:"BAR",category:"Lahvové pivo",order:10},
    {id:"BIRSV",code:"BIRSV",name:"Birell světlý 0,5 l",unit:"ks",warehouse:"BAR",category:"Lahvové pivo",order:20},
    {id:"BIRPG",code:"BIRPG",name:"Birell Pomelo Grep 0,5 l",unit:"ks",warehouse:"BAR",category:"Lahvové pivo",order:30},
    {id:"PROS",code:"PROS",name:"Prosecco",unit:"ks",warehouse:"BAR",category:"Víno",order:40},
    {id:"HRAN",code:"HRAN",name:"Hranolky 9x9",unit:"kg",warehouse:"GRILL",category:"Mražené",order:10},
    {id:"KURE",code:"KURE",name:"Kuřecí prsa",unit:"kg",warehouse:"GRILL",category:"Maso",order:20}
  ];
  values = {};
  saveState();
  showInventory();
}

$("csvInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    items = parseCSV(text);
    values = {};
    saveState();
    showInventory();
  } catch (err) {
    alert(err.message);
  }
});

$("loadDemoBtn").addEventListener("click", loadDemo);
$("warehouseFilter").addEventListener("change", renderItems);
$("categoryFilter").addEventListener("change", renderItems);
$("searchInput").addEventListener("input", renderItems);
$("exportBtn").addEventListener("click", exportCSV);

$("menuBtn").addEventListener("click", () => $("drawer").classList.remove("hidden"));
$("closeDrawerBtn").addEventListener("click", () => $("drawer").classList.add("hidden"));
$("drawer").addEventListener("click", e => { if (e.target === $("drawer")) $("drawer").classList.add("hidden"); });

$("newInventoryBtn").addEventListener("click", () => {
  if (confirm("Opravdu vymazat všechna zadaná množství?")) {
    values = {};
    saveState();
    renderItems();
    $("drawer").classList.add("hidden");
  }
});

$("showSetupBtn").addEventListener("click", () => {
  $("inventoryPanel").classList.add("hidden");
  $("setupPanel").classList.remove("hidden");
  $("drawer").classList.add("hidden");
});

$("exportBackupBtn").addEventListener("click", () => {
  const data = JSON.stringify({version:1, exportedAt:new Date().toISOString(), items, values}, null, 2);
  download(`inventura_zaloha_${new Date().toISOString().slice(0,10)}.json`, data, "application/json");
});

$("backupInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.items) || typeof data.values !== "object") throw new Error("Neplatná záloha.");
    items = data.items; values = data.values;
    saveState(); showInventory();
    $("drawer").classList.add("hidden");
  } catch (err) { alert(err.message); }
});

$("voiceBtn").addEventListener("click", () => {
  $("voiceState").textContent = "Řekněte například: „Plzeň čtrnáct kusů“.";
  $("voiceTranscript").textContent = "";
  $("voiceDialog").showModal();
});
$("startVoiceBtn").addEventListener("click", startVoice);

$("confirmMatchBtn").addEventListener("click", () => {
  if (!pendingVoice) return;
  const selected = document.querySelector('input[name="matchItem"]:checked');
  if (!selected) return;
  values[selected.value] = pendingVoice.quantity;
  saveState();
  $("matchDialog").close();
  renderItems();
  const item = items.find(x => x.id === selected.value);
  $("statusText").textContent = `${item.name}: ${pendingVoice.quantity} ${item.unit}`;
  pendingVoice = null;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
loadState();
