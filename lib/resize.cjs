// Resize wallpaper source images into thumbnails that Electron can render.
// Camera originals (30+ MB) are too big for background-image; this scales
// them to <=2560px long edge, JPEG quality 85, output to wallpapers-thumb/.
// Incremental: skips images already resized (mtime check).

const fs = require("fs");
const path = require("path");

const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp"]; // raster only; no .gif/.svg
const MAX_WIDTH = 2560;
const JPEG_QUALITY = 85;

// List raster image filenames in dir. Returns [] if dir missing/empty.
function listSourceImages(dir) {
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

// True if src needs (re)resizing: thumb missing, or thumb older than src.
function needsResize(srcPath, thumbPath) {
  try {
    var srcStat = fs.statSync(srcPath);
    var thumbStat = fs.statSync(thumbPath);
    return thumbStat.mtimeMs < srcStat.mtimeMs;
  } catch (e) {
    return true; // thumb missing or stat failed -> resize
  }
}

// sharp is lazy-required so listSourceImages/needsResize can be tested without it.
async function resizeOne(srcPath, thumbPath) {
  var sharp = require("sharp");
  await sharp(srcPath)
    .resize({
      width: MAX_WIDTH,
      height: MAX_WIDTH,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY })
    .toFile(thumbPath);
}

async function main() {
  var srcDir = path.join(__dirname, "..", "wallpapers");
  var thumbDir = path.join(__dirname, "..", "wallpapers-thumb");

  console.log("[resize] Scanning wallpapers/ ...");
  var images = listSourceImages(srcDir);
  if (images.length === 0) {
    console.log("[resize] wallpapers/ is empty. Put images there first.");
    process.exit(0);
  }
  console.log("[resize] Found " + images.length + " image(s)");

  fs.mkdirSync(thumbDir, { recursive: true });

  var added = 0, skipped = 0, failed = 0;
  for (var i = 0; i < images.length; i++) {
    var name = images[i];
    var srcPath = path.join(srcDir, name);
    var base = name.replace(/\.[^.]+$/, "");
    var thumbPath = path.join(thumbDir, base + ".jpg");
    if (!needsResize(srcPath, thumbPath)) { skipped++; continue; }
    try {
      await resizeOne(srcPath, thumbPath);
      var kb = Math.round(fs.statSync(thumbPath).size / 1024);
      console.log("[resize]   " + base + ".jpg  (" + kb + " KB)");
      added++;
    } catch (e) {
      console.error("[resize]   " + name + " FAILED: " + e.message);
      failed++;
    }
  }

  console.log("[resize] Done: added " + added + " / skipped " + skipped + " / failed " + failed);
  process.exit(failed > 0 ? 1 : 0);
}

module.exports = { listSourceImages: listSourceImages, needsResize: needsResize, MAX_WIDTH: MAX_WIDTH, JPEG_QUALITY: JPEG_QUALITY };

if (require.main === module) {
  main().catch(function (e) {
    console.error("[resize] FAILED:", e.message);
    process.exit(1);
  });
}
