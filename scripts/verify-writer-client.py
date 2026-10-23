"""浏览器客户端验收：静态产物 + 明确的 HTTP 夹具，不验证 Cloudflare/D1 权限或部署。

只启动自己的回环 HTTP 服务和独立 Chrome。完整运行时验收仍须原生 workerd 恢复后另做。
"""
import copy, http.server, sys, threading, uuid
from tempfile import TemporaryDirectory

exec((__import__('pathlib').Path(__file__).parent / 'verify-visitor-accounts.py').read_text(encoding='utf8').split('\nHERE = ')[0])

ROOT = Path(__file__).resolve().parent.parent
sys.stdout.reconfigure(encoding='utf8')
OUTPUT = Path(sys.argv[1]).resolve() if len(sys.argv) == 2 else None
if OUTPUT is None or not OUTPUT.is_relative_to(ROOT.parent.resolve()):
    raise SystemExit('请指定 work 下本次独立的结果目录；本脚本不会连接线上或启动 workerd')
if OUTPUT.exists(): raise SystemExit('结果目录已存在，请为本次验收指定新的独立目录，避免混用旧下载和截图')
OUTPUT.mkdir(parents=True)
OWNER, ID = 'b' * 32, 'a' * 32
draft = dict(id=ID, kind='post', key='c'*60, revision=1, base=None, publishedRevision=0,
             value=dict(fields=dict(title='客户端验收文章', date='2026-10-23', summary='简介', tags=['随笔'], source='https://example.invalid/'+'a'*300), body='初始正文', assets=[]))
drafts = {ID: draft}
requests = []
image_bytes = base64.b64decode('UklGRmoAAABXRUJQVlA4WAoAAAAQAAAAEAAAFgAAQUxQSAoAAAABB1DAiAhERP8DVlA4IDoAAAAwAwCdASoRABcAPm00lkekIyIhKAgAgA2JZQB2AACBxLwAAP7uJx//+Fa3s9gd4//xQCkcNRwwrQAA')
images = {hashlib.sha256(image_bytes).hexdigest(): dict(size=len(image_bytes),width=17,height=23,referenced=0,bytes=image_bytes)}
lock = threading.RLock()
results = {}
expire = False

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw): super().__init__(*a, directory=str(ROOT / 'dist'), **kw)
    def log_message(self, *a): pass
    def reply(self, data, status=200):
        data = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status); self.send_header('Content-Type', 'application/json'); self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(data)
    def do_GET(self):
        with lock:
            route = urllib.parse.urlparse(self.path); query = urllib.parse.parse_qs(route.query)
            requests.append(('GET', route.path))
            if not route.path.startswith('/api/writer/'): return super().do_GET()
            if expire: return self.reply(dict(error='登录已过期', code='session_expired'), 401)
            if route.path.endswith('/session'): return self.reply(dict(user=dict(id=OWNER, nickname='测试站主'), capabilities=dict(publish=False)))
            if route.path.endswith('/content'): return self.reply(dict(tags=['随笔', '生活'], items=[], more=False))
            if route.path.endswith('/publish'): return self.reply(dict(jobs=[]))
            if route.path.endswith('/assets'):
                key = query.get('sha256', [None])[0]
                if key:
                    self.send_response(200); self.send_header('Content-Type','image/webp'); self.end_headers(); return self.wfile.write(images[key]['bytes'])
                return self.reply(dict(images=[dict(sha256=k,**{n:v for n,v in i.items() if n!='bytes'}) for k,i in images.items()], more=False, page=1, usage=dict(draftCount=len(drafts), imageBytes=sum(i['size'] for i in images.values()), totalBytes=600)))
            if route.path.endswith('/drafts'):
                key = query.get('id', [None])[0]
                if not key: return self.reply(dict(drafts=[dict(d, title=d['value']['fields'].get('title', '')) for d in drafts.values()]))
                if key not in drafts: return self.reply(dict(error='草稿不存在'), 404)
                if query.get('export') == ['1']: return self.reply(dict(format='northcedar-writer-1', draft=drafts[key], images=[]))
                return self.reply(dict(draft=drafts[key]))
            self.reply(dict(error='夹具未定义此接口'), 404)
    def do_POST(self):
        with lock:
            route = urllib.parse.urlparse(self.path); raw = self.rfile.read(int(self.headers.get('Content-Length', 0)))
            if route.path.endswith('/assets'):
                key=hashlib.sha256(raw).hexdigest();images[key]=dict(size=len(raw),width=16,height=16,referenced=1,bytes=raw);requests.append(('POST',route.path,'binary'))
                return self.reply(dict(sha256=key),201)
            body = json.loads(raw)
            requests.append(('POST', route.path, body.get('action')))
            if expire: return self.reply(dict(error='登录已过期', code='session_expired'), 401)
            if not route.path.endswith('/drafts'): return self.reply(dict(error='夹具未定义此接口'), 404)
            action = body.get('action')
            if action == 'save':
                d = drafts[body['id']]
                if d['revision'] != body['expectedRevision']: return self.reply(dict(error='云端已有更新', code='version_conflict'), 409)
                d['revision'] += 1; d['value'] = body['value']; return self.reply(dict(draft=d))
            if action == 'copy':
                d = copy.deepcopy(drafts[body['id']]); d.update(id=uuid.uuid4().hex, revision=1, publishedRevision=0, value=body['value']); drafts[d['id']] = d
                return self.reply(dict(draft=d), 201)
            return self.reply(dict(error='夹具未定义此操作'), 400)
    def do_DELETE(self):
        with lock:
            route=urllib.parse.urlparse(self.path); key=urllib.parse.parse_qs(route.query).get('sha256',[None])[0]
            requests.append(('DELETE',route.path,key))
            if key not in images: return self.reply(dict(error='图片不存在'),409)
            del images[key]; return self.reply(dict(ok=True))

