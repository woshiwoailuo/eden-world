const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");
let state = null;
let focusId = "adam";
const TILE = { grass:"#1a2e22", wild:"#0f1a14", garden:"#245c32", tree:"#3f7a3a", hut:"#4a3b28", market:"#3b3344" };
function tileSize() { if (!state) return 40; return Math.floor(canvas.width / state.grid[0].length); }
function draw() {
  if (!state) return;
  const tw = tileSize();
  const th = Math.floor(canvas.height / state.grid.length);
  for (let y = 0; y < state.grid.length; y++) {
    for (let x = 0; x < state.grid[y].length; x++) {
      ctx.fillStyle = TILE[state.grid[y][x]] || "#123";
      ctx.fillRect(x * tw, y * th, tw - 1, th - 1);
    }
  }
  for (const g of state.graves || []) {
    ctx.fillStyle = "#64748b";
    ctx.fillRect(g.x * tw + tw * 0.35, g.y * th + th * 0.35, tw * 0.3, th * 0.3);
  }
  for (const a of state.agents) {
    if (!a.alive) continue;
    ctx.fillStyle = a.color || "#f8fafc";
    ctx.beginPath();
    ctx.arc(a.x * tw + tw / 2, a.y * th + th / 2, Math.max(5, tw * 0.28), 0, Math.PI * 2);
    ctx.fill();
    if (a.id === focusId) { ctx.strokeStyle = "#f8fafc"; ctx.strokeRect(a.x * tw + 2, a.y * th + 2, tw - 4, th - 4); }
    ctx.fillStyle = "#e2e8f0"; ctx.font = "12px sans-serif"; ctx.fillText(a.name, a.x * tw + 2, a.y * th - 2);
  }
}
function render() {
  if (!state) return;
  document.getElementById("worldName").textContent = state.name;
  document.getElementById("meta").textContent = `纪年 ${state.year} · 人口 ${state.population}/${state.cap} · 市集存粮 ${state.marketFood} · tick ${state.tick}`;
  document.getElementById("thoughts").innerHTML = state.agents.filter(a => a.alive).map(a => `<div><span class="who">${a.name}</span> · ${a.jobLabel} · 饿${a.hunger}<br/>${a.thought}</div>`).join("");
  document.getElementById("chronicle").innerHTML = [...state.chronicle].reverse().map(c => `<div>Y${c.year} ${c.text}</div>`).join("");
  document.getElementById("laws").innerHTML = state.laws.map(l => `<li>${l.text}（附议 ${l.votes}）</li>`).join("");
  document.getElementById("civ").innerHTML = (state.civilization || []).map(c => `<span>${c}</span>`).join("");
  const a = state.agents.find(x => x.id === focusId) || state.agents.find(x => x.alive);
  const box = document.getElementById("focusCard");
  if (a) {
    focusId = a.id;
    const spouse = state.agents.find(x => x.id === a.spouseId);
    box.innerHTML = `<h2>${a.name} ${a.alive ? "" : "（亡）"}</h2><p class="muted">${a.gender==="m"?"男":"女"} · ${a.age}岁 · 第${a.generation}代 · ${a.jobLabel}${spouse?" · 伴侣 "+spouse.name:""}</p><div class="bar"><i style="width:${a.hunger}%"></i></div><p class="muted">食物 ${a.food} · 钱 ${a.money} · 罪 ${a.crimes}</p><p>${a.thought}</p>`;
  }
  draw();
}
canvas.addEventListener("click", ev => {
  if (!state) return;
  const rect = canvas.getBoundingClientRect();
  const tw = tileSize();
  const th = Math.floor(canvas.height / state.grid.length);
  const x = Math.floor(((ev.clientX - rect.left) * (canvas.width / rect.width)) / tw);
  const y = Math.floor(((ev.clientY - rect.top) * (canvas.height / rect.height)) / th);
  const hit = state.agents.find(a => a.alive && a.x === x && a.y === y);
  if (hit) { focusId = hit.id; render(); }
});
document.getElementById("offer").addEventListener("submit", async e => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target).entries());
  const msg = document.getElementById("offerMsg");
  msg.textContent = "投入中…";
  const res = await fetch("/api/offering", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
  const data = await res.json();
  msg.textContent = data.ok ? "已进入世界。" : (data.error || "失败");
});
function connect() {
  const es = new EventSource("/live");
  es.onmessage = ev => { state = JSON.parse(ev.data); render(); };
  es.onerror = () => { es.close(); setTimeout(connect, 1500); };
}
connect();
