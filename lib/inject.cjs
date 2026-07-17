// CDP wallpaper injector for ZCode (Electron).
// Connects to a ZCode instance launched with --remote-debugging-port and
// injects a <style> element (wallpaper) or removes it.
// Image mode only (no video support in this standalone project).
//
// Usage:
//   node lib/inject.cjs              # inject wallpaper (from wallpapers-thumb/)
//   node lib/inject.cjs --remove     # remove the injected wallpaper

const fs = require("fs");
const path = require("path");
const cdp = require("./cdp.cjs");
const { listTargets, connect, PORT, HOST } = cdp;

const STYLE_ID = "zcode-user-wallpaper";
const DIM_EL_ID = "zcode-user-wallpaper-dim";
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"];

// Convert a Windows absolute path to a file:/// URL.
function toFileUrl(p) {
  return "file:///" + String(p).replace(/\\/g, "/");
}

// Encode a file URL for safe use in src attributes (percent-encode path).
function encodeFileUrl(fileUrl) {
  var m = /^(file:\/\/\/)(.*)$/.exec(fileUrl);
  if (!m) return encodeURI(fileUrl);
  return m[1] + encodeURI(m[2]);
}

// List image filenames in dir (by extension). Returns [] if dir missing/empty.
function listWallpapers(dir) {
  try {
    var entries = fs.readdirSync(dir);
  } catch (e) {
    return [];
  }
  return entries.filter(function (name) {
    var ext = path.extname(name).toLowerCase();
    return IMAGE_EXTS.indexOf(ext) !== -1;
  });
}