server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{server.server_address[1]}'
def check(label, passed, detail=None):
    results[label] = dict(passed=bool(passed), detail=detail)
    print(('PASS ' if passed else 'FAIL ') + label, flush=True)
    if not passed: raise AssertionError(label + ': ' + str(detail))

with TemporaryDirectory(prefix='nc-writer-client-chrome-') as profile:
    with socket.socket() as sock: sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
    process = subprocess.Popen([r'C:/Program Files/Google/Chrome/Application/chrome.exe', '--headless=new', '--disable-gpu', '--no-proxy-server', '--no-first-run', '--no-default-browser-check', f'--remote-debugging-port={port}', '--remote-allow-origins=*', f'--user-data-dir={profile}', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=0x08000000)
    try:
        for _ in range(100):
            try: targets = json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json')); break
            except Exception: time.sleep(.1)
        else: raise RuntimeError('独立 Chrome 启动超时')
        ws = LocalWebSocket(next(t['webSocketDebuggerUrl'] for t in targets if t['type'] == 'page')); serial = 0
        def cdp(method, params=None):
            global serial
            serial += 1; request_id=serial; ws.send(json.dumps(dict(id=request_id, method=method, params=params or {})))
            while True:
                message = json.loads(ws.recv())
                # 真实触摸激活后的离开提示只属于本脚本的独立页面，可明确接受刷新。
                if message.get('method')=='Page.javascriptDialogOpening':
                    serial+=1;ws.send(json.dumps(dict(id=serial,method='Page.handleJavaScriptDialog',params=dict(accept=True))))
                if message.get('id') == request_id:
                    if 'error' in message: raise RuntimeError(str(message['error']))
                    return message.get('result', {})
        def js(code):
            response = cdp('Runtime.evaluate', dict(expression=code, returnByValue=True, awaitPromise=True))
            if response.get('exceptionDetails'): raise RuntimeError(str(response['exceptionDetails']))
            return response.get('result', {}).get('value')
        def wait(code, seconds=10):
            until = time.monotonic() + seconds
            while time.monotonic() < until:
                if js('Boolean(' + code + ')'): return
                time.sleep(.1)
            raise AssertionError('等待超时: ' + code)
        def click(label): js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent===' + json.dumps(label) + ').click()')
        def fill(body): js('(()=>{const e=document.querySelector(".writer-body");e.value=' + json.dumps(body) + ';e.dispatchEvent(new Event("input",{bubbles:true}));})()')
        def open_draft():
            click('草稿'); wait('document.querySelector(".writer-list button")'); js('document.querySelector(".writer-list button").click()'); wait('document.querySelector(".writer-body")')
        cdp('Network.enable'); cdp('Page.enable')
        cdp('Page.addScriptToEvaluateOnNewDocument', dict(source='window.__writerErrors=[];addEventListener("error",e=>__writerErrors.push(e.message));addEventListener("unhandledrejection",e=>__writerErrors.push(String(e.reason)))'))
        cdp('Browser.setDownloadBehavior', dict(behavior='allow', downloadPath=str(OUTPUT)))
        cdp('Emulation.setDeviceMetricsOverride', dict(width=390, height=844, deviceScaleFactor=1, mobile=True))
        cdp('Page.navigate', dict(url=BASE + '/write/')); wait('document.querySelector(".writer-list button")'); open_draft()
        check('客户端首个私密读取为身份接口', next(p for p in requests if p[1].startswith('/api/writer/'))[1] == '/api/writer/session')
        fill('仅客户端测试的自动保存'); wait('document.querySelector(".writer-status").textContent.includes("已保存到云端")')
        check('实际输入与自动保存请求一致', drafts[ID]['value']['body'] == '仅客户端测试的自动保存')
        # 用真实离线网络和 IndexedDB 检查恢复，不用内存替身假冒设备备份。
        cdp('Network.emulateNetworkConditions', dict(offline=True, latency=0, downloadThroughput=0, uploadThroughput=0))
        fill('离线后仍要保留的输入'); time.sleep(2.4)
        check('断网保留输入且不显示云端保存成功', js('document.querySelector(".writer-body").value==="离线后仍要保留的输入" && !document.querySelector(".writer-status").textContent.includes("已保存到云端")'))
        cdp('Network.emulateNetworkConditions', dict(offline=False, latency=0, downloadThroughput=-1, uploadThroughput=-1))
        # 不等待在线事件自动保存，刷新后从真实 IDB 读取恢复选项。
        cdp('Page.reload'); wait('document.querySelector(".writer-list button")'); click('草稿'); wait('document.querySelector(".writer-list button")'); js('document.querySelector(".writer-list button").click()')
        wait('document.body.innerText.includes("发现本设备恢复副本") || document.querySelector(".writer-body")')
        has_recovery = js('document.body.innerText.includes("发现本设备恢复副本")')
        if has_recovery: click('恢复本设备版本')
        wait('document.querySelector(".writer-body")'); check('刷新后真实设备副本或已确认云端保存恢复输入', js('document.querySelector(".writer-body").value==="离线后仍要保留的输入"'))
        click('保存草稿'); wait('document.querySelector(".writer-status").textContent.includes("已保存到云端")')
        with lock: drafts[ID]['revision'] += 1; drafts[ID]['value']['body'] = '另一设备的新版本'
        fill('冲突时手机输入'); click('保存草稿'); wait('document.body.innerText.includes("对照版本")')
        click('将当前输入另存为新草稿'); wait('document.querySelector(".writer-body") && document.querySelector(".writer-body").value==="冲突时手机输入"')
        wait('document.querySelectorAll(".writer-list button").length===2')
        check('文章冲突可以另存，原草稿保持另一设备内容', len(drafts)==2 and drafts[ID]['value']['body']=='另一设备的新版本')
        click('配图占用与清理'); wait('document.body.innerText.includes("有效载荷占用")')
        check('清理入口显示实际额度而非仅图片数量', js('document.body.innerText.includes("96 MiB") && document.body.innerText.includes("64 MiB")'))
        js('document.querySelector("[data-writer-storage-panel] input[type=checkbox]").click()'); click('检查所选图片（1 张）'); click('取消清理')
        check('取消清理不发送删除请求', not any(r[0]=='DELETE' for r in requests))
        click('检查所选图片（1 张）'); click('确认删除所选图片'); wait('document.body.innerText.includes("已清理 1 张图片")')
        check('只删除明确选中的图片', len(images)==0 and len([r for r in requests if r[0]=='DELETE'])==1)
        click('收起占用与清理')
        # 自己生成的透明 PNG 与带方向标记 JPEG，不读取用户照片。
        def chunk(kind,data): return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data))
        png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',16,16,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(b'\0'+b'\xc8\xa4\x6a\0'*8+b'\xc8\xa4\x6a\xff'*8 for _ in range(16))))+chunk(b'IEND',b'')
        (OUTPUT/'transparent.png').write_bytes(png)
        jpeg=base64.b64decode('/9j/4QC8RXhpZgAASUkqAAgAAAAGABIBAwABAAAAAQAAABoBBQABAAAAVgAAABsBBQABAAAAXgAAACgBAwABAAAAAgAAABMCAwABAAAAAQAAAGmHBAABAAAAZgAAAAAAAAA4YwAA6AMAADhjAADoAwAABgAAkAcABAAAADAyMTABkQcABAAAAAECAwAAoAcABAAAADAxMDABoAMAAQAAAP//AAACoAQAAQAAAAMAAAADoAQAAQAAAAUAAAAAAAAA/9sAQwAGBAUGBQQGBgUGBwcGCAoQCgoJCQoUDg8MEBcUGBgXFBYWGh0lHxobIxwWFiAsICMmJykqKRkfLTAtKDAlKCko/9sAQwEHBwcKCAoTCgoTKBoWGigoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgo/8AAEQgABQADAwEiAAIRAQMRAf/EABUAAQEAAAAAAAAAAAAAAAAAAAAG/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/EABUBAQEAAAAAAAAAAAAAAAAAAAUG/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AtQEuaf/Z')
        jpeg=jpeg.replace(b'\x12\x01\x03\x00\x01\x00\x00\x00\x01\x00\x00\x00',b'\x12\x01\x03\x00\x01\x00\x00\x00\x06\x00\x00\x00',1);(OUTPUT/'orientation-6.jpg').write_bytes(jpeg)
        document=cdp('DOM.getDocument')['root']['nodeId']; picker=cdp('DOM.querySelector',dict(nodeId=document,selector='input[type=file]'))['nodeId']
        cdp('DOM.setFileInputFiles',dict(nodeId=picker,files=[str(OUTPUT/'transparent.png'),str(OUTPUT/'orientation-6.jpg')]))
        wait('document.querySelectorAll(".writer-editor .writer-image").length===2');wait('Array.from(document.querySelectorAll(".writer-image img")).every(i=>i.complete&&i.naturalWidth)')
        check('实际图片解码遵循 EXIF 方向',js('(()=>{const i=document.querySelectorAll(".writer-image img")[1];return i.naturalWidth===5&&i.naturalHeight===3})()'))
        check('压缩后透明通道保留',js('(()=>{const i=document.querySelector(".writer-image img"),c=document.createElement("canvas");c.width=i.naturalWidth;c.height=i.naturalHeight;const x=c.getContext("2d");x.drawImage(i,0,0);return x.getImageData(0,0,1,1).data[3]===0})()'))
        js('document.querySelectorAll(".writer-image .writer-field input").forEach((e,i)=>{e.value="客户端图片"+i;e.dispatchEvent(new Event("input",{bubbles:true}))})')
        click('上传并添加');wait('document.querySelectorAll("[data-image-id]").length===1');click('上传并添加');wait('document.querySelectorAll("[data-image-id]").length===2')
        check('原生文件选择后实际上传 WebP',len([r for r in requests if r[0]=='POST' and r[1].endswith('/assets')])==2 and all(i['bytes'].startswith(b'RIFF') and i['bytes'][8:12]==b'WEBP' for i in images.values()))
        click('保存草稿');wait('document.querySelector(".writer-status").textContent.includes("已保存到云端")')
        first=js('document.querySelector("[data-image-id]").dataset.imageId');click('下移');check('配图移动按钮实际改变顺序',js('document.querySelector("[data-image-id]").dataset.imageId')!=first)
        cdp('Emulation.setDeviceMetricsOverride',dict(width=390,height=1200,deviceScaleFactor=1,mobile=True));cdp('Emulation.setTouchEmulationEnabled',dict(enabled=True,maxTouchPoints=1))
        js('document.querySelector("[data-image-handle]").scrollIntoView({block:"start"})')
        points=js('(()=>{const a=document.querySelector("[data-image-handle]").getBoundingClientRect(),b=document.querySelectorAll("[data-image-id]")[1].getBoundingClientRect();return {x:a.x+a.width/2,y:a.y+a.height/2,toX:b.x+b.width/2,toY:b.y+30,first:document.querySelector("[data-image-id]").dataset.imageId}})()')
        cdp('Input.dispatchTouchEvent',dict(type='touchStart',touchPoints=[dict(x=points['x'],y=points['y'],id=1)]))
        for step in range(1,9): cdp('Input.dispatchTouchEvent',dict(type='touchMove',touchPoints=[dict(x=points['x']+(points['toX']-points['x'])*step/8,y=points['y']+(points['toY']-points['y'])*step/8,id=1)]))
        cdp('Input.dispatchTouchEvent',dict(type='touchEnd',touchPoints=[]));check('实际单指拖动可以调整配图顺序',js('document.querySelector("[data-image-id]").dataset.imageId')!=points['first'])
        click('下载 Markdown'); time.sleep(.3); check('Markdown 可下载', bool(list(OUTPUT.glob('*.md'))))
        # 打开保留资料，让长 JSON 和长文章标识都参与实际排版。
        js('document.querySelectorAll(".writer-editor details").forEach(d=>d.open=true)')
        for width in [320,390,768,1280]:
            cdp('Emulation.setDeviceMetricsOverride', dict(width=width,height=900,deviceScaleFactor=1,mobile=width<768))
            js('window.scrollTo(0,0)')
            for dark in [False,True]:
                js('document.documentElement.classList.toggle("dark",' + str(dark).lower() + ')')
                check(f'{width}宽度/{"暗" if dark else "亮"}无横向溢出', js('document.documentElement.scrollWidth<=innerWidth+1'), js('({width:innerWidth,scroll:document.documentElement.scrollWidth})'))
                if width in [390,1280]: (OUTPUT / f'client-{width}-{"dark" if dark else "light"}.png').write_bytes(base64.b64decode(cdp('Page.captureScreenshot',dict(format='png'))['data']))
        fill('[不执行](javascript:alert(1))\n\n<img src=x onerror="window.__xss=1">'); click('预览')
        check('真实预览 DOM 不建立脚本链接或事件标签', js('!window.__xss && !document.querySelector(".writer-preview [onerror],.writer-preview script") && !Array.from(document.querySelectorAll(".writer-preview a")).some(a=>a.protocol==="javascript:")'))
        click('继续编辑'); expire = True; fill('过期登录仍保留的输入'); click('保存草稿'); wait('document.querySelector(".writer-status").textContent.includes("登录已过期")')
        check('登录过期保留输入', js('document.querySelector(".writer-body").value==="过期登录仍保留的输入"'))
        check('编辑及图片流程无未处理浏览器异常',not js('window.__writerErrors'),js('window.__writerErrors'))
        expire = False
        cdp('Page.addScriptToEvaluateOnNewDocument', dict(source='window.__idbDeniedTest=true;Object.defineProperty(window,"indexedDB",{get(){throw new DOMException("测试拒绝 IndexedDB","SecurityError")}})'))
        cdp('Page.reload'); wait('window.__idbDeniedTest===true && document.readyState==="complete" && document.querySelector(".writer-list button")'); open_draft(); fill('设备备份不可用也可保存的输入'); click('保存草稿'); wait('document.querySelector(".writer-status").textContent.includes("已保存到云端")')
        check('真实浏览器拒绝 IndexedDB 时明确提示而不谎称本设备已备份', js('document.querySelector(".writer-backup").textContent.includes("本设备备份失败")'))
        check('无未处理浏览器异常', not js('window.__writerErrors'), js('window.__writerErrors'))
    except Exception as error:
        results['未完成'] = dict(passed=False, detail=str(error)); print(str(error), flush=True)
        if 'ws' in globals():
            results['诊断'] = dict(passed=False, detail=dict(text=js('document.body.innerText'), errors=js('window.__writerErrors'), requests=requests))
    finally:
        if 'ws' in globals(): ws.sock.close()
        process.terminate(); process.wait(timeout=15); server.shutdown()
        (OUTPUT / 'client-results.json').write_text(json.dumps(dict(scope='仅浏览器客户端；HTTP 为夹具，未验 Cloudflare/D1/真实认证/部署', results=results),ensure_ascii=False,indent=2),encoding='utf8')

raise SystemExit(0 if results and all(row['passed'] for row in results.values()) else 1)
