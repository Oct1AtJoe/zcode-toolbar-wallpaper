// Tests for lib/resize.cjs pure functions
var pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL: " + name); }
}
var resize = require("../lib/resize.cjs");
var fs = require("fs");
var path = require("path");
var os = require("os");

// --- constants ---
check("MAX_WIDTH", resize.MAX_WIDTH === 2560);
check("JPEG_QUALITY", resize.JPEG_QUALITY === 85);

// --- listSourceImages ---
check("listSourceImages missing dir", resize.listSourceImages("/nonexistent").length === 0);

// Create a temp dir with some files
var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "resize-test-"));
fs.writeFileSync(path.join(tmpDir, "photo.jpg"), "fake");
fs.writeFileSync(path.join(tmpDir, "photo.PNG"), "fake");
fs.writeFileSync(path.join(tmpDir, "readme.txt"), "not an image");
fs.writeFileSync(path.join(tmpDir, "icon.svg"), "vector"); // svg excluded by resize

var imgs = resize.listSourceImages(tmpDir);
check("listSourceImages finds jpg", imgs.indexOf("photo.jpg") !== -1);
check("listSourceImages finds PNG (lowercased)", imgs.indexOf("photo.PNG") !== -1);
check("listSourceImages excludes .txt", imgs.indexOf("readme.txt") === -1);
check("listSourceImages excludes .svg", imgs.indexOf("icon.svg") === -1);
check("listSourceImages count", imgs.length === 2);

// --- needsResize ---
var srcPath = path.join(tmpDir, "photo.jpg");
var thumbPath = path.join(tmpDir, "photo-thumb.jpg");
check("needsResize: thumb missing", resize.needsResize(srcPath, thumbPath) === true);

// Create a thumb older than src
fs.writeFileSync(thumbPath, "old thumb");
var past = Date.now() - 100000;
fs.utimesSync(thumbPath, new Date(past), new Date(past));
check("needsResize: thumb older", resize.needsResize(srcPath, thumbPath) === true);

// Create a thumb newer than src
fs.utimesSync(srcPath, new Date(past), new Date(past));
fs.utimesSync(thumbPath, new Date(), new Date());
check("needsResize: thumb newer", resize.needsResize(srcPath, thumbPath) === false);

// Cleanup
try { fs.rmSync(tmpDir, { recursive: true }); } catch (e) {}

console.log("resize-test: " + pass + " passed, " + fail + " failed");
process.exit(fail > 0 ? 1 : 0);
