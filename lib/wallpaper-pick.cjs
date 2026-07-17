// Toolbar "更换壁纸" button injector.
// The button sits in ZCode's top-left toolbar (right after the forward button).
// Clicking it POSTs /api/action {action:"pickWallpaper"} to the server,
// which picks the newest image in wallpapers/, resizes it, and re-injects it.
// The button is a TRIGGER only - all action logic lives in server.cjs + inject.cjs.

var PICK_BTN_ID = "zcode-wp-pickbtn";
var PICK_ACTION = "pickWallpaper";
var DEFAULT_PORT = 18923;

// Pure: build the JS expression that injects the pick button.
// Idempotent: removes any prior button first, so re-running never duplicates it.
//
// IMPORTANT: fetch URL must be ABSOLUTE (file:// origin cannot do relative fetches).
function buildPickButtonExpression(btnId, action, port) {
  btnId = btnId || PICK_BTN_ID;
  action = action || PICK_ACTION;
  port = port || DEFAULT_PORT;
  var actionUrl = "http://127.0.0.1:" + port + "/api/action";
  return [
    "(function(){",
    "  var old=document.getElementById(" + JSON.stringify(btnId) + ");",
    "  if(old){old.remove();}",
    "  var fwd=document.querySelectorAll('[aria-label=\"前进\"]');",
    "  var topLeft=null;",
    "  for(var i=0;i<fwd.length;i++){",
    "    var r=fwd[i].getBoundingClientRect();",
    "    if(r.x<200&&r.y<200){topLeft=fwd[i];break;}",
    "  }",
    "  if(!topLeft)return 'no-anchor';",
    "  var btn=document.createElement('button');",
    "  btn.id=" + JSON.stringify(btnId) + ";",
    "  btn.className=topLeft.className;",
    "  btn.setAttribute('aria-label','更换壁纸');",
    "  btn.setAttribute('data-slot','tooltip-trigger');",
    "  btn.setAttribute('data-variant','ghost');",
    "  btn.setAttribute('data-size','icon-md');",
    "  btn.title='更换壁纸';",
    "  btn.innerHTML='<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"width:16px;height:16px\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><circle cx=\"8.5\" cy=\"8.5\" r=\"1.5\"/><path d=\"M21 15l-5-5L5 21\"/></svg>';",
    "  btn.addEventListener('click',function(e){",
    "    e.preventDefault();e.stopPropagation();",
    "    try{",
    "      fetch(" + JSON.stringify(actionUrl) + ",{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:" + JSON.stringify(action) + "})}).catch(function(){});",
    "    }catch(x){}",
    "  });",
    "  topLeft.parentNode.insertBefore(btn,topLeft.nextSibling);",
    "  return 'ok';",
    "})();"
  ].join("\n");
}

// Effectful: iterate all page targets, inject the pick button into each.
// Returns { affected, total }.
async function injectPickButton(port) {
  var cdp = require("./cdp.cjs");
  var targets = await cdp.listTargets();
  var affected = 0;
  for (var i = 0; i < targets.length; i++) {
    var ws;
    try {
      var connected = await cdp.connect(targets[i].webSocketDebuggerUrl);
      ws = connected.ws;
      var call = connected.call;
      var r = await call("Runtime.evaluate", {
        expression: buildPickButtonExpression(PICK_BTN_ID, PICK_ACTION, port),
        returnByValue: true,
      });
      if (r && r.result && r.result.value === "ok") affected++;
    } catch (e) {
      // per-target fail, continue
    } finally {
      if (ws) { try { ws.close(); } catch (e) {} }
    }
  }
  return { affected: affected, total: targets.length };
}

module.exports = {
  buildPickButtonExpression: buildPickButtonExpression,
  injectPickButton: injectPickButton,
  PICK_BTN_ID: PICK_BTN_ID,
  PICK_ACTION: PICK_ACTION,
  DEFAULT_PORT: DEFAULT_PORT,
};
