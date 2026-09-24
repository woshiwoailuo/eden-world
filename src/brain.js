/**
 * Decision layer: rules first, optional OpenAI-compatible API for hard choices.
 */
const DEFAULT_LAWS = [
  { id: "no_steal", text: "不可偷取他人食物与财物", votes: 0 },
  { id: "share_famine", text: "饥荒时优先把食物分给孩子", votes: 0 }
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function relationScore(a, b) {
  if (!a.relations[b.id]) a.relations[b.id] = { know: 0, like: 0 };
  return a.relations[b.id];
}

async function callLlm(api, system, user) {
  if (!api || !api.baseUrl || !api.apiKey || !api.model) return null;
  const url = api.baseUrl.replace(/\/$/, "") + "/chat/completions";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + api.apiKey
      },
      body: JSON.stringify({
        model: api.model,
        temperature: 0.9,
        max_tokens: 180,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user }
        ]
      }),
      signal: ctrl.signal
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.choices && data.choices[0] && data.choices[0].message.content || "").trim();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function localThought(agent, world) {
  if (agent.hunger >= 80) {
    return pick([
      "腹中空空，必须先找到吃的。",
      "再不进食，恐怕挨不过今夜。",
      "饥饿压过了一切别的念头。"
    ]);
  }
  if (agent.food >= 2 && agent.hunger < 40) {
    return pick(["存了一些粮食，心里稍安。", "今天还不至于挨饿。"]);
  }
  if (agent.job === "none") {
    return pick(["我需要一份能换食物的活计。", "两手空空，得自己想办法。"]);
  }
  if (world.population >= 4 && Math.random() < 0.3) {
    return pick([
      "人多了，得有个说了算的规矙。",
      "若无人约束，偷窃会毁掉这点收成。",
      "也许该给这片地起个名字。"
    ]);
  }
  if (agent.spouseId) {
    return pick(["贺记家里的人。", "希望伴侣今晚不必挨饿。"]);
  }
  return pick([
    "风从园子那头吹过来。",
    "今天的活还没做完。",
    "我在想，明天该往哪边开垦。",
    "这世界除了我们，还会有谁。"
  ]);
}

function localAction(agent, world) {
  if (agent.hunger >= 70 && agent.food > 0) return "eat";
  if (agent.hunger >= 75 && agent.food <= 0 && agent.money >= 2) return "buy_food";
  if (agent.hunger >= 85 && agent.food <= 0 && agent.money < 2) {
    return Math.random() < 0.45 ? "beg" : "steal";
  }
  if (agent.job === "none") return "seek_work";
  if (agent.age >= 16 && !agent.spouseId && agent.hunger < 55) return "seek_mate";
  if (agent.job !== "none" && agent.hunger < 70) return "work";
  if (world.tick % 40 === agent.id.charCodeAt(0) % 40 && world.population >= 3) {
    return "propose_law";
  }
  return "wander";
}

async function decide(agent, world, api) {
  const others = world.agents
    .filter((x) => x.id !== agent.id && x.alive)
    .map((x) => `${x.name}(${x.gender},饿${x.hunger},食${x.food},钱${x.money},${x.job})`)
    .join("；");

  const system = `你是虚拟世界中的独立生命，不是助手。你叫${agent.name}，${agent.gender === "m" ? "男" : "女"}，年龄${agent.age}。
你必须自己活：会饿，会病，会死，可以求人、劳动、交易、偷窃、求偶、提议规矙。
不可等待人类指令。用中文短句思考。
只输出JSON：{"thought":"一句内心","action":"eat|buy_food|work|seek_work|wander|beg|steal|seek_mate|propose_law|rest"}`;

  const user = `饥饿${agent.hunger}/100，食物${agent.food}，钱${agent.money}，职业${agent.job}，配偶${agent.spouseId || "无"}。
镇民：${others || "只剩自己"}。
现行规矙：${world.laws.map((l) => l.text).join("；") || "尚无"}。
年份约${world.year}。请做决定。`;

  const raw = await callLlm(api, system, user);
  if (raw) {
    try {
      const jsonStart = raw.indexOf("{");
      const jsonEnd = raw.lastIndexOf("}");
      const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
      const allowed = new Set([
        "eat", "buy_food", "work", "seek_work", "wander", "beg", "steal", "seek_mate", "propose_law", "rest"
      ]);
      if (parsed.thought && allowed.has(parsed.action)) {
        return { thought: String(parsed.thought).slice(0, 80), action: parsed.action, via: "llm" };
      }
    } catch {}
  }
  return { thought: localThought(agent, world), action: localAction(agent, world), via: "rule" };
}

module.exports = { decide, relationScore, pick, DEFAULT_LAWS, callLlm };
