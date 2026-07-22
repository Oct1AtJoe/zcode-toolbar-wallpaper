// CDP skin injector for ZCode (Electron).
// Injects a <style id="zcode-user-skin"> containing:
//   1. @font-face for Assistant (4 weights, woff2 as base64 data URIs)
//   2. --font-sans override (Assistant first)
//   3. Frosted-glass rules for the left sidebar (from lib/skin.css)
// Non-invasive: no app.asar edits. Mirrors lib/inject.cjs structure.
//
// Usage:
//   node lib/skin-inject.cjs            # inject skin
//   node lib/skin-inject.cjs --remove   # remove the injected skin
//
// The skin <style> is appended AFTER the wallpaper <style> so its
// frosted rgba bg wins over wallpaper.css's transparent (specificity
// also favors the skin's nested selectors).

const fs = require("fs");
const path = require("path");
const cdp = require("./cdp.cjs");
const { listTargets, connect, PORT, HOST } = cdp;

// Style element id used to find/remove the injected skin CSS.
var SKIN_STYLE_ID = "zcode-user-skin";

// Directory holding the Assistant woff2 source files.
var FONTS_DIR = path.join(__dirname, "fonts");

// Assistant weight -> woff2 filename mapping. Missing files are
// silently skipped (the font-family fallback chain handles absence).
var FONT_WEIGHTS = [
  { file: "Assistant-Regular.woff2", weight: 400 },
  { file: "Assistant-Medium.woff2", weight: 500 },
  { file: "Assistant-SemiBold.woff2", weight: 600 },
  { file: "Assistant-Bold.woff2", weight: 700 },
];

// Build @font-face CSS block referencing woff2 via the local HTTP server.
// Fonts are served by server.cjs at GET /fonts/:name -- this keeps the
// injected CSS tiny (~500B vs ~107KB for base64), so CDP transfer + V8
// parse stays as fast as the wallpaper inject. The browser then loads
// the woff2 asynchronously (font-display:swap -> fallback first).
// Port follows the project convention (18923, same as wallpaper-pick.cjs).
var FONT_PORT = Number(process.env.ZCODE_SKIN_PORT) || 18923;
var FONT_HOST = process.env.ZCODE_SKIN_HOST || "127.0.0.1";
function buildFontFaceCss() {
  var base = "http://" + FONT_HOST + ":" + FONT_PORT + "/fonts/";
  var blocks = [];
  for (var i = 0; i < FONT_WEIGHTS.length; i++) {
    var fw = FONT_WEIGHTS[i];
    blocks.push(
      '@font-face{font-family:"Assistant";font-style:normal;' +
        "font-weight:" + fw.weight + ";font-display:swap;" +
        "src:url(" + base + fw.file + ') format("woff2");}'
    );
  }
  return blocks.join("\n");
}

// Assemble the full CSS to inject: @font-face (HTTP URLs) + skin.css rules.
// Throws if skin.css is unreadable (fatal -- nothing to inject without it).
function buildSkinCss(skinCssPath) {
  var fontFace = buildFontFaceCss();
  var skin = fs.readFileSync(skinCssPath, "utf8");
  return fontFace + "\n" + skin;
}

// Build the JS expression to run inside the page via Runtime.evaluate.
// mode "inject": replace any existing skin style, append a fresh one.
// mode "remove": drop the skin style element if present.
function buildSkinExpression(mode, css) {
  if (mode === "remove") {
    return (
      "(function(){var s=document.getElementById(" +
      JSON.stringify(SKIN_STYLE_ID) +
      ");if(s){s.remove();return 'removed';}return 'none';})()"
    );
  }
  // inject: idempotent -- remove old skin style first, then append new
  return (
    "(function(){var id=" +
    JSON.stringify(SKIN_STYLE_ID) +
    ";var existing=document.getElementById(id);if(existing)existing.remove();" +
    "var s=document.createElement('style');s.id=id;s.textContent=" +
    JSON.stringify(css) +
    ";document.documentElement.appendChild(s);return 'ok';})();"
  );
}

// Build a verify expression to confirm inject/remove took effect.
// inject -> expect "present"; remove -> expect "gone".
function buildVerifyExpression(mode) {
  if (mode === "remove") {
    return (
      "(document.getElementById(" + JSON.stringify(SKIN_STYLE_ID) +
      "))?'present':'gone'"
    );
  }
  return (
    "(function(){var s=document.getElementById(" + JSON.stringify(SKIN_STYLE_ID) +
    ");return s?'present':'absent';})()"
  );
}

// Main entry: connect to ZCode debug port, inject/remove skin on all
// page targets, retry up to MAX_ATTEMPTS with ATTEMPT_DELAY_MS gap.
async function main() {
  var mode = process.argv.includes("--remove") ? "remove" : "inject";
  var css = "";
  if (mode === "inject") {
    css = buildSkinCss(path.join(__dirname, "skin.css"));
  }
  var expression = buildSkinExpression(mode, css);

  // probe debug port
  var targets;
  try {
    targets = await listTargets();
  } catch (e) {
    console.error("[skin] Cannot connect to debug port " + PORT + ": " + e.message);
    process.exit(1);
  }

  var sleep = function (ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  };
  var MAX_ATTEMPTS = 6;
  var ATTEMPT_DELAY_MS = 800;
  var satisfied = new Set();

  for (var attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    var live;
    try {
      live = await listTargets();
    } catch (e) {
      if (attempt < MAX_ATTEMPTS) await sleep(ATTEMPT_DELAY_MS);
      continue;
    }
    for (var i = 0; i < live.length; i++) {
      var t = live[i];
      var key = t.id || t.webSocketDebuggerUrl;
      if (satisfied.has(key)) continue;
      var ws = null;
      try {
        var connected = await connect(t.webSocketDebuggerUrl);
        ws = connected.ws;
        var call = connected.call;
        await call("Runtime.evaluate", { expression: expression, returnByValue: true });
        var vres = await call("Runtime.evaluate", {
          expression: buildVerifyExpression(mode),
          returnByValue: true,
        });
        var v = vres.result && vres.result.value;
        ws.close(); ws = null;
        // inject ok when style present; remove ok when gone
        var ok = v === (mode === "remove" ? "gone" : "present");
        if (ok) {
          satisfied.add(key);
          console.log("[skin] " + (mode === "remove" ? "Removed" : "Injected") +
            " -> " + (t.title || "").slice(0, 30) + "  (attempt " + attempt + ")");
        }
      } catch (e) {
        if (ws) { try { ws.close(); } catch (_) {} }
      }
    }
    // Early exit: every current target already satisfied -> stop retrying.
    var allDone = live.length > 0;
    for (var k = 0; k < live.length; k++) {
      if (!satisfied.has(live[k].id || live[k].webSocketDebuggerUrl)) { allDone = false; break; }
    }
    if (allDone) break;
    if (attempt < MAX_ATTEMPTS) await sleep(ATTEMPT_DELAY_MS);
  }
  console.log("[skin] Done, affected " + satisfied.size + " window(s).");
  process.exit(satisfied.size > 0 ? 0 : 1);
}

module.exports = {
  SKIN_STYLE_ID: SKIN_STYLE_ID,
  FONTS_DIR: FONTS_DIR,
  FONT_WEIGHTS: FONT_WEIGHTS,
  buildFontFaceCss: buildFontFaceCss,
  buildSkinCss: buildSkinCss,
  buildSkinExpression: buildSkinExpression,
  buildVerifyExpression: buildVerifyExpression,
};

if (require.main === module) {
  main().catch(function (e) {
    console.error("[skin] FAILED:", e.message);
    process.exit(1);
  });
}
