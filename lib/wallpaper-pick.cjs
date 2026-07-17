// Toolbar "更换壁纸" button injector.
// The button sits in ZCode's top-left toolbar (right after the forward button).
// Clicking it POSTs /api/action {action:"pickWallpaper"} to the server,
// which picks the newest image in wallpapers/, resizes it, and re-injects it.
// The button is a TRIGGER only - all action logic lives in server.cjs + inject.cjs.

var PICK_BTN_ID = "zcode-wp-pickbtn";
var PICK_ACTION = "pickWallpaper";
var DEFAULT_PORT = 18923;
var DEFAULT_DIM = 60;
var WIN_VAR = "zcodeWpDimValue";

// Pure: build the JS expression that injects the pick button + dim slider.
// Idempotent: if the container already exists, skip re-creation.
// Slider value priority (first wins):
//   1. window.zcodeWpDimValue - last slider position in this session (drag updates it)
//   2. currentDim param - server-provided persisted dim (survives restart)
//   3. DEFAULT_DIM (60)
//
// IMPORTANT: fetch URL must be ABSOLUTE (file:// origin cannot do relative fetches).
function buildPickButtonExpression(btnId, action, port, currentDim) {
  btnId = btnId || PICK_BTN_ID;
  action = action || PICK_ACTION;
  port = port || DEFAULT_PORT;
  var actionUrl = "http://127.0.0.1:" + port + "/api/action";
  var containerId = btnId + "-wrap";
  var serverDim = (currentDim != null && isFinite(Number(currentDim)))
    ? String(Math.max(0, Math.min(100, Number(currentDim))))
    : String(DEFAULT_DIM);
  return [
    "(function(){",
    "  var old=document.getElementById(" + JSON.stringify(containerId) + ");",
    "  if(old)return 'ok';",
    "  var fwd=document.querySelectorAll('[aria-label=\"前进\"]');",
    "  var topLeft=null;",
    "  for(var i=0;i<fwd.length;i++){",
    "    var r=fwd[i].getBoundingClientRect();",
    "    if(r.x<200&&r.y<200){topLeft=fwd[i];break;}",
    "  }",
    "  if(!topLeft)return 'no-anchor';",
    // initDim: window var (session) > server-provided persisted dim > default
    // Snap to nearest multiple of 5 so it aligns with slider step.
    "  var initDim=window[" + JSON.stringify(WIN_VAR) + "]!=null?window[" + JSON.stringify(WIN_VAR) + "]:" + JSON.stringify(serverDim) + ";",
    "  initDim=String(Math.round(Number(initDim)/5)*5);",
    // Container: flex row, vertically centered
    "  var wrap=document.createElement('div');",
    "  wrap.id=" + JSON.stringify(containerId) + ";",
    "  wrap.style.cssText='display:inline-flex;align-items:center;gap:4px;vertical-align:middle;';",
    // Pick button
    "  var btn=document.createElement('button');",
    "  btn.id=" + JSON.stringify(btnId) + ";",
    "  btn.className=topLeft.className;",
    "  btn.setAttribute('aria-label','更换壁纸');",
    "  btn.setAttribute('data-slot','tooltip-trigger');",
    "  btn.setAttribute('data-variant','ghost');",
    "  btn.setAttribute('data-size','icon-md');",
    "  btn.title='更换壁纸';",
    "  btn.innerHTML='<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"width:16px;height:16px\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><circle cx=\"8.5\" cy=\"8.5\" r=\"1.5\"/><path d=\"M21 15l-5-5L5 21\"/></svg>';",
    // Dim slider
    "  var sliderWrap=document.createElement('div');",
    "  sliderWrap.style.cssText='display:inline-flex;align-items:center;gap:3px;';",
    "  var slider=document.createElement('input');",
    "  slider.type='range';slider.min='0';slider.max='100';slider.step='5';slider.value=initDim;",
    "  slider.style.cssText='width:80px;height:16px;cursor:pointer;accent-color:rgba(255,255,255,0.6);';",
    "  slider.title='遮罩浓度';",
    "  var label=document.createElement('span');",
    "  label.style.cssText='font-size:11px;color:rgba(255,255,255,0.6);min-width:28px;text-align:right;user-select:none;';",
    "  label.textContent=slider.value+'%';",
    // Persist slider value to window var on every change (survives toolbar re-renders)
    "  function onSliderChange(){",
    "    label.textContent=slider.value+'%';",
    "    window[" + JSON.stringify(WIN_VAR) + "]=slider.value;",
    "  }",
    "  slider.addEventListener('input',onSliderChange);",
    "  slider.addEventListener('change',onSliderChange);",
    // stopPropagation prevents ZCode's document-level listeners from swallowing the drag
    "  ['mousedown','pointerdown','touchstart','click'].forEach(function(ev){",
    "    slider.addEventListener(ev,function(e){e.stopPropagation();});",
    "  });",
    "  sliderWrap.appendChild(slider);",
    "  sliderWrap.appendChild(label);",
    // Button click: read slider dim and send with action
    "  btn.addEventListener('click',function(e){",
    "    e.preventDefault();e.stopPropagation();",
    "    var dimVal=parseInt(slider.value,10)||0;",
    "    try{",
    "      fetch(" + JSON.stringify(actionUrl) + ",{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:" + JSON.stringify(action) + ",dim:dimVal})}).catch(function(){});",
    "    }catch(x){}",
    "  });",
    "  wrap.appendChild(btn);",
    "  wrap.appendChild(sliderWrap);",
    "  topLeft.parentNode.insertBefore(wrap,topLeft.nextSibling);",
    "  return 'ok';",
    "})();"
  ].join("\n");
}

// Effectful: iterate all page targets, inject the pick button into each.
// currentDim (0-100) is the persisted dim from .wallpaper.json, used as the
// slider's initial value on first render of the session.
// Returns { affected, total }.
async function injectPickButton(port, currentDim) {
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
        expression: buildPickButtonExpression(PICK_BTN_ID, PICK_ACTION, port, currentDim),
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
  DEFAULT_DIM: DEFAULT_DIM,
};
