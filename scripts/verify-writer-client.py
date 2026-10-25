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
block_saves = False
hold_asset_upload = False
upload_gate = threading.Event()

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
        if self.path.startswith('/api/writer/assets') and hold_asset_upload: upload_gate.wait(5)
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
                if block_saves: return self.reply(dict(error='测试暂停保存',code='temporary_unavailable'),503)
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
        def fill(body):
            if js('document.querySelector(".writer-body").hidden'): click('Markdown 源码')
            js('(()=>{const e=document.querySelector(".writer-body");e.value=' + json.dumps(body) + ';e.dispatchEvent(new Event("input",{bubbles:true}));})()')
        def open_draft():
            click('草稿'); wait('document.querySelector(".writer-list button")'); js('document.querySelector(".writer-list button").click()'); wait('document.querySelector(".writer-body")')
        cdp('Network.enable'); cdp('Page.enable')
        cdp('Page.addScriptToEvaluateOnNewDocument', dict(source='window.__writerErrors=[];addEventListener("error",e=>__writerErrors.push(e.message));addEventListener("unhandledrejection",e=>__writerErrors.push(String(e.reason)))'))
        cdp('Page.addScriptToEvaluateOnNewDocument',dict(source='window.__writerLoadId=crypto.randomUUID()'))
        cdp('Browser.setDownloadBehavior', dict(behavior='allow', downloadPath=str(OUTPUT)))
        cdp('Emulation.setDeviceMetricsOverride', dict(width=390, height=844, deviceScaleFactor=1, mobile=True))
        cdp('Page.navigate', dict(url=BASE + '/write/')); wait('document.querySelector(".writer-list button")'); open_draft()
        check('手机默认使用可视化正文编辑',js('!!document.querySelector(".ProseMirror[contenteditable=true]") && document.querySelector(".writer-body").hidden'))
        fill('print(1)\n\nprint(2)');click('可视化编辑')
        js('(()=>{const e=document.querySelector(".ProseMirror"),r=document.createRange();e.focus();r.selectNodeContents(e);getSelection().removeAllRanges();getSelection().addRange(r);})()')
        click('代码块')
        check('代码按钮把选中多段合成一个块',js('document.querySelectorAll(".ProseMirror pre").length===1 && document.querySelector(".ProseMirror pre").textContent==="print(1)\\nprint(2)"'))
        click('撤销')
        check('代码格式可撤销且保留两段原文',js('!document.querySelector(".ProseMirror pre") && document.querySelectorAll(".ProseMirror p").length===2'))
        click('重做')
        js('(()=>{const e=document.querySelector("select[aria-label=代码语言]");e.value="typescript";e.dispatchEvent(new Event("change",{bubbles:true}));})()')
        click('Markdown 源码')
        check('改代码语言进入Markdown且只保留一组围栏',js('document.querySelector(".writer-body").value.startsWith("```typescript\\n") && document.querySelector(".writer-body").value.split("```").length===3'))
        click('可视化编辑');click('代码块')
        check('已有码内点击不会重复套代码块',js('document.querySelectorAll(".ProseMirror pre").length===1'))
        js('(()=>{const e=document.querySelector(".writer-block-type");e.value="0";e.dispatchEvent(new Event("change",{bubbles:true}));})()')
        check('代码可改回正文且保留文本',js('!document.querySelector(".ProseMirror pre") && document.querySelector(".ProseMirror").textContent.includes("print(2)")'))
        fill('前文');click('可视化编辑')
        js('(()=>{const e=document.querySelector(".ProseMirror p"),r=document.createRange();r.selectNodeContents(e);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);document.querySelector(".ProseMirror").focus();})()')
        click('代码块');cdp('Input.insertText',dict(text='if True:\n    print("<tag>")'))
        check('空块点击后可以直接输入多行且保留缩进',js('document.querySelector(".ProseMirror pre").textContent===\'if True:\\n    print("<tag>")\''))
        check('手机代码工具与长行不横向溢出',js('document.documentElement.scrollWidth<=innerWidth'))
        js('document.querySelector(".writer-composer").scrollIntoView({block:"start"})')
        (OUTPUT/'code-block-mobile.png').write_bytes(base64.b64decode(cdp('Page.captureScreenshot',dict(format='png'))['data']))
        fill('源码前文\n\nprint(7)\n\n源码后文')
        js('(()=>{const e=document.querySelector(".writer-body"),at=e.value.indexOf("print(7)");e.focus();e.setSelectionRange(at,at+8);const s=document.querySelector("select[aria-label=代码语言]");s.value="python";s.dispatchEvent(new Event("change",{bubbles:true}));})()')
        click('代码块')
        check('源码按钮只包选中的代码并保留周围正文',js('document.querySelector(".writer-body").value==="源码前文\\n\\n```python\\nprint(7)\\n```\\n\\n源码后文"'))
        cdp('Input.dispatchKeyEvent',dict(type='keyDown',key='z',code='KeyZ',windowsVirtualKeyCode=90,modifiers=2))
        cdp('Input.dispatchKeyEvent',dict(type='keyUp',key='z',code='KeyZ',windowsVirtualKeyCode=90,modifiers=2))
        check('源码代码操作支持原生Ctrl+Z撤销',js('document.querySelector(".writer-body").value==="源码前文\\n\\nprint(7)\\n\\n源码后文"'))
        special_code='<video controls src="./keep.mp4"></video>\n\nprint(9)'
        fill(special_code)
        js('(()=>{const e=document.querySelector(".writer-body"),at=e.value.indexOf("print(9)");e.focus();e.setSelectionRange(at,at+8);})()');click('代码块')
        check('特殊旧文源码也有代码按钮且视频原文完整保留',js('document.querySelector(".writer-body").value===\'<video controls src="./keep.mp4"></video>\\n\\n```python\\nprint(9)\\n```\''))
        fill('初始正文');click('可视化编辑')
        js('document.querySelector(".ProseMirror").focus()')
        cdp('Input.insertText',dict(text='可视化中文输入'))
        js('(()=>{const e=document.querySelector(".writer-block-type");e.value="2";e.dispatchEvent(new Event("change",{bubbles:true}))})()')
        check('章节标题按钮产生实际 H2',js('document.querySelector(".ProseMirror h2").textContent.includes("可视化中文输入")'))
        click('Markdown 源码')
        check('标题操作生成目录所需的 Markdown',js('document.querySelector(".writer-body").value.startsWith("## ")'))
        click('可视化编辑');click('撤销')
        check('工具栏撤销保留输入但撤销标题',js('!document.querySelector(".ProseMirror h2") && document.querySelector(".ProseMirror").textContent.includes("可视化中文输入")'))
        click('重做')
        check('工具栏重做标题',js('!!document.querySelector(".ProseMirror h2")'))
        check('手机编辑器无横向溢出',js('document.documentElement.scrollWidth<=innerWidth'))
        fill('## 配图测试\n\n![受控以外的图](https://tracking.example.invalid/a.png)\n\n普通正文')
        click('可视化编辑')
        check('可视化不请求正文中的外部图片',js('!Array.from(document.querySelectorAll(".writer-visual img")).some(i=>i.src.includes("tracking.example")) && document.querySelector(".writer-visual").textContent.includes("受控以外的图")'))
        js('(()=>{const e=document.querySelector(".ProseMirror"),p=e.querySelector("p:last-child"),r=document.createRange();e.focus();r.selectNodeContents(p);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);const dt=new DataTransfer();dt.setData("text/plain","粘贴第一段\\n粘贴第二段");dt.setData("text/html","<img src=https://tracking.example.invalid/b.png onerror=window.__xss=1>");e.dispatchEvent(new ClipboardEvent("paste",{clipboardData:dt,bubbles:true,cancelable:true}))})()')
        check('富文本粘贴只取文字并保留段落',js('!window.__xss && !document.querySelector(".writer-visual [onerror]") && Array.from(document.querySelector(".writer-visual").children).filter(p=>p.textContent.includes("粘贴")).length===2'),js('document.querySelector(".writer-visual").innerHTML'))
        special='## 旧文章\r\n\r\n<video controls src="./keep.mp4"></video>\r\n\r\n| A | B |\r\n| --- | --- |\r\n| 1 | 2 |\r\n'
        fill(special)
        check('特殊旧文章明确禁止有损切换',js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="可视化编辑").disabled && document.querySelector(".writer-note").textContent!==null'))
        click('保存草稿');wait('document.querySelector(".writer-status").textContent.includes("已保存到云端")')
        check('旧文视频和表格保存不丢失',drafts[ID]['value']['body']==special.replace('\r\n','\n'))
        fill('中文输入法测试');click('可视化编辑')
        js('document.querySelector(".ProseMirror").focus()')
        cdp('Input.imeSetComposition',dict(text='输入中',selectionStart=3,selectionEnd=3))
        cdp('Input.insertText',dict(text='输入完成'))
        check('输入法组合文本可完成输入',js('document.querySelector(".ProseMirror").textContent.includes("输入完成")'))
        for width in [390,1280]:
            cdp('Emulation.setDeviceMetricsOverride',dict(width=width,height=1000,deviceScaleFactor=1,mobile=width<768))
            for dark in [False,True]:
                js('document.documentElement.classList.toggle("dark",'+str(dark).lower()+');document.querySelector(".writer-composer").scrollIntoView({block:"start"})')
                (OUTPUT/f'visual-{width}-{"dark" if dark else "light"}.png').write_bytes(base64.b64decode(cdp('Page.captureScreenshot',dict(format='png'))['data']))
        cdp('Emulation.setDeviceMetricsOverride',dict(width=390,height=844,deviceScaleFactor=1,mobile=True))
        check('客户端首个私密读取为身份接口', next(p for p in requests if p[1].startswith('/api/writer/'))[1] == '/api/writer/session')
        fill('仅客户端测试的自动保存'); wait('document.querySelector(".writer-status").textContent.includes("已保存到云端")')
        check('实际输入与自动保存请求一致', drafts[ID]['value']['body'] == '仅客户端测试的自动保存')
        # 用真实离线网络和 IndexedDB 检查恢复，不用内存替身假冒设备备份。
        cdp('Network.emulateNetworkConditions', dict(offline=True, latency=0, downloadThroughput=0, uploadThroughput=0))
        js('(()=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob('+json.dumps(base64.b64encode(image_bytes).decode())+'),c=>c.charCodeAt(0))],"pending.webp",{type:"image/webp"}));const p=document.querySelector("input[type=file]");p.files=dt.files;p.dispatchEvent(new Event("change",{bubbles:true}))})()')
        wait('document.querySelector(".writer-image .writer-field input")')
        js('(()=>{const a=document.querySelector(".writer-image .writer-field input");a.value="旧基线待传图片";a.dispatchEvent(new Event("input",{bubbles:true}))})()')
        fill('离线后仍要保留的输入'); time.sleep(2.4)
        check('断网保留输入且不显示云端保存成功', js('document.querySelector(".writer-body").value==="离线后仍要保留的输入" && !document.querySelector(".writer-status").textContent.includes("已保存到云端")'))
        # 发布在窗口关闭期间完成：服务器基线改变，但旧 key 下还有本设备输入和待上传 Blob。
        pending_bytes=base64.b64decode(js('(async()=>{const d=await new Promise((ok,no)=>{const r=indexedDB.open("northcedar-writer-recovery",1);r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});const r=d.transaction("copies").objectStore("copies").get('+json.dumps(OWNER+'/'+ID+'/new')+'),v=await new Promise((ok,no)=>{r.onsuccess=()=>ok(r.result);r.onerror=no});const b=await v.pendingImages[0].blob.arrayBuffer();d.close();return btoa(String.fromCharCode(...new Uint8Array(b)))})()'))
        with lock:
            drafts[ID]['base']=dict(commit='3'*40,blobSha='4'*40,text='已发布的原文');drafts[ID]['publishedRevision']=drafts[ID]['revision'];block_saves=True
        previous_load=js('window.__writerLoadId')
        cdp('Network.emulateNetworkConditions', dict(offline=False, latency=0, downloadThroughput=-1, uploadThroughput=-1))
        # 不等待在线事件自动保存，刷新后从真实 IDB 读取恢复选项。
        cdp('Page.reload'); wait('window.__writerLoadId!=='+json.dumps(previous_load)+' && document.readyState==="complete" && document.querySelector(".writer-list button")'); click('草稿'); wait('document.querySelector(".writer-list button")'); js('document.querySelector(".writer-list button").click()')
        wait('document.body.innerText.includes("发现本设备恢复副本") || document.querySelector(".writer-body")')
        has_recovery = js('document.body.innerText.includes("发现本设备恢复副本")')
        check('发布基线变化后重开仍发现旧基线设备副本',has_recovery)
        block_saves=False
        click('下载恢复副本')
        recovery_file=OUTPUT/('c'*60+'-recovery.json')
        for _ in range(50):
            if recovery_file.exists(): break
            time.sleep(.1)
        exported_recovery=json.loads(recovery_file.read_text(encoding='utf8'))
        check('设备副本导出保留待上传图片实际字节',exported_recovery.get('format')=='northcedar-writer-recovery-1' and base64.b64decode(exported_recovery['copy']['pendingImages'][0]['bytes'])==pending_bytes)
        if has_recovery: click('恢复本设备版本')
        wait('document.querySelector(".writer-body")'); check('刷新后真实设备副本或已确认云端保存恢复输入', js('document.querySelector(".writer-body").value==="离线后仍要保留的输入"'))
        check('旧基线待上传 Blob 同样可恢复',js('document.querySelector(".writer-image .writer-field input").value==="旧基线待传图片"'));click('放弃这张')
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
        # 上传应答到达时正在中文组词，保留待处理卡片，完成输入后可再次插入。
        fill('上传期间继续输入');click('可视化编辑')
        js('(()=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob('+json.dumps(base64.b64encode(image_bytes).decode())+'),c=>c.charCodeAt(0))],"composition.webp",{type:"image/webp"}));document.querySelector(".ProseMirror").dispatchEvent(new ClipboardEvent("paste",{clipboardData:dt,bubbles:true,cancelable:true}))})()')
        wait('Array.from(document.querySelectorAll("button")).some(b=>b.textContent==="上传并添加")')
        js('(()=>{const e=Array.from(document.querySelectorAll(".writer-image .writer-field input")).at(-1);e.value="组词期间的图片";e.dispatchEvent(new Event("input",{bubbles:true}))})()')
        hold_asset_upload=True;upload_gate.clear();click('上传并添加')
        js('document.querySelector(".ProseMirror").focus()');cdp('Input.imeSetComposition',dict(text='输入中',selectionStart=3,selectionEnd=3));upload_gate.set()
        wait('document.querySelector(".writer-error").textContent.includes("再次")')
        check('上传撞上输入法时保留待添加图片',js('Array.from(document.querySelectorAll("button")).some(b=>b.textContent==="上传并添加") && document.querySelector(".ProseMirror").textContent.includes("输入中")'))
        cdp('Input.insertText',dict(text='输入完成'));hold_asset_upload=False;click('上传并添加')
        wait('!Array.from(document.querySelectorAll("button")).some(b=>b.textContent==="上传并添加")')
        check('完成组词后重试插图成功',js('!!document.querySelector(".writer-visual .writer-inline-image img")'))
        first=js('document.querySelector(".writer-body").value.match(/writer-asset:([0-9a-f]{64})/)[1]')
        time.sleep(.6)
        js('Array.from(Array.from(document.querySelectorAll("[data-image-id]")).find(e=>e.dataset.imageId==='+json.dumps(first)+').querySelectorAll("button")).find(b=>b.textContent==="移除").click()');click('撤销');click('保存草稿')
        wait('document.querySelector(".writer-status").textContent.includes("已保存到云端")')
        # 第一张可能只在配图列表中，选择真正恢复的正文引用与元数据作一致性检查。
        copy_id=next(key for key in drafts if key!=ID)
        restored_refs=__import__('re').findall(r'writer-asset:([0-9a-f]{64})',drafts[copy_id]['value']['body'])
        check('移除配图后撤销不会留下悬空正文引用',first in restored_refs and all(a in {i['sha256'] for i in drafts[copy_id]['value']['assets']} for a in restored_refs),dict(first=first,refs=restored_refs,assets=drafts[copy_id]['value']['assets']))
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
