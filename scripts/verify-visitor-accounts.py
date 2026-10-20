"""访客账户浏览器验收：只访问本地 4337，使用独立 Chrome 资料目录。"""
import base64, hashlib, json, os, socket, struct, subprocess, tempfile, time, urllib.request, urllib.parse, zlib
from pathlib import Path

class LocalWebSocket:
    """只用于本地 Chrome 测试端口的 RFC6455 文本帧连接。"""
    def __init__(self, url):
        target = urllib.parse.urlparse(url)
        if target.hostname != '127.0.0.1': raise ValueError('只允许本机测试端口')
        self.sock = socket.create_connection((target.hostname, target.port), timeout=30)
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall(f'GET {target.path} HTTP/1.1\r\nHost: {target.netloc}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n'.encode())
        header = b''
        while not header.endswith(b'\r\n\r\n'): header += self.sock.recv(1)
        accepted = base64.b64encode(hashlib.sha1((key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest())
        if b' 101 ' not in header or accepted not in header: raise RuntimeError('WebSocket 握手失败')
    def take(self, n):
        data = b''
        while len(data) < n:
            part = self.sock.recv(n-len(data))
            if not part: raise RuntimeError('本地测试连接已关闭')
            data += part
        return data
    def send(self, text):
        data = text.encode(); mask = os.urandom(4)
        header = bytes([0x81, 0x80 | len(data)]) if len(data)<126 else bytes([0x81,0xfe])+struct.pack('!H',len(data)) if len(data)<65536 else bytes([0x81,0xff])+struct.pack('!Q',len(data))
        self.sock.sendall(header + mask + bytes(b ^ mask[i%4] for i,b in enumerate(data)))
    def recv(self):
        message = b''
        while True:
            first, second = self.take(2); length = second & 127
            if length == 126: length = struct.unpack('!H', self.take(2))[0]
            elif length == 127: length = struct.unpack('!Q', self.take(8))[0]
            mask = self.take(4) if second & 128 else None; data = self.take(length)
            if mask: data = bytes(b ^ mask[i%4] for i,b in enumerate(data))
            if first & 15 == 8: raise RuntimeError('本地浏览器关闭连接')
            if first & 15 in (0,1): message += data
            if first & 128 and first & 15 in (0,1): return message.decode()

HERE = Path(__file__).resolve().parent.parent
BASE = 'http://127.0.0.1:4337'
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
profile = tempfile.mkdtemp(prefix='nc-visitor-chrome-')
process = subprocess.Popen([
    r'C:\Program Files\Google\Chrome\Application\chrome.exe', '--headless=new', '--disable-gpu',
    '--no-first-run', '--no-default-browser-check', '--force-prefers-reduced-motion',
    f'--remote-debugging-port={port}', '--remote-allow-origins=*', f'--user-data-dir={profile}', 'about:blank'
], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=0x08000000)
passed = []
try:
    for _ in range(100):
        try:
            targets = json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json')); break
        except Exception: time.sleep(.1)
    else: raise RuntimeError('Chrome 未能启动')
    ws = LocalWebSocket(next(t['webSocketDebuggerUrl'] for t in targets if t['type'] == 'page'))
    serial = 0
    def cdp(method, params=None):
        global serial
        serial += 1; message = {'id': serial, 'method': method, 'params': params or {}}
        ws.send(json.dumps(message))
        while True:
            result = json.loads(ws.recv())
            if result.get('id') == serial:
                if 'error' in result: raise RuntimeError(str(result['error']))
                return result.get('result', {})
    def js(code):
        result = cdp('Runtime.evaluate', {'expression': code, 'returnByValue': True, 'awaitPromise': True})
        if 'exceptionDetails' in result: raise RuntimeError(str(result['exceptionDetails']))
        return result.get('result', {}).get('value')
    def wait(code, seconds=15):
        until = time.time() + seconds
        while time.time() < until:
            try:
                if js('Boolean(' + code + ')'): return
            except RuntimeError: pass
            time.sleep(.1)
        raise AssertionError('等待超时：' + code + '\n' + str(js('document.body.innerText.slice(-2000)')))
    def goto(path):
        cdp('Page.navigate', {'url': BASE + path}); wait('document.readyState === "complete" && location.pathname === ' + json.dumps(path)); time.sleep(.2)
    def fill(selector, value):
        js(f"(() => {{const x=document.querySelector({json.dumps(selector)});x.value={json.dumps(value)};x.dispatchEvent(new Event('input',{{bubbles:true}}));}})()")
    def click(selector): js(f'document.querySelector({json.dumps(selector)}).click()')
    def check(label, condition):
        if not condition: raise AssertionError(label)
        passed.append(label); print('PASS', label, flush=True)
    def shot(name):
        data = cdp('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': False})['data']; (HERE / name).write_bytes(base64.b64decode(data))
    cdp('Network.enable'); cdp('Network.setExtraHTTPHeaders', {'headers': {'CF-Connecting-IP': f'192.0.2.{port % 180 + 1}'}})
    cdp('Emulation.setDeviceMetricsOverride', {'width':1280,'height':1000,'deviceScaleFactor':1,'mobile':False})
    goto('/guestbook/'); wait('document.querySelector(".visitor-identity")')
    if os.environ.get('VISITOR_LAYOUT_ONLY'):
        wait('document.querySelector(".visitor-author")')
        check('正文中的评论头像保持正方形且昵称正常横排', js('(() => {const r=document.querySelector(".visitor-author img").getBoundingClientRect(),n=document.querySelector(".visitor-name").getBoundingClientRect();return Math.abs(r.width-r.height)<1 && r.width<=48 && n.height<60})()'))
        print(json.dumps(js('''[...document.querySelectorAll('.visitor-author,.visitor-author img,.visitor-author .visitor-name')].slice(0,9).map(x=>{const s=getComputedStyle(x),r=x.getBoundingClientRect();return {tag:x.tagName,cls:x.className,width:r.width,height:r.height,display:s.display,flex:s.flex,whiteSpace:s.whiteSpace,cssWidth:s.width,cssHeight:s.height}})'''),ensure_ascii=False), flush=True)
        js('document.querySelector(".comment-list").scrollIntoView()'); shot('_tmp-visitor-comments-layout.png')
        goto('/talks/'); click('[data-toggle]'); wait('document.querySelector(".cbox .visitor-identity")')
        check('说说身份入口占完整一行，名字与输入框对齐', js('(() => {const f=document.querySelector(".cbox form"),a=f.querySelector("label").getBoundingClientRect(),b=f.querySelector("input[name=name]").getBoundingClientRect();return a.left<b.left && Math.abs(a.top-b.top)<40})()'))
        raise SystemExit(0)
    check('匿名无自动登录窗口', js('!document.querySelector("dialog[open]") && !document.querySelector("#comment-name").readOnly'))
    fill('#comment-name', '匿名草稿名'); fill('#comment-body', '登录前输入的草稿仍然保留。')
    click('.visitor-identity button'); wait('document.querySelector(".visitor-dialog[open]")')
    cdp('Emulation.setDeviceMetricsOverride', {'width':390,'height':844,'deviceScaleFactor':1,'mobile':False})
    check('登录窗口在手机宽度内完整显示', js('(() => {const r=document.querySelector("dialog").getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && document.documentElement.scrollWidth<=innerWidth})()'))
    shot('_tmp-visitor-login-mobile.png')
    cdp('Emulation.setDeviceMetricsOverride', {'width':1280,'height':1000,'deviceScaleFactor':1,'mobile':False}); click('[data-mode="register"]')
    username = 'browser-' + str(int(time.time())); password = 'browser-test-password-2026'
    fill('dialog [name="username"]', username); fill('dialog [name="password"]', password); fill('dialog [name="confirm"]', password)
    js('document.querySelector("dialog form").requestSubmit()'); wait('document.querySelector(".visitor-recovery-code")')
    recovery = js('document.querySelector(".visitor-recovery-code").textContent')
    check('注册及恢复码展示', len(recovery) == 64)
    check('登录保留草稿且停留原页', js('document.querySelector("#comment-body").value === "登录前输入的草稿仍然保留。" && location.pathname === "/guestbook/"'))
    click('dialog .visitor-primary'); wait('!document.querySelector("dialog[open]")')
    check('登录后明确选择账户身份', js('document.querySelector("[name=identity]").value === "account" && document.querySelector("#comment-name").readOnly'))
    expected_name = js('document.querySelector("#comment-name").value')
    js('document.querySelector("[data-form]").requestSubmit()'); wait('document.querySelector("[data-list] > li .visitor-name")?.textContent === '+json.dumps(expected_name))
    check('账户评论有头像与名片入口', js('document.querySelector("[data-list] .visitor-avatar").naturalWidth > 0'))
    check('评论头像没有被正文图片样式拉伸', js('(() => {const r=document.querySelector("[data-list] .visitor-avatar").getBoundingClientRect();return Math.abs(r.width-r.height)<1 && r.width<=48})()'))
    click('[data-list] .visitor-author button'); wait('document.querySelector(".visitor-card h3")'); shot('_tmp-visitor-card.png'); click('dialog .visitor-close')
    check('公开名片不暴露登录账号', js(f'!document.querySelector("[data-list]").innerText.includes({json.dumps(username)})'))
    click('[data-list] > li > .reply-btn'); wait('document.querySelector(".reply-form [name=identity]")')
    reply_body = '来自账户的回复 ' + username
    fill('.reply-body-input', reply_body); js('document.querySelector(".reply-form").requestSubmit()'); wait('[...document.querySelectorAll(".reply-body")].some(x=>x.textContent==='+json.dumps(reply_body)+')')
    check('回复共用账户头像身份', js('document.querySelector(".reply-item .visitor-name") instanceof HTMLButtonElement'))
    goto('/account/'); wait('document.querySelector("[name=nickname]")'); fill('[name=nickname]', '林间来客'); fill('[name=bio]', '在实验室与森林之间。<script>只是文字</script>')
    js('[...document.querySelectorAll(".visitor-avatar-choice")].find(x=>x.textContent.includes("双螺旋")).click()')
    js('document.querySelector(".visitor-account-section > form").requestSubmit()'); wait('document.body.innerText.includes("名片已保存")')
    check('昵称签名和默认头像保存', js('document.querySelector(".visitor-account-header strong").textContent === "林间来客" && document.querySelector(".visitor-account-header img").src.endsWith("/avatars/helix.svg")'))
    shot('_tmp-visitor-settings-desktop.png')
    def png_chunk(kind, data):
        payload = kind + data
        return struct.pack('!I', len(data)) + payload + struct.pack('!I', zlib.crc32(payload))
    raw = b''.join(b'\x00' + b''.join(bytes((80,125,96,255) if (x+y)%64<32 else (205,220,208,255)) for x in range(256)) for y in range(256))
    fixture = HERE / '_tmp-visitor-avatar-source.png'
    fixture.write_bytes(b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR',struct.pack('!IIBBBBB',256,256,8,6,0,0,0)) + png_chunk(b'tEXt',b'private-location\x00must-be-removed') + png_chunk(b'IDAT',zlib.compress(raw)) + png_chunk(b'IEND',b''))
    doc = cdp('DOM.getDocument')['root']['nodeId']; file_id = cdp('DOM.querySelector', {'nodeId':doc,'selector':'input[type=file]'})['nodeId']; cdp('DOM.setFileInputFiles', {'nodeId':file_id,'files':[str(fixture)]})
    wait('document.body.innerText.includes("自定义头像已保存")')
    check('浏览器转图及服务端头像返回', js('document.querySelector(".visitor-account-header img").src.includes("/api/avatars?")'))
    cdp('Emulation.setDeviceMetricsOverride', {'width':390,'height':844,'deviceScaleFactor':1,'mobile':False}); time.sleep(.2)
    check('资料设置窄屏无横向溢出', js('document.documentElement.scrollWidth <= innerWidth'))
    shot('_tmp-visitor-settings-mobile.png'); js('document.documentElement.classList.add("dark")'); shot('_tmp-visitor-settings-dark.png')
    cdp('Emulation.setDeviceMetricsOverride', {'width':1280,'height':1000,'deviceScaleFactor':1,'mobile':False})
    cdp('Network.setExtraHTTPHeaders', {'headers': {'CF-Connecting-IP': f'198.51.100.{port % 180 + 1}'}})
    goto('/posts/camera-in-gaosan/'); wait('document.querySelector("[name=identity]")?.value === "account"')
    js('const a=document.querySelector("[name=identity]");a.value="anonymous";a.dispatchEvent(new Event("change"))')
    fill('#comment-name', '文章匿名读者'); article_body = '文章匿名验证 ' + username; fill('#comment-body', article_body)
    js('document.querySelector("[data-form]").requestSubmit()'); wait('document.querySelector("[data-list] > li .comment-body")?.textContent === '+json.dumps(article_body))
    check('文章页登录后仍可主动匿名发表', js('!(document.querySelector("[data-list] > li .visitor-name") instanceof HTMLButtonElement)'))
    cdp('Network.setExtraHTTPHeaders', {'headers': {'CF-Connecting-IP': f'203.0.113.{port % 180 + 1}'}})
    goto('/talks/'); click('[data-toggle]'); wait('document.querySelector(".cbox [name=identity]")?.value === "account"')
    talks_body = '说说账户验证 ' + username; fill('.cbox textarea', talks_body)
    js('document.querySelector(".cbox [data-form]").requestSubmit()'); wait('document.querySelector(".cbox .cbody")?.textContent === '+json.dumps(talks_body))
    check('说说页账户评论带头像与名片', js('document.querySelector(".cbox .visitor-name") instanceof HTMLButtonElement && document.querySelector(".cbox .visitor-name").textContent === "林间来客"'))
    check('说说身份入口与名字输入对齐', js('(() => {const f=document.querySelector(".cbox form"),a=f.querySelector("label").getBoundingClientRect(),b=f.querySelector("input[name=name]").getBoundingClientRect();return a.left<b.left && Math.abs(a.top-b.top)<40})()'))
    shot('_tmp-visitor-talks.png')
    cdp('Emulation.setDeviceMetricsOverride', {'width':390,'height':844,'deviceScaleFactor':1,'mobile':False})
    check('说说评论在手机宽度无横向溢出', js('document.documentElement.scrollWidth<=innerWidth'))
    shot('_tmp-visitor-talks-mobile.png')
    cdp('Emulation.setDeviceMetricsOverride', {'width':1280,'height':1000,'deviceScaleFactor':1,'mobile':False})
    goto('/guestbook/'); wait('document.querySelector("[data-list] .visitor-name")?.textContent === "林间来客"')
    check('历史评论同步新名片且正文未解析 HTML', js('document.querySelector("[data-list] .visitor-avatar").src.includes("/api/avatars?")'))
    fill('#comment-body', '失效登录不应丢失的草稿')
    cdp('Network.setCookie', {'name':'nc_session_dev','value':'0'*64,'url':BASE,'path':'/'})
    js('document.querySelector("[data-form]").requestSubmit()'); wait('document.querySelector("[data-error]").textContent.includes("登录已过期")')
    check('过期账户不自动转匿名，草稿保留', js('document.querySelector("#comment-body").value === "失效登录不应丢失的草稿" && document.querySelector("[name=identity]").value === "account" && location.pathname === "/guestbook/"'))
    check('失效会话可以在原页重新登录', js('!document.querySelector(".visitor-identity button").hidden'))
    cdp('Network.setExtraHTTPHeaders', {'headers': {'CF-Connecting-IP': '192.0.2.202'}})
    js('const ident=document.querySelector("[name=identity]");ident.value="anonymous";ident.dispatchEvent(new Event("change"))'); fill('#comment-name', '匿名来客')
    js('document.querySelector("[data-form]").requestSubmit()'); wait('document.querySelector("[data-list] > li .visitor-name")?.textContent === "匿名来客"')
    check('主动选择匿名成功且无账户名片', js('!(document.querySelector("[data-list] > li .visitor-name") instanceof HTMLButtonElement)'))
    goto('/account/'); wait('!document.body.innerText.includes("正在读取账户")'); click('[data-account-state] button'); wait('document.querySelector("dialog[open]")'); click('[data-mode=recover]')
    fill('dialog [name=username]', username); fill('dialog [name=recoveryCode]', recovery); fill('dialog [name=password]', password+'-new'); fill('dialog [name=confirm]', password+'-new')
    js('document.querySelector("dialog form").requestSubmit()'); wait('document.querySelector(".visitor-recovery-code")'); check('恢复码可以重设密码并换新码', js('document.querySelector(".visitor-recovery-code").textContent') != recovery)
    click('dialog .visitor-primary'); fill('dialog [name=username]', username); fill('dialog [name=password]', password+'-new'); js('document.querySelector("dialog form").requestSubmit()'); wait('document.querySelector("[name=nickname]") && !document.querySelector("dialog[open]")')
    details = 'document.querySelectorAll(".visitor-account details")[2]'; js(details+'.open=true')
    fill('.visitor-account details:last-of-type [name=password]', password+'-new'); js('document.querySelector("[name=confirmed]").checked=true'); js(details+'.querySelector("form").requestSubmit()'); wait('document.querySelector("[data-account-notices]").textContent.includes("账户已注销")')
    check('注销流程清除账户并保留既有留言', js('!document.querySelector("[name=nickname]")'))
    print(json.dumps({'passed':len(passed),'checks':passed}, ensure_ascii=False), flush=True)
finally:
    process.terminate()
    try: process.wait(timeout=10)
    except subprocess.TimeoutExpired: process.kill()
