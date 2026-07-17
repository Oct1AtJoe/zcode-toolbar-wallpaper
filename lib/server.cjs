// Lightweight HTTP server for the wallpaper picker feature.
// Handles: pickWallpaper action (resize + inject), button injection polling,
// and a simple status endpoint.
var http = require("http");
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var child_process = require("child_process");

var DEFAULT_PORT = 18923;
var DEFAULT_HOST = "127.0.0.1";

function sendJson(res, status, obj) {
  var body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function createServer(opts) {
  opts = opts || {};
  var root = opts.root || path.join(__dirname, "..");
  var startPort = opts.port || DEFAULT_PORT;
  var host = opts.host || DEFAULT_HOST;

  var activeJob = null;
  var jobs = new Map();

  function handle(req, res) {
    // CORS for file:// origin (ZCode main page)
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    var url = req.url.split("?")[0];

    // GET /api/status
    if (req.method === "GET" && url === "/api/status") {
      var state = require("./state.cjs");
      var statePath = path.join(root, ".wallpaper.json");
      var wpState = state.readState(statePath);
      return sendJson(res, 200, { wallpaper: wpState, activeJob: activeJob });
    }

    // GET /api/job/:id
    if (req.method === "GET" && url.indexOf("/api/job/") === 0) {
      var jobId = url.slice("/api/job/".length);
      var job = jobs.get(jobId);
      return job ? sendJson(res, 200, job) : sendJson(res, 404, { error: "not found" });
    }

    // POST /api/action
    if (req.method === "POST" && url === "/api/action") {
      var body = "";
      req.on("data", function (c) { body += c; });
      req.on("end", function () {
        var req2;
        try { req2 = JSON.parse(body); } catch (e) {
          return sendJson(res, 400, { error: "bad JSON" });
        }

        // --- setWallpaperDim ---
        if (req2.action === "setWallpaperDim") {
          var alpha = Number(req2.alpha);
          if (!isFinite(alpha)) return sendJson(res, 400, { error: "alpha must be a number" });
          var wallpaperDim = require("./wallpaper-dim.cjs");
          wallpaperDim.setWallpaperDim(alpha).then(function (r) {
            sendJson(res, 200, { accepted: true, affected: r.affected, total: r.total, dimAlpha: r.lastAlpha });
          }).catch(function (e) {
            sendJson(res, 200, { accepted: false, error: e.message });
          });
          return;
        }

        // --- pickWallpaper ---
        if (req2.action === "pickWallpaper") {
          var inject = require("./inject.cjs");
          var resize = require("./resize.cjs");
          var state = require("./state.cjs");
          var wallpaperStatePath = path.join(root, ".wallpaper.json");
          var srcDir = path.join(root, "wallpapers");
          var thumbDir = path.join(root, "wallpapers-thumb");

          // Pick newest image by birthtime (creation time = when placed in dir)
          var picked = null, pool = [];
          try {
            var list = resize.listSourceImages(srcDir);
            pool = list.map(function (n) {
              try { return { name: n, when: fs.statSync(path.join(srcDir, n)).birthtimeMs }; }
              catch (e) { return { name: n, when: 0 }; }
            }).sort(function (a, b) { return b.when - a.when; });
            if (pool.length) picked = pool[0].name;
          } catch (e) {}
          if (!picked) {
            return sendJson(res, 200, { accepted: false, error: "wallpapers/ is empty" });
          }

          if (activeJob) return sendJson(res, 409, { accepted: false, reason: "busy", activeJob: activeJob });
          var jobId = "j_" + crypto.randomBytes(3).toString("hex");
          activeJob = jobId;
          jobs.set(jobId, { state: "running", startedAt: Date.now() });

          // Step 1: spawn resize
          var resizeChild = child_process.spawn(process.execPath,
            [path.join(root, "lib", "resize.cjs")], { cwd: root });
          var resizeOut = "";
          resizeChild.stdout.on("data", function (c) { resizeOut += c; });
          resizeChild.stderr.on("data", function (c) { resizeOut += c; });
          var resizeTimer = setTimeout(function () { try { resizeChild.kill(); } catch (e) {} }, 30000);

          resizeChild.on("exit", function (rc) {
            clearTimeout(resizeTimer);
            // Step 2: build CSS, spawn inject with ZCODE_WP_CSS bypass
            var base = picked.replace(/\.[^.]+$/, "");
            var thumbPath = path.join(thumbDir, base + ".jpg");
            if (!fs.existsSync(thumbPath)) {
              jobs.set(jobId, { state: "failed", exitCode: rc, output: "Thumbnail not generated: " + thumbPath, finishedAt: Date.now() });
              activeJob = null; return;
            }
            var fileUrl = inject.toFileUrl(thumbPath);
            var baseCss = fs.readFileSync(path.join(root, "lib", "wallpaper.css"), "utf8");
            var css = baseCss + '\nbody { background-image: url("' + fileUrl + '") !important; }\n';
            var os = require("os");
            var tmpCss = path.join(os.tmpdir(), "zcode-pick-" + process.pid + ".css");
            try { fs.writeFileSync(tmpCss, css, "utf8"); } catch (e) {
              jobs.set(jobId, { state: "failed", output: "Write temp CSS failed: " + e.message, finishedAt: Date.now() });
              activeJob = null; return;
            }
            var env = Object.assign({}, process.env, { ZCODE_WP_CSS: tmpCss });
            var injectChild = child_process.spawn(process.execPath,
              [path.join(root, "lib", "inject.cjs")], { cwd: root, env: env });
            var injectOut = "";
            injectChild.stdout.on("data", function (c) { injectOut += c; });
            injectChild.stderr.on("data", function (c) { injectOut += c; });
            var injectTimer = setTimeout(function () { try { injectChild.kill(); } catch (e) {} }, 30000);

            injectChild.on("exit", function (rc2) {
              clearTimeout(injectTimer);
              try { fs.unlinkSync(tmpCss); } catch (e) {}
              if (rc2 === 0) {
                try { state.writeState(wallpaperStatePath, { file: base + ".jpg", setAt: Date.now(), source: "pick" }); } catch (e) {}
              }
              jobs.set(jobId, { state: rc2 === 0 ? "done" : "failed", exitCode: rc2, output: resizeOut.slice(-500) + "\n---inject---\n" + injectOut.slice(-500), finishedAt: Date.now() });
              activeJob = null;
            });
          });
          return sendJson(res, 200, { jobId: jobId, accepted: true, picked: picked });
        }

        // --- injectImage / remove (simple single-spawn actions) ---
        if (req2.action === "injectImage" || req2.action === "remove") {
          if (activeJob) return sendJson(res, 409, { accepted: false, reason: "busy" });
          var jid = "j_" + crypto.randomBytes(3).toString("hex");
          activeJob = jid;
          jobs.set(jid, { state: "running", startedAt: Date.now() });
          var args = req2.action === "remove" ? [path.join(root, "lib", "inject.cjs"), "--remove"] : [path.join(root, "lib", "inject.cjs")];
          var child = child_process.spawn(process.execPath, args, { cwd: root });
          var out = "";
          child.stdout.on("data", function (c) { out += c; });
          child.stderr.on("data", function (c) { out += c; });
          var timer = setTimeout(function () { try { child.kill(); } catch (e) {} }, 30000);
          child.on("exit", function (rc) {
            clearTimeout(timer);
            jobs.set(jid, { state: rc === 0 ? "done" : "failed", exitCode: rc, output: out.slice(-500), finishedAt: Date.now() });
            activeJob = null;
          });
          return sendJson(res, 200, { jobId: jid, accepted: true });
        }

        sendJson(res, 400, { error: "unknown action" });
      });
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  }

  var server = http.createServer(handle);
  var wallpaperPick = require("./wallpaper-pick.cjs");
  var pickBtnTimer = null;

  return new Promise(function (resolve, reject) {
    var tries = 0;
    function tryListen(port) {
      server.once("error", function (err) {
        if (err.code === "EADDRINUSE" && tries < 5) { tries++; tryListen(port + 1); }
        else reject(err);
      });
      server.listen(port, host, function () {
        var boundPort = server.address().port;
        pickBtnTimer = setInterval(function () {
          wallpaperPick.injectPickButton(boundPort).catch(function () {});
        }, 3000);
        console.log("[server] Listening on http://" + host + ":" + boundPort);
        console.log("[server] Toolbar button polling every 3s");
        resolve({
          server: server,
          port: boundPort,
          host: host,
          close: function () {
            if (pickBtnTimer) clearInterval(pickBtnTimer);
            server.close();
          },
        });
      });
    }
    tryListen(startPort);
  });
}

module.exports = { createServer: createServer, DEFAULT_PORT: DEFAULT_PORT };

if (require.main === module) {
  createServer().catch(function (e) {
    console.error("[server] FAILED:", e.message);
    process.exit(1);
  });
}
