const http = require("http");
const fs = require("fs");
const path = require("path");
const worldMod = require("./src/world");

const PORT = process.env.PORT || 8787;
const PUBLIC = path.join(__dirname, "public");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon"
};

let world = worldMod.load();
const clients = new Set();

const globalApi = {
  baseUrl: process.env.LLM_BASE_URL || "",
  apiKey: process.env.LLM_API_KEY || "",
  model: process.env.LLM_MODEL || "gpt-4o-mini"
};

function send(res, code, body, type) {
  res.writeHead(code, { "Content-Type": type || "application/json; charset=utf-8" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = "";
    req.on("data", (c) => {
      d += c;
      if (d.length > 32000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(d ? JSON.parse(d) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

function broadcast() {
  const payload = "data: " + JSON.stringify(worldMod.publicState(world)) + "\n\n";
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(res);
    }
  }
}

function serveStatic(req, res) {
  let file = req.url.split("?")[0];
  if (file === "/") file = "/index.html";
  const full = path.normalize(path.join(PUBLIC, file));
  if (!full.startsWith(PUBLIC)) return send(res, 403, "forbidden", "text/plain");
  fs.readFile(full, (err, buf) => {
    if (err) return send(res, 404, "not found", "text/plain");
    res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "application/octet-stream" });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return send(res, 204, "");

  if (req.url === "/api/state") return send(res, 200, worldMod.publicState(world));

  if (req.url === "/live") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    res.write("data: " + JSON.stringify(worldMod.publicState(world)) + "\n\n");
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  if (req.method === "POST" && req.url === "/api/offering") {
    try {
      const body = await readBody(req);
      if (!body.name || String(body.name).trim().length < 1) {
        return send(res, 400, { ok: false, error: "需要名字" });
      }
      const api =
        body.apiKey && String(body.apiKey).trim()
          ? {
              baseUrl: String(body.baseUrl || "https://api.openai.com/v1").trim(),
              apiKey: String(body.apiKey).trim(),
              model: String(body.model || "gpt-4o-mini").trim()
            }
          : null;
      const result = worldMod.addOutsider(world, {
        name: String(body.name).trim(),
        gender: body.gender,
        api,
        creator: "offering"
      });
      if (!result.ok) return send(res, 400, result);
      broadcast();
      return send(res, 200, result);
    } catch {
      return send(res, 400, { ok: false, error: "bad json" });
    }
  }

  if (req.method === "POST" && req.url === "/api/reset") {
    const body = await readBody(req).catch(() => ({}));
    if (body.confirm === "EDEN") {
      world = worldMod.genesis();
      worldMod.save(world);
      broadcast();
      return send(res, 200, { ok: true });
    }
    return send(res, 403, { ok: false });
  }

  serveStatic(req, res);
});

let ticking = false;
setInterval(async () => {
  if (ticking) return;
  ticking = true;
  try {
    const api = globalApi.apiKey ? globalApi : null;
    world = await worldMod.tick(world, api);
    broadcast();
  } catch (err) {
    console.error("tick", err);
  } finally {
    ticking = false;
  }
}, worldMod.TICK_MS);

server.listen(PORT, "0.0.0.0", () => {
  console.log("Eden World http://0.0.0.0:" + PORT);
});
