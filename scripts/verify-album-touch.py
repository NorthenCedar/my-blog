"""相册真实触摸验收：只运行本机静态产物与独立 Chrome，不触碰用户浏览器。"""
import http.server
import sys
import threading
from tempfile import TemporaryDirectory, mkdtemp

# 复用站内已有的本机 CDP 文本帧连接，不启动账户服务。
exec((__import__('pathlib').Path(__file__).parent / 'verify-visitor-accounts.py').read_text(encoding='utf8').split('\nHERE = ')[0])

ROOT = Path(__file__).resolve().parent.parent
manifest = json.loads((ROOT / 'public/gallery/manifest.json').read_bytes())
albums = [a for a in manifest['albums'] if a['layout'] == 'scatter']
slices = next((a for a in manifest['albums'] if a['layout'] == 'slices'), None)
shots = Path(mkdtemp(prefix='northcedar-album-shots-')) if '--screenshots' in sys.argv else None

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw): super().__init__(*a, directory=str(ROOT / 'dist'), **kw)
    def log_message(self, *a): pass
    def do_GET(self):
        if self.path.startswith('/api/'):
            self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers()
            self.wfile.write(b'{"user":null,"comments":[],"replies":[],"counts":{},"likes":{}}')
        else: super().do_GET()
    def do_POST(self): self.send_error(405)

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_address[1]}'
results = {}

def check(name, passed, detail=None):
    results[name] = {'passed': bool(passed), 'detail': detail}
    print(('PASS ' if passed else 'FAIL ') + name + ' ' + json.dumps(detail, ensure_ascii=False), flush=True)

