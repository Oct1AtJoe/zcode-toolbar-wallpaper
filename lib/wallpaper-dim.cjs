// Real-time wallpaper dim overlay toggle.
// Creates/updates/removes a full-viewport black overlay <div> above the
// wallpaper but below the UI (z-index:-1). Darkens the wallpaper uniformly
// so text reads clearer, without dimming the UI itself.

var DIM_EL_ID = "zcode-user-wallpaper-dim";

// Pure: build the evaluate expression that sets the dim overlay alpha.
// Returns JSON {found:bool, alpha:number|null}. alpha<=0 removes the overlay.
function buildDimExpression(dimElId, alpha) {
  var a = Math.max(0, Math.min(1, Number(alpha) || 0));
  if (a <= 0) {
    return "(function(){var d=document.getElementById(" + JSON.stringify(dimElId) +
      ");if(d){d.remove();}return JSON.stringify({found:false,alpha:null});})()";
  }
  return "(function(){var d=document.getElementById(" + JSON.stringify(dimElId) +
    ");if(!d){d=document.createElement('div');d.id=" + JSON.stringify(dimElId) +
    ";d.style.cssText='position:fixed;top:0;left:0;width:100vw;height:100vh;" +
    "z-index:-1;pointer-events:none;';document.documentElement.appendChild(d);}" +
    "d.style.background='rgba(0,0,0," + a + ")';" +
    "return JSON.stringify({found:true,alpha:" + a + "});})()";
}

// Effectful: iterate all page targets, set the dim overlay alpha.
// Returns { affected, total, lastAlpha }.
async function setWallpaperDim(alpha) {
  var cdp = require("./cdp.cjs");
  var targets = await cdp.listTargets();
  var affected = 0;
  var lastAlpha = null;
  for (var i = 0; i < targets.length; i++) {
    var ws;
    try {
      var connected = await cdp.connect(targets[i].webSocketDebuggerUrl);
      ws = connected.ws;
      var call = connected.call;
      var r = await call("Runtime.evaluate", {
        expression: buildDimExpression(DIM_EL_ID, alpha),
        returnByValue: true,
      });
      var obj = JSON.parse(r.result.value);
      if (obj.found) { affected++; lastAlpha = obj.alpha; }
    } catch (e) {
      // per-target fail, continue
    } finally {
      if (ws) { try { ws.close(); } catch (e) {} }
    }
  }
  return { affected: affected, total: targets.length, lastAlpha: lastAlpha };
}

module.exports = { buildDimExpression: buildDimExpression, setWallpaperDim: setWallpaperDim, DIM_EL_ID: DIM_EL_ID };