// Pick a random item. Returns null for empty list.
function pickRandom(items) {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

// Parse ZCODE_WP_DIM (0-100 percent) -> alpha (0-1). Default 0.6.
function parseDimPct() {
  var raw = process.env.ZCODE_WP_DIM;
  if (raw == null || raw === "") return DEFAULT_DIM_PCT;
  var n = Number(raw);
  if (!isFinite(n)) return DEFAULT_DIM_PCT;
  n = Math.max(0, Math.min(100, n));
  return n / 100;
}

// Resolve dim alpha with persistence fallback:
//   1. ZCODE_WP_DIM env var (explicit override, e.g. from pickWallpaper action)
//   2. .wallpaper.json dim field (persisted across restarts)
//   3. DEFAULT_DIM_PCT
// This makes restarts preserve the last user-chosen dim.
var DEFAULT_DIM_PCT = 0.6;
function resolveDimPct(statePath) {
  if (process.env.ZCODE_WP_DIM != null && process.env.ZCODE_WP_DIM !== "") {
    return parseDimPct();
  }
  try {
    var state = require("./state.cjs");
    var st = state.readState(statePath);
    if (st && st.dim != null) {
      var n = Number(st.dim);
      if (isFinite(n)) {
        n = Math.max(0, Math.min(100, n));
        return n / 100;
      }
    }
  } catch (e) {}
  return DEFAULT_DIM_PCT;
}

// Build the JS snippet for creating/removing the dim overlay <div>.
function buildDimSegment(alpha) {
  var a = Math.max(0, Math.min(1, alpha));
  if (a <= 0) {
    return (
      "var oldD=document.getElementById(" + JSON.stringify(DIM_EL_ID) +
      ");if(oldD){oldD.remove();}"
    );
  }
  return (
    "var did=" + JSON.stringify(DIM_EL_ID) +
    ";var oldD=document.getElementById(did);if(oldD){oldD.remove();}" +
    "var d=document.createElement('div');d.id=did;" +
    "d.style.cssText='position:fixed;top:0;left:0;width:100vw;height:100vh;" +
    "background:rgba(0,0,0," + a + ");z-index:-1;pointer-events:none;';" +
    "document.documentElement.appendChild(d);"
  );
}

var MODE = process.argv.includes("--remove") ? "remove" : "inject";

// Build the JS expression to run inside the page via Runtime.evaluate.
function buildExpression(mode, css, dim) {
  if (mode === "remove") {
    return (
      "(function(){var s=document.getElementById(" +
      JSON.stringify(STYLE_ID) +
      ");var d=document.getElementById(" +
      JSON.stringify(DIM_EL_ID) +
      ");var did=false;if(s){s.remove();did=true;}if(d){d.remove();did=true;}" +
      "return did?'removed':'none';})()"
    );
  }
  // inject (image mode): refresh the <style>, create dim overlay
  return (
    "(function(){var id=" +
    JSON.stringify(STYLE_ID) +
    ";var existing=document.getElementById(id);if(existing)existing.remove();" +
    "var s=document.createElement('style');s.id=id;s.textContent=" +
    JSON.stringify(css) +
    ";document.documentElement.appendChild(s);" +
    buildDimSegment(dim || 0) +
    "return 'ok';})();"
  );
}

async function main() {
  var css = "";
  if (MODE === "inject") {
    if (process.env.ZCODE_WP_CSS) {
      // Bypass: use specified CSS file (caller handles .wallpaper.json)
      css = fs.readFileSync(process.env.ZCODE_WP_CSS, "utf8");
    } else {
      var wallpapersDir = path.join(__dirname, "..", "wallpapers-thumb");
      var images = listWallpapers(wallpapersDir);
      if (images.length === 0) {
        console.log("[wallpaper] wallpapers-thumb/ is empty, skipping injection.");
        console.log("[wallpaper] Put images in wallpapers/ and run: npm run resize");
        process.exit(0);
      }
      // Restore last-used wallpaper if still present
      var state = require("./state.cjs");
      var statePath = path.join(__dirname, "..", ".wallpaper.json");
      var wpState = state.readState(statePath);
      var chosen = null;
      if (wpState && wpState.file && images.indexOf(wpState.file) !== -1) {
        chosen = wpState.file;
        console.log("[wallpaper] Restoring: " + chosen);
      }
      if (!chosen) {
        chosen = pickRandom(images);
        console.log("[wallpaper] Picked: " + chosen + " (" + images.length + " available)");
      }
      var fileUrl = toFileUrl(path.join(wallpapersDir, chosen));
      css = fs.readFileSync(path.join(__dirname, "wallpaper.css"), "utf8");
      css += '\nbody { background-image: url("' + fileUrl + '") !important; }\n';
      // Record for next restart (preserve persisted dim across restarts)
      try {
        var prevDim = (wpState && wpState.dim != null) ? wpState.dim : null;
        state.writeState(statePath, { file: chosen, setAt: Date.now(), source: "inject", dim: prevDim });
      } catch (e) {}
    }
  }

  var targets;
  try {
    targets = await listTargets();
  } catch (e) {
    console.error("[wallpaper] Cannot connect to debug port " + PORT + ": " + e.message);
    process.exit(1);
  }

  var statePath = path.join(__dirname, "..", ".wallpaper.json");
  var dim = resolveDimPct(statePath);
  var expression = buildExpression(MODE, css, dim);

  function verifyExpression(mode) {
    if (mode === "remove") {
      return (
        "(document.getElementById(" + JSON.stringify(STYLE_ID) +
        ")||document.getElementById(" + JSON.stringify(DIM_EL_ID) +
        "))?'present':'gone'"
      );
    }
    return (
      "(function(){var s=document.getElementById(" + JSON.stringify(STYLE_ID) +
      ");var bg=getComputedStyle(document.body).backgroundImage;" +
      "return (!s||bg==='none') ? 'noeffect' : 'effect';})()"
    );
  }

  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var MAX_ATTEMPTS = 6;
  var ATTEMPT_DELAY_MS = 800;

  async function injectOne(target) {
    var ws;
    try {
      var connected = await connect(target.webSocketDebuggerUrl);
      ws = connected.ws;
      var call = connected.call;
      await call("Runtime.evaluate", { expression: expression, returnByValue: true });
      var vres = await call("Runtime.evaluate", {
        expression: verifyExpression(MODE),
        returnByValue: true,
      });
      var v = vres.result && vres.result.value;
      ws.close(); ws = null;
      return v === (MODE === "remove" ? "gone" : "effect");
    } catch (e) {
      if (ws) { try { ws.close(); } catch (_) {} }
      return false;
    }
  }

  var affected = 0;
  var satisfied = new Set();
  for (var attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    var live;
    try { live = await listTargets(); } catch (e) {
      if (attempt < MAX_ATTEMPTS) await sleep(ATTEMPT_DELAY_MS);
      continue;
    }
    for (var i = 0; i < live.length; i++) {
      var t = live[i];
      if (satisfied.has(t.id || t.webSocketDebuggerUrl)) continue;
      var ok = await injectOne(t);
      if (ok) {
        satisfied.add(t.id || t.webSocketDebuggerUrl);
        console.log("[wallpaper] " + (MODE === "remove" ? "Removed" : "Injected") +
          " -> " + (t.title || "").slice(0, 30) + "  (attempt " + attempt + ")");
      }
    }
    if (attempt < MAX_ATTEMPTS) await sleep(ATTEMPT_DELAY_MS);
  }
  affected = satisfied.size;
  console.log("[wallpaper] Done, affected " + affected + " window(s).");
  process.exit(affected > 0 ? 0 : 1);
}

module.exports = {
  toFileUrl: toFileUrl,
  encodeFileUrl: encodeFileUrl,
  listWallpapers: listWallpapers,
  pickRandom: pickRandom,
  buildExpression: buildExpression,
  buildDimSegment: buildDimSegment,
  parseDimPct: parseDimPct,
  resolveDimPct: resolveDimPct,
  STYLE_ID: STYLE_ID,
  DIM_EL_ID: DIM_EL_ID,
};

if (require.main === module) {
  main().catch(function (e) {
    console.error("[wallpaper] FAILED:", e.message);
    process.exit(1);
  });
}
