"""本地交互回归：独立 Chrome、合成接口数据，不读取真实会话或写入线上。"""
from pathlib import Path
import json,threading,http.server,subprocess,socket,time,urllib.request,urllib.parse,base64,os
OUT=Path(os.environ.get('SITE_UI_EVIDENCE_DIR', Path(__file__).resolve().parents[2] / 'work/site-fixes-20261021/ui/after'))
OUT.mkdir(parents=True,exist_ok=True)
# 只复用 WebSocket 帧客户端，严格截在旧脚本的顶层验收逻辑之前。
harness=(Path(__file__).resolve().parent/'verify-visitor-accounts.py').read_text(encoding='utf8')
exec(harness[:harness.index('\nHERE = ')])
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*a,**k): super().__init__(*a,directory=str(Path(__file__).resolve().parent.parent/'dist'),**k)
 def log_message(self,*a): pass
 def do_GET(self):
  if self.path.startswith('/api/'):
   self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b'{"user":null,"comments":[],"replies":[],"counts":{},"likes":{}}');return
  super().do_GET()
 def do_POST(self): self.send_error(405)
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
BASE=os.environ.get('SITE_UI_BASE_URL',f'http://127.0.0.1:{server.server_address[1]}')
if urllib.parse.urlsplit(BASE).hostname!='127.0.0.1':raise ValueError('只允许本机 fixture 服务')
with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
profile=OUT/'chrome-profile'
proc=subprocess.Popen([r'C:/Program Files/Google/Chrome/Application/chrome.exe','--headless=new','--disable-gpu','--no-proxy-server','--no-first-run','--no-default-browser-check',f'--remote-debugging-port={port}','--remote-allow-origins=*',f'--user-data-dir={profile}','about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=0x08000000)
report={};failures=[]
def check(name,ok,detail=None):
 report[name]={'passed':bool(ok),'detail':detail}
 print(('PASS ' if ok else 'FAIL ')+name,flush=True)
 if not ok:failures.append(name)
try:
 for _ in range(100):
  try:targets=json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json'));break
  except Exception:time.sleep(.1)
 else:raise RuntimeError('独立 Chrome 启动超时')
 ws=LocalWebSocket(next(t['webSocketDebuggerUrl'] for t in targets if t['type']=='page'))
 serial=0
 def cdp(method,params=None):
  global serial
  serial+=1;ws.send(json.dumps(dict(id=serial,method=method,params=params or {})))
  while True:
   obj=json.loads(ws.recv())
   if obj.get('id')==serial:
    if 'error' in obj:raise RuntimeError(str(obj['error']))
    return obj.get('result',{})
 def js(code):
  result=cdp('Runtime.evaluate',dict(expression=code,returnByValue=True,awaitPromise=True))
  if result.get('exceptionDetails'):raise RuntimeError(str(result['exceptionDetails']))
  return result.get('result',{}).get('value')
 def wait(code,secs=10):
  end=time.time()+secs
  while time.time()<end:
   if js('Boolean('+code+')'):return
   time.sleep(.1)
  raise RuntimeError('等待超时：'+code)
 def goto(path):
  cdp('Page.navigate',{'url':BASE+path});wait('document.readyState==="complete"&&location.pathname==='+json.dumps(urllib.parse.urlsplit(path).path));time.sleep(.5)
 def key(key,code=None,vk=None,mod=0):
  p={'key':key,'code':code or key,'modifiers':mod}
  if vk:p['windowsVirtualKeyCode']=vk;p['nativeVirtualKeyCode']=vk
  cdp('Input.dispatchKeyEvent',{'type':'keyDown',**p});cdp('Input.dispatchKeyEvent',{'type':'keyUp',**p})
 def shot(name):
  (OUT/name).write_bytes(base64.b64decode(cdp('Page.captureScreenshot',dict(format='png',captureBeyondViewport=False))['data']))
 cdp('Page.enable');cdp('Network.enable');cdp('Network.setBlockedURLs',{'urls':['https://*']})
 cdp('Emulation.setDeviceMetricsOverride',dict(width=390,height=844,deviceScaleFactor=1,mobile=False))
 # 仅替换接口读取，所有页面逻辑照常执行；本地静态服务拒绝任何写入。
 cdp('Page.addScriptToEvaluateOnNewDocument',{'source':'''const oldFetch=window.fetch.bind(window);Object.defineProperty(navigator,'gpu',{value:location.search.includes('gpu-fail')?{requestAdapter:async()=>null}:undefined,configurable:true});window.__reads=0;window.__failRead=false;window.__delayRead=false;window.fetch=(input,init)=>{const url=new URL(typeof input==='string'?input:input.url,location.href);if(url.pathname==='/api/comments'&&(!init||!init.method||init.method==='GET')){window.__reads++;if(window.__failRead)return Promise.resolve(new Response('{}',{status:503}));if(window.__delayRead)return new Promise(resolve=>window.__releaseRead=()=>resolve(new Response(JSON.stringify({comments:[{id:900,name:'fixture',body:'fixture',createdAt:'2026-10-21T00:00:00Z'}],replies:[]}),{headers:{'Content-Type':'application/json'}})));return Promise.resolve(new Response(JSON.stringify({comments:[{id:900,name:'fixture',body:'fixture',createdAt:'2026-10-21T00:00:00Z'}],replies:[],counts:{}}),{headers:{'Content-Type':'application/json'}}));}return oldFetch(input,init);};'''})

 for suffix in ['', '?gpu-fail']:
  goto('/about/'+suffix);wait('document.querySelector(".tt-fallback")')
  switches=js('[...document.querySelectorAll("[data-theme-toggle][role=switch],[data-theme-toggle] [role=switch]")].map(e=>({tab:e.tabIndex,checked:e.getAttribute("aria-checked")}))')
  check('fallback-single-switch'+suffix,len(switches)==1,switches)
  js('document.querySelector(".tt-fallback").focus()');before=js('document.documentElement.classList.contains("dark")');key(' ','Space',32)
  check('fallback-keyboard-toggle'+suffix,js('document.documentElement.classList.contains("dark")')!=before)
  js('localStorage.setItem("theme","dark");document.documentElement.classList.add("dark");document.dispatchEvent(new CustomEvent("themechange",{detail:"dark"}))')
  check('fallback-external-state'+suffix,js('[...document.querySelectorAll("[data-theme-toggle][role=switch],[data-theme-toggle] [role=switch]")].every(e=>e.getAttribute("aria-checked")==="true")'))
 goto('/about/')
 for cycle in range(2):
  js('document.getElementById("nav-toggle").focus()');key(' ','Space',32);wait('document.querySelector(".navshell").open&&document.querySelector(".navtog").checked')
  check('drawer-focus-and-background-'+str(cycle),js('document.querySelector("main a[href]").focus();document.querySelector(".navshell").contains(document.activeElement)'))
  dialogs=[node for node in cdp('Accessibility.getFullAXTree').get('nodes',[]) if not node.get('ignored') and node.get('role',{}).get('value')=='dialog']
  check('drawer-dialog-name-'+str(cycle),len(dialogs)==1 and dialogs[0].get('name',{}).get('value')=='导航菜单')
  close=js('!!document.querySelector("[data-nav-close]")')
  check('drawer-close-control-'+str(cycle),close)
  if close:
   js('document.querySelector("[data-nav-close]").focus()');key('Tab','Tab',9)
   check('drawer-tab-enters-links-'+str(cycle),js('document.activeElement===document.querySelector(".navpanel a")'))
   key('Tab','Tab',9,mod=8)
   check('drawer-shift-tab-returns-close-'+str(cycle),js('document.activeElement===document.querySelector("[data-nav-close]")'))
   js('document.querySelector(".navpanel a:last-child").focus()')
   key('Tab','Tab',9)
   # 浏览器允许 Tab 到自身地址栏；正文仍不能获得焦点。
   check('drawer-edge-tab-excludes-page-'+str(cycle),js('document.activeElement===document.body||document.querySelector(".navshell").contains(document.activeElement)'),js('({tag:document.activeElement.tagName,documentFocused:document.hasFocus()})'))
   cdp('Page.bringToFront');js('document.querySelector("[data-nav-close]").focus()')
  if cycle==0:shot('menu-mobile-dark.png')
  key('Escape','Escape',27)
  wait('!document.querySelector(".navshell").open&&!document.getElementById("nav-toggle").checked')
  check('drawer-escape-and-focus-'+str(cycle),js('!document.getElementById("nav-toggle").checked&&!document.querySelector("main").inert&&document.activeElement===document.getElementById("nav-toggle")'))
  if js('document.getElementById("nav-toggle").checked'):js('document.getElementById("nav-toggle").click()')
 js('document.getElementById("nav-toggle").click()')
 if js('!!document.querySelector("[data-nav-close]")'):
  js('document.querySelector("[data-nav-close]").click()')
  check('drawer-close-button-restores-focus',js('!document.getElementById("nav-toggle").checked&&!document.querySelector("main").inert&&document.activeElement===document.getElementById("nav-toggle")'))
  js('document.getElementById("nav-toggle").click();document.querySelector(".navmask").click()')
  check('drawer-mask-restores-background',js('!document.getElementById("nav-toggle").checked&&!document.querySelector("main").inert'))
  js('document.getElementById("nav-toggle").click()')
 cdp('Emulation.setDeviceMetricsOverride',dict(width=1280,height=1000,deviceScaleFactor=1,mobile=False));time.sleep(.2)
 check('drawer-desktop-reset',js('!document.getElementById("nav-toggle").checked&&!document.querySelector("main").inert&&getComputedStyle(document.documentElement).overflow!=="hidden"'))
 cdp('Emulation.setDeviceMetricsOverride',dict(width=390,height=844,deviceScaleFactor=1,mobile=False));time.sleep(.2)
 check('drawer-return-narrow-closed',js('!document.getElementById("nav-toggle").checked'))
 js('document.getElementById("nav-toggle").click();document.querySelector(".navshell").close();document.querySelector(".navshell").showModal()');time.sleep(.1)
 check('drawer-fast-reopen-keeps-open-state',js('document.querySelector(".navshell").open&&document.getElementById("nav-toggle").checked'))
 js('document.querySelector("[data-nav-close]").click()');wait('!document.querySelector(".navshell").open')
 goto('/talks/');wait('document.querySelector("[data-toggle]")')
 js('window.__failRead=true;document.querySelector("[data-toggle]").click()');wait('!document.querySelector(".cbox [data-error]").hidden')
 js('document.querySelector(".cbox textarea").value="draft fixture";window.__failRead=false')
 retry=js('!!document.querySelector("[data-comment-retry]")')
 check('comments-retry-control',retry)
 if retry:js('document.querySelector("[data-comment-retry]").click()')
 else:js('document.querySelector("[data-toggle]").click();document.querySelector("[data-toggle]").click()')
 time.sleep(.3)
 check('comments-retry-restores-list',js('document.querySelectorAll(".cbox [data-list] > li").length===1&&document.querySelector(".cbox [data-error]").hidden'))
 check('comments-draft-preserved',js('document.querySelector(".cbox textarea").value==="draft fixture"'))
 # 首次取列表失败后仍可发表；随后重试不能把刚发表的行再追加一遍。
 goto('/talks/');js('window.__failRead=true;document.querySelector("[data-toggle]").click()')
 wait('!document.querySelector(".cbox [data-error]").hidden')
 js('window.__failRead=false;const readFetch=window.fetch;window.fetch=(input,init)=>init?.method==="POST"?Promise.resolve(new Response(JSON.stringify({comment:{id:900,name:"fixture",body:"fixture",createdAt:"2026-10-21T00:00:00Z"}}),{headers:{"Content-Type":"application/json"}})):readFetch(input,init);document.querySelector(".cbox [name=name]").value="fixture";document.querySelector(".cbox textarea").value="fixture";document.querySelector(".cbox form").requestSubmit()')
 wait('document.querySelectorAll(".cbox [data-list] > li").length===1')
 if js('!!document.querySelector("[data-comment-retry]")'):
  js('document.querySelector("[data-comment-retry]").click()');time.sleep(.3)
  check('comments-retry-keeps-one-published-row',js('document.querySelectorAll(".cbox [data-list] > li").length===1'))
 # 手机隐藏态的零高度不能破坏跨回桌面后的测量与游标。
 cdp('Emulation.setDeviceMetricsOverride',dict(width=390,height=844,deviceScaleFactor=1,mobile=False))
 goto('/archive/')
 cdp('Emulation.setDeviceMetricsOverride',dict(width=1280,height=1000,deviceScaleFactor=1,mobile=False));time.sleep(.2)
 js('window.scrollTo(0,document.documentElement.scrollHeight)');time.sleep(1)
 tape=js(r'({height:document.querySelector("[data-tape-track]").clientHeight,y:Number(/translateY\(([-.\d]+)px\)/.exec(document.querySelector("[data-tape-cursor]").style.transform)?.[1])})')
 check('tape-mobile-to-desktop',tape['height']>0 and abs(tape['y']-tape['height'])<3,tape)
 cdp('Emulation.setDeviceMetricsOverride',dict(width=1280,height=600,deviceScaleFactor=1,mobile=False));time.sleep(.2)
 js('window.scrollTo(0,document.documentElement.scrollHeight)');time.sleep(1)
 tape=js(r'({height:document.querySelector("[data-tape-track]").clientHeight,y:Number(/translateY\(([-.\d]+)px\)/.exec(document.querySelector("[data-tape-cursor]").style.transform)?.[1])})')
 check('tape-resize-height',tape['height']>0 and abs(tape['y']-tape['height'])<3,tape)
 cdp('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-motion','value':'reduce'}]})
 goto('/archive/');js('window.scrollTo(0,document.documentElement.scrollHeight)');time.sleep(.2)
 tape=js(r'({height:document.querySelector("[data-tape-track]").clientHeight,y:Number(/translateY\(([-.\d]+)px\)/.exec(document.querySelector("[data-tape-cursor]").style.transform)?.[1])})')
 check('tape-reduced-scroll',tape['height']>0 and abs(tape['y']-tape['height'])<1,tape)
 cdp('Emulation.setEmulatedMedia',{'features':[{'name':'prefers-reduced-motion','value':'no-preference'}]})
 goto('/guestbook/')
 js("window.dispatchEvent(new CustomEvent('voiceprint',{detail:{comments:[{id:1,name:'fixture',body:'fixture',createdAt:'2026-10-20T00:00:00Z'}],replies:[{id:2,parentId:1,name:'reply',body:'fixture',createdAt:'2026-10-20T01:00:00Z'}]}}))")
 wait('document.querySelector("[data-vp-replies] line")')
 check('reply-ticks-visible',js('getComputedStyle(document.querySelector("[data-vp-replies] line")).stroke!=="none"'))
 shot('guestbook-reply-ticks.png')
 cdp('Emulation.setDeviceMetricsOverride',dict(width=390,height=844,deviceScaleFactor=1,mobile=False))
 cdp('Emulation.setScriptExecutionDisabled',{'value':True})
 goto('/about/')
 def native_click(selector):
  p=js('(()=>{const r=document.querySelector('+json.dumps(selector)+').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
  cdp('Input.dispatchMouseEvent',{'type':'mousePressed',**p,'button':'left','clickCount':1})
  cdp('Input.dispatchMouseEvent',{'type':'mouseReleased',**p,'button':'left','clickCount':1})
 native_click('.navbtn');time.sleep(.1)
 check('drawer-no-js-label-opens',js('document.querySelector(".navtog").checked&&getComputedStyle(document.querySelector(".navpanel")).visibility==="visible"'))
 cdp('Input.dispatchMouseEvent',{'type':'mousePressed','x':10,'y':200,'button':'left','clickCount':1})
 cdp('Input.dispatchMouseEvent',{'type':'mouseReleased','x':10,'y':200,'button':'left','clickCount':1})
 check('drawer-no-js-mask-closes',js('!document.querySelector(".navtog").checked'))
 print(json.dumps({'passed':len(report)-len(failures),'failed':failures},ensure_ascii=True),flush=True)
finally:
 (OUT/'runtime-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
 try:cdp('Browser.close')
 except Exception:pass
 proc.terminate();server.shutdown()
if failures:raise SystemExit(1)
