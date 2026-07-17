// Tests for lib/inject.cjs pure functions
var pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL: " + name); }
}
var inj = require("../lib/inject.cjs");

// --- toFileUrl ---
check("toFileUrl basic", inj.toFileUrl("C:\\a\\b") === "file:///C:/a/b");
check("toFileUrl forward slash", inj.toFileUrl("C:/x/y") === "file:///C:/x/y");

// --- encodeFileUrl ---
check("encodeFileUrl ascii", inj.encodeFileUrl("file:///C:/a/b.jpg") === "file:///C:/a/b.jpg");
check("encodeFileUrl chinese", inj.encodeFileUrl("file:///C:/壁纸/1.jpg").indexOf("file:///") === 0);

// --- listWallpapers ---
check("listWallpapers missing dir", inj.listWallpapers("/nonexistent").length === 0);

// --- pickRandom ---
check("pickRandom empty", inj.pickRandom([]) === null);
var items = ["a.jpg"];
check("pickRandom single", inj.pickRandom(items) === "a.jpg");

// --- buildExpression inject ---
var expr = inj.buildExpression("inject", "body{color:red}", 0);
check("inject returns IIFE", expr.indexOf("(function(){") === 0);
check("inject has style id", expr.indexOf("zcode-user-wallpaper") !== -1);
check("inject has css content", expr.indexOf("body{color:red}") !== -1);

// --- buildExpression remove ---
var rem = inj.buildExpression("remove", "", 0);
check("remove returns IIFE", rem.indexOf("(function(){") === 0);
check("remove has style id", rem.indexOf("zcode-user-wallpaper") !== -1);
check("remove checks dim id", rem.indexOf("zcode-user-wallpaper-dim") !== -1);
check("remove returns removed/none", rem.indexOf("'removed'") !== -1);

// --- buildDimSegment ---
var dim0 = inj.buildDimSegment(0);
check("dim 0 removes", dim0.indexOf(".remove()") !== -1);
check("dim 0 no rgba", dim0.indexOf("rgba") === -1);

var dim50 = inj.buildDimSegment(0.5);
check("dim 0.5 has rgba", dim50.indexOf("rgba(0,0,0,0.5)") !== -1);
check("dim 0.5 creates div", dim50.indexOf("createElement('div')") !== -1);

// --- parseDimPct ---
delete process.env.ZCODE_WP_DIM;
check("parseDimPct default", inj.parseDimPct() === 0.6);
process.env.ZCODE_WP_DIM = "80";
check("parseDimPct 80", inj.parseDimPct() === 0.8);
process.env.ZCODE_WP_DIM = "0";
check("parseDimPct 0", inj.parseDimPct() === 0);
process.env.ZCODE_WP_DIM = "";
check("parseDimPct empty", inj.parseDimPct() === 0.6);
delete process.env.ZCODE_WP_DIM;

// --- constants ---
check("STYLE_ID", inj.STYLE_ID === "zcode-user-wallpaper");
check("DIM_EL_ID", inj.DIM_EL_ID === "zcode-user-wallpaper-dim");

console.log("inject-test: " + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
