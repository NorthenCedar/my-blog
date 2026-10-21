"""本地浏览器验收：说说大图、手机显影拖动；独立临时 Chrome 资料随测试清除。"""
import http.server, threading
from tempfile import TemporaryDirectory

# 共用现有的本机 CDP 文本帧连接，不运行账户测试和真实接口写入。
exec((__import__('pathlib').Path(__file__).parent / 'verify-visitor-accounts.py').read_text(encoding='utf8').split('\nHERE = ')[0])

ROOT = Path(__file__).resolve().parent.parent
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
    print(('PASS ' if passed else 'FAIL ') + name, flush=True)

with TemporaryDirectory(prefix='northcedar-media-') as profile:
    with socket.socket() as sock: sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
    proc = subprocess.Popen([r'C:/Program Files/Google/Chrome/Application/chrome.exe', '--headless=new', '--disable-gpu', '--no-proxy-server', '--no-first-run', '--no-default-browser-check', f'--remote-debugging-port={port}', '--remote-allow-origins=*', f'--user-data-dir={profile}', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=0x08000000)
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
        def goto(path):
            cdp('Page.navigate', {'url': base + path}); wait('location.pathname === ' + json.dumps(path) + ' && document.readyState === "complete"'); time.sleep(.7)
        def key(name, code=None):
            for kind in ['keyDown', 'keyUp']: cdp('Input.dispatchKeyEvent', {'type': kind, 'key': name, 'code': code or name, 'windowsVirtualKeyCode': 27 if name == 'Escape' else 0})
        def touch(kind, x=0, y=0):
            cdp('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [] if kind in ['touchEnd', 'touchCancel'] else [{'x': x, 'y': y, 'id': 1}]})
        cdp('Page.enable'); cdp('Network.enable'); cdp('Network.setBlockedURLs', {'urls': ['https://*']})
        cdp('Page.addScriptToEvaluateOnNewDocument', {'source': "Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true});window.__touchTrace=[];for(const t of ['pointerdown','pointermove','pointerup','pointercancel'])document.addEventListener(t,e=>{if(e.pointerType==='touch')window.__touchTrace.push({type:t,x:e.clientX,y:e.clientY})},true);"})
        for mobile in [False, True]:
            cdp('Emulation.setDeviceMetricsOverride', dict(width=390 if mobile else 1280, height=844 if mobile else 900, deviceScaleFactor=1, mobile=mobile))
            cdp('Emulation.setTouchEmulationEnabled', {'enabled': mobile})
            goto('/talks/')
            js('document.documentElement.classList.toggle("dark", ' + str(mobile).lower() + ')')
            label = '手机' if mobile else '桌面'
            count = js('document.querySelectorAll(".shots img").length')
            links = js('document.querySelectorAll(".shots a[data-talk-image]").length')
            check(label + '说说每张图片可放大', count > 0 and links == count, {'images': count, 'links': links})
            if links:
                js('document.querySelector("[data-talk-image]").focus();document.querySelector("[data-talk-image]").click()')
                wait('document.querySelector(".talk-image-dialog").open && document.querySelector(".talk-image-dialog img").naturalWidth > 0')
                info = js('(()=>{const d=document.querySelector(".talk-image-dialog"),i=d.querySelector("img");return {width:i.naturalWidth,caption:d.querySelector("figcaption").textContent,alt:i.alt,modal:d.matches(":modal"),locked:getComputedStyle(document.documentElement).overflowY==="hidden",overflow:document.documentElement.scrollWidth>innerWidth}})()')
                check(label + '大图与说明可见且不横向溢出', info['width'] > 0 and info['alt'] == info['caption'] and info['modal'] and info['locked'] and not info['overflow'], info)
                if '--screenshots' in __import__('sys').argv:
                    shot = cdp('Page.captureScreenshot', {'format': 'png'})['data']
                    (ROOT.parent / 'work' / ('_tmp-media-' + ('mobile-dark' if mobile else 'desktop-light') + '.png')).write_bytes(__import__('base64').b64decode(shot))
                js('document.querySelector("main a").focus()')
                check(label + '大图隔离背景焦点', js('document.querySelector(".talk-image-dialog").contains(document.activeElement)'))
                if mobile: js('document.querySelector("[data-talk-image-close]").click()')
                else: key('Escape')
                wait('!document.querySelector(".talk-image-dialog").open && document.body.style.overflow !== "hidden"')
                check(label + '关闭恢复图片焦点与滚动', js('document.activeElement===document.querySelector("[data-talk-image]") && getComputedStyle(document.documentElement).overflowY!=="hidden"'))
                js('document.querySelector("[data-talk-image]").click()')
                wait('document.querySelector(".talk-image-dialog").open && document.querySelector(".talk-image-dialog img").naturalWidth > 0')
                check(label + '重复打开同张图片', js('document.querySelector(".talk-image-dialog img").naturalWidth>0'))
                js('(()=>{const d=document.querySelector(".talk-image-dialog"),a=document.querySelector("[data-talk-image]");d.close();a.click()})()')
                wait('document.querySelector(".talk-image-dialog").open && document.querySelector(".talk-image-dialog img").naturalWidth > 0')
                js('document.querySelector("[data-talk-image-close]").click()')
                wait('!document.querySelector(".talk-image-dialog").open && document.body.style.overflow !== "hidden"')
                check(label + '快速关闭重开不遗留滚动锁', js('getComputedStyle(document.documentElement).overflowY !== "hidden"'))
                js('document.querySelector("[data-talk-image]").click()')
                wait('document.querySelector(".talk-image-dialog").open')
                cdp('Input.dispatchMouseEvent', {'type': 'mousePressed', 'x': 1, 'y': 1, 'button': 'left', 'clickCount': 1})
                cdp('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'x': 1, 'y': 1, 'button': 'left', 'clickCount': 1})
                wait('!document.querySelector(".talk-image-dialog").open && document.body.style.overflow !== "hidden"')
                check(label + '点击遮罩关闭大图', True)
                for index in range(links):
                    js('document.querySelectorAll("[data-talk-image]")[' + str(index) + '].click()')
                    wait('document.querySelector(".talk-image-dialog[open] img").naturalWidth > 0')
                    check(label + '配图对应正确大图 ' + str(index + 1), js('(()=>{const a=document.querySelectorAll("[data-talk-image]")[' + str(index) + '],d=document.getElementById(a.dataset.talkImage);return d.open&&d.querySelector("img").alt===a.querySelector("img").alt&&d.querySelector("img").src===a.href})()'))
                    js('document.querySelector(".talk-image-dialog[open] [data-talk-image-close]").click()')
        cdp('Emulation.setDeviceMetricsOverride', dict(width=390, height=844, deviceScaleFactor=1, mobile=True))
        cdp('Emulation.setTouchEmulationEnabled', {'enabled': True})
        goto('/gallery/')
        wait('document.querySelector("[data-bath]") && !document.querySelector("[data-bath]").hidden')
        rect = js('(()=>{const r=document.querySelector("[data-bath]").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()')
        x, y = rect['x'] + rect['w'] * .22, rect['y'] + rect['h'] * .6
        touch('touchStart', x, y)
        for n in range(1, 13): touch('touchMove', x + rect['w'] * .56 * n / 12, y - rect['h'] * .15 * n / 12); time.sleep(.05)
        trace = js('window.__touchTrace')
        check('手机连续拖动不被浏览器取消', not any(e['type'] == 'pointercancel' for e in trace) and sum(e['type'] == 'pointermove' for e in trace) >= 8, trace)
        pixels = js('(()=>{const c=document.querySelector("[data-bath-cv]"),a=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<a.length;i+=4)if(a[i]>0)n++;return n})()')
        check('拖动产生实际显影像素', pixels > 100, pixels)
        touch('touchEnd'); time.sleep(5)
        pixels = js('(()=>{const c=document.querySelector("[data-bath-cv]");return c.getContext("2d").getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)})()')
        check('手指抬起后显影褪尽', not pixels)
        js('window.scrollTo(0,0)')
        touch('touchStart', 30, 640)
        for n in range(1, 11): touch('touchMove', 30, 640 - n * 32); time.sleep(.04)
        touch('touchEnd'); time.sleep(.4)
        check('显影板外仍可滑动页面', js('scrollY > 40'), js('scrollY'))
        cdp('Emulation.setEmulatedMedia', {'features': [{'name': 'prefers-reduced-motion', 'value': 'reduce'}]})
        goto('/gallery/'); time.sleep(1)
        check('减动效仍展示静态照片', js('(()=>{const c=document.querySelector("[data-bath-cv]");return c.width>0&&c.getContext("2d").getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)})()'))
    finally:
        if 'ws' in globals(): ws.sock.close()
        proc.terminate(); proc.wait(timeout=15)
        server.shutdown()

print(json.dumps(results, ensure_ascii=False, indent=2))
raise SystemExit(0 if all(v['passed'] for v in results.values()) else 1)
