// Shared read-only CDP helpers for connecting to ZCode's debug port.
// This module only connects + queries; action logic stays in other modules.
const http = require("http");
const { WebSocket } = require("ws");

const PORT = parseInt(process.env.ZCODE_DEBUG_PORT || "9222", 10);
const HOST = process.env.ZCODE_DEBUG_HOST || "127.0.0.1";

// Pure: filter /json targets to "real" ZCode pages.
// Excludes devtools://, non-page, no wsUrl.
function filterTargets(targets) {
  return targets.filter((t) => {
    if (t.type !== "page") return false;
    if (!t.webSocketDebuggerUrl) return false;
    const url = t.url || "";
    if (url.indexOf("devtools://") === 0) return false;
    return true;
  });
}

function httpGetJson(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      { host: HOST, port: PORT, path: urlPath, headers: { Host: "localhost" } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (!data) return reject(new Error("empty response"));
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error("bad JSON: " + data.slice(0, 120))); }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(4000, () => req.destroy(new Error("timeout")));
  });
}

async function listTargets() {
  const targets = await httpGetJson("/json");
  return filterTargets(targets);
}

// Chromium may return ws://localhost/... with no explicit port; rewrite to real host:port.
function fixWsHost(wsUrl) {
  return wsUrl
    .replace(/^ws:\/\/localhost\//i, "ws://127.0.0.1:" + PORT + "/")
    .replace(/^wss:\/\/localhost\//i, "wss://127.0.0.1:" + PORT + "/")
    .replace(/^ws:\/\/localhost(?=[:/])/i, "ws://127.0.0.1")
    .replace(/^wss:\/\/localhost(?=[:/])/i, "wss://127.0.0.1");
}

let _callId = 0;
function connect(wsUrl) {
  wsUrl = fixWsHost(wsUrl);
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && pending.has(msg.id)) {
        const { resolve: ok, reject: no } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? no(new Error("CDP: " + JSON.stringify(msg.error))) : ok(msg.result);
      }
    });
    const call = (method, params) =>
      new Promise((resolve, reject) => {
        const id = ++_callId;
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params: params || {} }), (err) => err && reject(err));
        setTimeout(() => {
          if (pending.has(id)) { pending.delete(id); reject(new Error("CDP timeout: " + method)); }
        }, 8000);
      });
    ws.on("open", () => resolve({ ws, call }));
    ws.on("error", reject);
  });
}

module.exports = { filterTargets, listTargets, httpGetJson, connect, fixWsHost, PORT, HOST };