# Windows 上 Chrome 子进程可能在主进程退出后短暂持有会话文件。
with TemporaryDirectory(prefix='northcedar-album-chrome-', ignore_cleanup_errors=True) as profile:
    with socket.socket() as sock: sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
    proc = subprocess.Popen([r'C:/Program Files/Google/Chrome/Application/chrome.exe', '--headless=new', '--disable-gpu', '--no-proxy-server', '--no-first-run', '--no-default-browser-check', f'--remote-debugging-port={port}', '--remote-allow-origins=*', f'--user-data-dir={profile}', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=0x08000000)
    print('独立 Chrome PID：' + str(proc.pid), flush=True)
    try:
        for _ in range(100):
            try: tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json')); break
            except Exception: time.sleep(.1)
        else: raise RuntimeError('独立 Chrome 启动超时')
        ws = LocalWebSocket(next(t['webSocketDebuggerUrl'] for t in tabs if t['type'] == 'page'))
        serial = 0
        def cdp(method, params=None):
            global serial
            serial += 1; ws.send(json.dumps(dict(id=serial, method=method, params=params or {})))
            while True:
                msg = json.loads(ws.recv())
                if msg.get('id') == serial:
                    if 'error' in msg: raise RuntimeError(str(msg['error']))
                    return msg.get('result', {})
        def js(code):
            r = cdp('Runtime.evaluate', dict(expression=code, returnByValue=True, awaitPromise=True))
            if r.get('exceptionDetails'): raise RuntimeError(str(r['exceptionDetails']))
            return r.get('result', {}).get('value')
        def wait(code, seconds=10):
            end = time.time() + seconds
            while time.time() < end:
                if js('Boolean(' + code + ')'): return
                time.sleep(.1)
            raise RuntimeError('等待超时：' + code)
        def goto(album):
            path = '/gallery/' + urllib.parse.quote(album['id']) + '/'
            cdp('Page.navigate', {'url': base + path})
            wait('location.pathname === ' + json.dumps(path))
            wait('document.readyState === "complete" && document.querySelector(".scene-on") && document.querySelector("[data-scene-world]").style.getPropertyValue("--scene-scale") !== ""' if album['layout'] == 'scatter' else 'document.readyState === "complete" && document.querySelector(".scene-on figure[aria-hidden]")')
            time.sleep(.3)
        def touch(kind, x=0, y=0):
            cdp('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [] if kind in ['touchEnd', 'touchCancel'] else [{'x': x, 'y': y, 'id': 1}]})
        def tap(x, y):
            touch('touchStart', x, y); time.sleep(.05); touch('touchEnd'); time.sleep(.1)
        def tap_element(selector):
            point = js('(()=>{const r=document.querySelector(' + json.dumps(selector) + ').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
            tap(point['x'], point['y'])
        def reset():
            tap_element('[data-scene-home]')
            # 回中本身有缓动，下一次拖动要从实际归零的相机开始。
            wait('(() => {const s=document.querySelector("[data-scene-world]").style;const x=s.getPropertyValue("--scene-pan-x"),y=s.getPropertyValue("--scene-pan-y");return !x||Math.abs(parseFloat(x))<.1&&Math.abs(parseFloat(y))<.1})()')
            js('window.__touchTrace=[]')
        def pan():
            return js('(()=>{const s=document.querySelector("[data-scene-world]").style;return {x:parseFloat(s.getPropertyValue("--scene-pan-x")),y:parseFloat(s.getPropertyValue("--scene-pan-y")),dragging:document.querySelector("[data-scene-viewport]").classList.contains("dragging"),scroll:scrollY,lightbox:document.querySelector(".lb").classList.contains("on"),touchAction:getComputedStyle(document.querySelector("[data-scene-viewport]")).touchAction}})()')
        def drag(dx, dy, x=195, y=450, cancel=False):
            js('window.__touchTrace=[]')
            touch('touchStart', x, y)
            for n in range(1, 13):
                touch('touchMove', x + dx*n/12, y + dy*n/12); time.sleep(.04)
            held = pan()
            trace = js('window.__touchTrace')
            touch('touchCancel' if cancel else 'touchEnd')
            return held, trace
        def photo_point():
            return js('(()=>{for(let y=150;y<690;y+=20)for(let x=70;x<320;x+=20){const a=document.elementFromPoint(x,y)?.closest("a.frame");if(a)return {x,y,href:a.href}}return null})()')
        def screenshot(name):
            if shots: (shots / (name + '.png')).write_bytes(base64.b64decode(cdp('Page.captureScreenshot', {'format':'png','captureBeyondViewport':False})['data']))
        cdp('Page.enable'); cdp('Network.enable'); cdp('Network.setBlockedURLs', {'urls':['https://*']})
        cdp('Page.addScriptToEvaluateOnNewDocument', {'source': "Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true});window.__touchTrace=[];window.__pointerTrace=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture'])document.addEventListener(type,e=>{const p={type,x:e.clientX,y:e.clientY,buttons:e.buttons,target:e.target.tagName+'.'+e.target.className};window.__pointerTrace.push(p);if(e.pointerType==='touch')window.__touchTrace.push(p)},true);"})
        cdp('Emulation.setDeviceMetricsOverride', dict(width=390, height=844, deviceScaleFactor=2, mobile=True))
        cdp('Emulation.setTouchEmulationEnabled', {'enabled':True,'maxTouchPoints':2})
        for index, album in enumerate(albums):
            goto(album)
            label = '散片' + str(index + 1)
            for dx, dy, direction in [(0,-180,'上拖'),(0,180,'下拖'),(-120,0,'左拖'),(120,0,'右拖'),(100,-160,'斜拖')]:
                reset(); held, trace = drag(dx, dy)
                cancelled = any(e['type']=='pointercancel' for e in trace)
                moves = sum(e['type']=='pointermove' for e in trace)
                check(label + direction, abs(held['x']-dx)<2 and abs(held['y']-dy)<2 and not cancelled and moves>=8 and held['scroll']==0 and not held['lightbox'], {'held':held,'moves':moves,'cancelled':cancelled})
            reset(); screenshot(label + '-初始')
            held, trace = drag(0,-160,cancel=True)
            time.sleep(.4); after = pan()
            check(label + '取消后停止且不误开灯箱', abs(held['y']+160)<2 and abs(after['x']-held['x'])<.1 and abs(after['y']-held['y'])<.1 and not after['dragging'] and not after['lightbox'] and any(e['type']=='pointercancel' for e in trace + js('window.__touchTrace')), {'held':held,'after':after})
            reset(); p = photo_point()
            check(label + '初始视野有可点照片', p is not None, p)
            if p:
                held, trace = drag(65,-90,x=p['x'],y=p['y'])
                time.sleep(.35)
                check(label + '从照片拖动不误开灯箱', abs(held['x']-65)<2 and abs(held['y']+90)<2 and not pan()['lightbox'], {'held':held,'trace':trace})
                reset(); p = photo_point(); before = pan(); tap(p['x'], p['y'])
                wait('document.querySelector(".lb.on") && document.getElementById("lbImg").naturalWidth>0')
                check(label + '轻触照片打开正确大图', js('document.getElementById("lbImg").src')==p['href'])
                screenshot(label + '-灯箱')
                tap_element('#lbClose'); wait('!document.querySelector(".lb.on")')
                after = pan()
                check(label + '关闭灯箱保持相机', before['x']==after['x'] and before['y']==after['y'], after)
            tap_element('[data-scene-toggle]'); wait('!document.querySelector(".scene-on")')
            js('window.scrollTo(0,0)'); drag(0,-280,x=30,y=650); time.sleep(.4)
            check(label + '查看全部恢复页面滚动', js('scrollY>40 && getComputedStyle(document.body).overflowY!=="hidden"'), js('({scroll:scrollY,bodyOverflow:getComputedStyle(document.body).overflowY})'))
            screenshot(label + '-全部')
            js('window.scrollTo(0,0)'); time.sleep(.1); tap_element('[data-scene-toggle]'); wait('document.querySelector(".scene-on")')
            reset(); held,_ = drag(0,-120)
            check(label + '返回展览仍可上拖', abs(held['y']+120)<2, held)
            screenshot(label + '-上拖')
        if slices:
            goto(slices)
            initial = js('document.querySelector(".wf figure").style.getPropertyValue("--scene-x")')
            held, trace = drag(0,-180)
            check('切片保留纵向原生手势', js('document.querySelector(".wf figure").style.getPropertyValue("--scene-x")')==initial and 'pan-y' in held['touchAction'] and any(e['type']=='pointercancel' for e in trace), {'touchAction':held['touchAction'],'trace':trace})
            reset(); drag(-150,0); time.sleep(.6)
            check('切片横拖切换照片', js('parseFloat(document.querySelector(".wf figure").style.getPropertyValue("--scene-x"))<0'), js('document.querySelector("[data-scene-status]").textContent'))
            screenshot('切片-横拖')
        else:
            print('当前没有使用悬浮切片的已发布相册，跳过切片触摸检查。', flush=True)
        cdp('Emulation.setDeviceMetricsOverride', dict(width=1280,height=900,deviceScaleFactor=1,mobile=False))
        cdp('Emulation.setTouchEmulationEnabled', {'enabled':False})
        goto(albums[0])
        js('window.__pointerTrace=[]')
        cdp('Input.dispatchMouseEvent', {'type':'mouseMoved','x':640,'y':440})
        cdp('Input.dispatchMouseEvent', {'type':'mousePressed','x':640,'y':440,'button':'left','clickCount':1})
        for n in range(1,13):
            cdp('Input.dispatchMouseEvent', {'type':'mouseMoved','x':640+120*n/12,'y':440-150*n/12,'button':'left','buttons':1}); time.sleep(.03)
        held = pan()
        cdp('Input.dispatchMouseEvent', {'type':'mouseReleased','x':760,'y':290,'button':'left','clickCount':1})
        check('桌面仍可四向拖动', abs(held['x']-120)<2 and abs(held['y']+150)<2, {'held':held,'trace':js('window.__pointerTrace')})
        screenshot('桌面-斜拖')
        # 最后检验原生页面缩放，避免已放大的视觉视口改变后续手势坐标。
        cdp('Emulation.setDeviceMetricsOverride', dict(width=390,height=844,deviceScaleFactor=2,mobile=True))
        cdp('Emulation.setTouchEmulationEnabled', {'enabled':True,'maxTouchPoints':2})
        goto(albums[0])
        before_scale = js('visualViewport.scale')
        cdp('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[{'x':155,'y':450,'id':1},{'x':235,'y':450,'id':2}]})
        for n in range(1,13):
            cdp('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[{'x':155-n*5,'y':450,'id':1},{'x':235+n*5,'y':450,'id':2}]})
            time.sleep(.04)
        touch('touchEnd'); time.sleep(.2)
        after_scale = js('visualViewport.scale')
        check('散片保留浏览器双指缩放', after_scale > before_scale * 1.2, {'before':before_scale,'after':after_scale})
    finally:
        if 'ws' in globals(): ws.sock.close()
        proc.terminate(); proc.wait(timeout=15)
        server.shutdown()
        print('已结束独立 Chrome PID：' + str(proc.pid), flush=True)

if shots: print('截图目录：' + str(shots), flush=True)
print(json.dumps({'checks':len(results),'passed':sum(v['passed'] for v in results.values()),'failures':{k:v for k,v in results.items() if not v['passed']}}, ensure_ascii=False, indent=2))
raise SystemExit(0 if results and all(v['passed'] for v in results.values()) else 1)
