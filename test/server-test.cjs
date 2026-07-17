// Tests for lib/server.cjs (API endpoints)
var pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error("FAIL: " + name); }
}
var http = require("http");
var path = require("path");
var fs = require("fs");

// Use a temp root so .wallpaper.json doesn't pollute the real project
var os = require("os");
var tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "server-test-"));
// Copy wallpaper.css to tmpRoot so pickWallpaper can find it
var libDir = path.join(tmpRoot, "lib");
fs.mkdirSync(libDir, { recursive: true });
fs.copyFileSync(path.join(__dirname, "..", "lib", "wallpaper.css"), path.join(libDir, "wallpaper.css"));
// Copy lib files needed by server
["inject.cjs", "resize.cjs", "state.cjs", "cdp.cjs", "wallpaper-dim.cjs", "wallpaper-pick.cjs"].forEach(function (f) {
  fs.copyFileSync(path.join(__dirname, "..", "lib", f), path.join(libDir, f));
});

var server = require("../lib/server.cjs");
var srv, port;

function get(urlPath) {
  return new Promise(function (resolve, reject) {
    http.get({ host: "127.0.0.1", port: port, path: urlPath }, function (res) {
      var body = "";
      res.on("data", function (c) { body += c; });
      res.on("end", function () {
        try { resolve({ status: res.statusCode, body: JSON.parse(body) }); }
        catch (e) { resolve({ status: res.statusCode, body: body }); }
      });
    }).on("error", reject);
  });
}

function post(urlPath, data) {
  return new Promise(function (resolve, reject) {
    var body = JSON.stringify(data);
    var req = http.request({ host: "127.0.0.1", port: port, path: urlPath, method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, function (res) {
      var rbody = "";
      res.on("data", function (c) { rbody += c; });
      res.on("end", function () {
        try { resolve({ status: res.statusCode, body: JSON.parse(rbody) }); }
        catch (e) { resolve({ status: res.statusCode, body: rbody }); }
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

async function runTests() {
  // Start server on a random port
  srv = await server.createServer({ root: tmpRoot, port: 0 }); // port 0 = random
  port = srv.port;
  check("server started", port > 0);

  // GET /api/status
  var s = await get("/api/status");
  check("status 200", s.status === 200);
  check("status has wallpaper", s.body.hasOwnProperty("wallpaper"));

  // GET /api/job/nonexistent
  var j = await get("/api/job/nonexistent");
  check("job 404", j.status === 404);

  // POST /api/action unknown
  var u = await post("/api/action", { action: "unknown" });
  check("unknown action 400", u.status === 400);

  // POST /api/action pickWallpaper (empty wallpapers/)
  var p = await post("/api/action", { action: "pickWallpaper" });
  check("pickWallpaper empty dir", p.body.accepted === false);

  // POST /api/action remove (inject.cjs --remove, will fail since no ZCode but should not crash)
  var r = await post("/api/action", { action: "remove" });
  check("remove accepted", r.body.accepted === true);
  check("remove has jobId", !!r.body.jobId);

  // Cleanup
  srv.close();
  try { fs.rmSync(tmpRoot, { recursive: true }); } catch (e) {}
}

runTests().then(function () {
  console.log("server-test: " + pass + " passed, " + fail + " failed");
  process.exit(fail > 0 ? 1 : 0);
}).catch(function (e) {
  console.error("server-test FATAL:", e);
  process.exit(1);
});
