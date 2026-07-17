// Tests for lib/wallpaper-pick.cjs pure functions
var pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL: " + name); }
}
var wp = require("../lib/wallpaper-pick.cjs");

// --- constants ---
check("PICK_BTN_ID", wp.PICK_BTN_ID === "zcode-wp-pickbtn");
check("PICK_ACTION", wp.PICK_ACTION === "pickWallpaper");
check("DEFAULT_PORT", wp.DEFAULT_PORT === 18923);

// --- buildPickButtonExpression defaults ---
var expr = wp.buildPickButtonExpression();
check("default: is IIFE", expr.indexOf("(function(){") === 0);
check("default: removes old btn", expr.indexOf("getElementById") !== -1);
check("default: aria-label forward", expr.indexOf('aria-label="前进"') !== -1);
check("default: coordinate filter", expr.indexOf("r.x<200") !== -1);
check("default: returns no-anchor", expr.indexOf("'no-anchor'") !== -1);
check("default: returns ok", expr.indexOf("return 'ok'") !== -1);
check("default: creates button", expr.indexOf("createElement('button')") !== -1);
check("default: mirrors class", expr.indexOf("topLeft.className") !== -1);
check("default: svg icon", expr.indexOf("<svg") !== -1);
check("default: insertBefore", expr.indexOf("insertBefore") !== -1);
check("default: click handler", expr.indexOf("addEventListener('click'") !== -1);
check("default: preventDefault", expr.indexOf("preventDefault") !== -1);
check("default: fetch POST", expr.indexOf("method:'POST'") !== -1);
check("default: absolute URL port 18923", expr.indexOf("127.0.0.1:18923") !== -1);
check("default: pickWallpaper action", expr.indexOf('"pickWallpaper"') !== -1);
check("default: try/catch", expr.indexOf("try{") !== -1);

// --- custom port ---
var expr2 = wp.buildPickButtonExpression("mybtn", "myAction", 17891);
check("custom port in URL", expr2.indexOf("127.0.0.1:17891") !== -1);
check("custom btnId", expr2.indexOf('"mybtn"') !== -1);
check("custom action", expr2.indexOf('"myAction"') !== -1);

// --- default fallback ---
var expr3 = wp.buildPickButtonExpression(undefined, undefined, undefined);
check("undefined falls back to defaults", expr3.indexOf("127.0.0.1:18923") !== -1);

console.log("wallpaper-pick-test: " + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
