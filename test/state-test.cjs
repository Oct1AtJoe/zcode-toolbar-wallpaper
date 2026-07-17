// Tests for lib/state.cjs
var pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL: " + name); }
}
var state = require("../lib/state.cjs");
var fs = require("fs");
var path = require("path");
var os = require("os");

var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "state-test-"));

// --- readState ---
check("readState null path", state.readState(null) === null);
check("readState missing file", state.readState(path.join(tmpDir, "nope.json")) === null);

// Write a corrupt file
fs.writeFileSync(path.join(tmpDir, "bad.json"), "not json {{{");
check("readState corrupt", state.readState(path.join(tmpDir, "bad.json")) === null);

// --- writeState + readState roundtrip ---
var statePath = path.join(tmpDir, ".wallpaper.json");
state.writeState(statePath, { file: "test.jpg", setAt: 12345, source: "test" });
var read = state.readState(statePath);
check("roundtrip file", read.file === "test.jpg");
check("roundtrip setAt", read.setAt === 12345);
check("roundtrip source", read.source === "test");

// --- writeState null path (no crash) ---
state.writeState(null, { x: 1 });

// --- writeState overwrites ---
state.writeState(statePath, { file: "new.jpg" });
var read2 = state.readState(statePath);
check("overwrite", read2.file === "new.jpg");

// Cleanup
try { fs.rmSync(tmpDir, { recursive: true }); } catch (e) {}

console.log("state-test: " + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
