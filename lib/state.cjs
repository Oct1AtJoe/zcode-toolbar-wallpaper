// Wallpaper persistence: read/write .wallpaper.json (atomic tmp+rename).
// Extracted from rotate.cjs so both inject.cjs and server.cjs reuse ONE copy.
const fs = require("fs");

// Read state JSON. Missing/corrupt/unreadable -> null (no throw).
function readState(statePath) {
  if (!statePath) return null;
  var raw;
  try { raw = fs.readFileSync(statePath, "utf8"); } catch (e) { return null; }
  try { return JSON.parse(raw); } catch (e) { return null; }
}

// Write state atomically (tmp file + rename, so readers never see a half-write).
function writeState(statePath, obj) {
  if (!statePath) return;
  var tmp = statePath + ".tmp";
  try {
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
    fs.renameSync(tmp, statePath);
  } catch (e) {
    // best-effort; don't crash if fs is unwritable
  }
}

module.exports = { readState, writeState };
