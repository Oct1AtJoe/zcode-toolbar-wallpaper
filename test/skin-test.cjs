// Tests for lib/skin-inject.cjs pure functions
var pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL: " + name); }
}
var path = require("path");
var fs = require("fs");
var skin = require("../lib/skin-inject.cjs");

// --- constants ---
check("SKIN_STYLE_ID", skin.SKIN_STYLE_ID === "zcode-user-skin");
check("FONT_WEIGHTS has 4", skin.FONT_WEIGHTS.length === 4);
check("FONT_WEIGHTS weights", skin.FONT_WEIGHTS.map(function (f) { return f.weight; }).join(",") === "400,500,600,700");
check("FONTS_DIR points to lib/fonts", /lib[\\\/]fonts$/.test(skin.FONTS_DIR));

// --- buildSkinExpression inject ---
var expr = skin.buildSkinExpression("inject", "body{color:red}");
check("inject returns IIFE", expr.indexOf("(function(){") === 0);
check("inject has style id", expr.indexOf("zcode-user-skin") !== -1);
check("inject has css content", expr.indexOf("body{color:red}") !== -1);
check("inject creates style el", expr.indexOf("createElement('style')") !== -1);
check("inject appends to documentElement", expr.indexOf("document.documentElement.appendChild") !== -1);
// idempotent: removes existing before append
check("inject removes existing first", expr.indexOf("if(existing)existing.remove()") !== -1);

// --- buildSkinExpression remove ---
var rem = skin.buildSkinExpression("remove", "");
check("remove returns IIFE", rem.indexOf("(function(){") === 0);
check("remove has style id", rem.indexOf("zcode-user-skin") !== -1);
check("remove returns removed/none", rem.indexOf("'removed'") !== -1 && rem.indexOf("'none'") !== -1);
check("remove calls .remove()", rem.indexOf(".remove()") !== -1);

// --- buildVerifyExpression ---
var vInj = skin.buildVerifyExpression("inject");
check("verify inject checks presence", vInj.indexOf("present") !== -1 && vInj.indexOf("absent") !== -1);
var vRem = skin.buildVerifyExpression("remove");
check("verify remove checks gone", vRem.indexOf("present") !== -1 && vRem.indexOf("gone") !== -1);

// --- buildFontFaceCss (HTTP URLs, no base64) ---
var fontFace = skin.buildFontFaceCss();
check("fontFace has @font-face", fontFace.indexOf("@font-face") !== -1);
check("fontFace has Assistant family", fontFace.indexOf('font-family:"Assistant"') !== -1);
check("fontFace has HTTP font url", fontFace.indexOf("http://127.0.0.1:18923/fonts/") !== -1);
check("fontFace has format woff2", fontFace.indexOf('format("woff2")') !== -1);
check("fontFace has NO base64 data uri", fontFace.indexOf("data:font/woff2;base64,") === -1);
// exactly 4 @font-face blocks (one per declared weight, no file IO)
var ffCount = (fontFace.match(/@font-face/g) || []).length;
check("fontFace has 4 blocks", ffCount === 4);
check("fontFace has weight 400", fontFace.indexOf("font-weight:400") !== -1);
check("fontFace has weight 700", fontFace.indexOf("font-weight:700") !== -1);
check("fontFace references Regular woff2", fontFace.indexOf("Assistant-Regular.woff2") !== -1);

// --- buildSkinCss (font-face + skin.css combined) ---
var skinCssPath = path.join(__dirname, "..", "lib", "skin.css");
var fullCss = skin.buildSkinCss(skinCssPath);
check("fullCss has @font-face block", fullCss.indexOf("@font-face") !== -1);
check("fullCss has --font-sans override", fullCss.indexOf("--font-sans:") !== -1);
check("fullCss has Assistant in font-family", fullCss.indexOf('"Assistant"') !== -1);
check("fullCss has frosted backdrop-filter", fullCss.indexOf("blur(20px)") !== -1);
check("fullCss has sidebar selector", fullCss.indexOf("workspace-sidebar-panel-width") !== -1);
check("fullCss has scrollbar rule", fullCss.indexOf("scrollbar-thumb") !== -1);
// font-face comes before skin rules
check("font-face precedes skin rules", fullCss.indexOf("@font-face") < fullCss.indexOf("--font-sans"));
// injected CSS should be small (HTTP URLs, not base64) -- under 5KB
check("fullCss is small (<6KB, no base64)", fullCss.length < 6000);

console.log("skin-test: " + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
