"""头像预览验收：独立本地 Chrome，合成账户响应，禁止真实接口写入。"""
import base64, json, os, struct, subprocess, tempfile, time, urllib.request, zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(os.environ.get('AVATAR_CROP_EVIDENCE_DIR', tempfile.mkdtemp(prefix='avatar-crop-evidence-')))
OUT.mkdir(parents=True, exist_ok=True)
source = (ROOT/'scripts/verify-visitor-accounts.py').read_text(encoding='utf-8')
exec(source[:source.index('\nHERE = ')])
BASE = 'http://127.0.0.1:4337'
def chunk(kind, data): return struct.pack('!I', len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
raw=b''.join(b'\x00'+bytes(v for x in range(400) for v in (x%256,y,32)) for y in range(200))
fixture=OUT/'wide.png'
fixture.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!IIBBBBB',400,200,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''))
bad=OUT/'invalid.png'; bad.write_bytes(b'not an image')
with socket.socket() as sock: sock.bind(('127.0.0.1',0)); port=sock.getsockname()[1]
process=subprocess.Popen([r'C:/Program Files/Google/Chrome/Application/chrome.exe','--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--force-prefers-reduced-motion',f'--remote-debugging-port={port}','--remote-allow-origins=*',f'--user-data-dir={OUT/"chrome-profile"}','about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=0x08000000)
passed=[]
try:
    for _ in range(100):
        try: targets=json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json')); break
        except Exception: time.sleep(.1)
    else: raise RuntimeError('Chrome 启动失败')
    ws=LocalWebSocket(next(t['webSocketDebuggerUrl'] for t in targets if t['type']=='page')); serial=0
    def cdp(method,params=None):
        global serial
        serial+=1; ws.send(json.dumps({'id':serial,'method':method,'params':params or {}}))
        while True:
            result=json.loads(ws.recv())
            if result.get('id')==serial:
                if 'error' in result: raise RuntimeError(str(result['error']))
                return result.get('result',{})
    def js(code):
        result=cdp('Runtime.evaluate',{'expression':code,'returnByValue':True,'awaitPromise':True})
        if 'exceptionDetails' in result: raise RuntimeError(str(result['exceptionDetails']))
        return result.get('result',{}).get('value')
    def wait(code):
        until=time.time()+12
        while time.time()<until:
            if js('Boolean('+code+')'): return
            time.sleep(.1)
        raise AssertionError('等待超时：'+code+'\n'+str(js('document.body.innerText.slice(-1500)')))
    def check(name,condition):
        if not condition: raise AssertionError(name)
        passed.append(name); print('PASS '+name,flush=True)
    def click_text(text): js('[...document.querySelectorAll("button")].find(e=>e.textContent==='+json.dumps(text,ensure_ascii=False)+').click()')
    def choose(file=fixture):
        root=cdp('DOM.getDocument')['root']['nodeId']
        target=cdp('DOM.querySelector',{'nodeId':root,'selector':'input[type=file]'})['nodeId']
        cdp('DOM.setFileInputFiles',{'nodeId':target,'files':[str(file)]})
    def shot(name): (OUT/name).write_bytes(base64.b64decode(cdp('Page.captureScreenshot',{'format':'png'})['data']))
    cdp('Page.enable');cdp('Emulation.setDeviceMetricsOverride',{'width':1280,'height':1000,'deviceScaleFactor':1,'mobile':False})
    cdp('Page.addScriptToEvaluateOnNewDocument',{'source': '''
      const originalFetch=window.fetch.bind(window);
      let user={id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',username:'crop_fixture',nickname:'头像预览',bio:'',avatarUrl:'/avatars/helix.svg',isOwner:false};
      window.avatarPosts=[];window.avatarFail=false;window.avatarHold=false;
      window.fetch=(input,init)=>{
        const u=new URL(typeof input==='string'?input:input.url,location.href);
        if(u.pathname==='/api/account'){
          if(init?.method==='POST'){
            const body=JSON.parse(init.body);
            if(body.action==='logout'){user=null;return Promise.resolve(new Response(JSON.stringify({ok:true})));}
            window.avatarPosts.push(body);
            if(body.action!=='avatar')throw new Error('只允许合成头像上传');
            if(window.avatarFail)return Promise.resolve(new Response(JSON.stringify({error:'测试上传失败，请重试'}),{status:503}));
            user.avatarUrl='data:image/png;base64,'+body.png;
            if(window.avatarHold){const result=JSON.stringify({user});return new Promise(resolve=>{window.resolveAvatar=()=>resolve(new Response(result));});}
          }
          return Promise.resolve(new Response(JSON.stringify({user}),{headers:{'Content-Type':'application/json'}}));
        }
        if(init?.method&&!['GET','HEAD'].includes(init.method))throw new Error('禁止真实写入');
        return originalFetch(input,init);
      };
    '''})
    cdp('Page.navigate',{'url':BASE+'/account/'});wait('document.querySelector("input[type=file]")')
    choose();wait('document.querySelector(".visitor-crop[open]")')
    check('选文件只预览，不上传',js('window.avatarPosts.length===0'))
    js('document.querySelector(".visitor-account-section > form").requestSubmit()')
    check('预览期间不并发保存名片',js('window.avatarPosts.length===0'))
    click_text('取消');wait('!document.querySelector(".visitor-crop")&&!document.querySelector("input[type=file]").disabled')
    check('取消保留头像并恢复文件控件焦点',js('window.avatarPosts.length===0&&document.querySelector(".visitor-account-header img").src.endsWith("/avatars/helix.svg")&&document.activeElement.type==="file"'))
    choose();wait('document.querySelector(".visitor-crop[open]")')
    cdp('Input.dispatchKeyEvent',{'type':'keyDown','key':'Escape','code':'Escape','windowsVirtualKeyCode':27});cdp('Input.dispatchKeyEvent',{'type':'keyUp','key':'Escape','code':'Escape','windowsVirtualKeyCode':27})
    wait('!document.querySelector(".visitor-crop")&&!document.querySelector("input[type=file]").disabled')
    check('Esc取消不写入且同文件可重选',js('window.avatarPosts.length===0&&document.querySelector("input[type=file]").value===""'))
    choose();wait('document.querySelector(".visitor-crop[open]")')
    initial=js('document.querySelector(".visitor-crop-preview").toDataURL()')
    cdp('Input.dispatchKeyEvent',{'type':'keyDown','key':'ArrowLeft','code':'ArrowLeft','windowsVirtualKeyCode':37});cdp('Input.dispatchKeyEvent',{'type':'keyUp','key':'ArrowLeft','code':'ArrowLeft','windowsVirtualKeyCode':37})
    check('方向键能移动边缘图像',js('document.querySelector(".visitor-crop-preview").toDataURL()')!=initial)
    click_text('重新居中')
    point=js('(()=>{const r=document.querySelector(".visitor-crop-preview").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
    cdp('Input.dispatchMouseEvent',{'type':'mousePressed','x':point['x'],'y':point['y'],'button':'left','buttons':1,'clickCount':1})
    cdp('Input.dispatchMouseEvent',{'type':'mouseMoved','x':point['x']-32,'y':point['y'],'button':'left','buttons':1})
    cdp('Input.dispatchMouseEvent',{'type':'mouseReleased','x':point['x']-32,'y':point['y'],'button':'left','buttons':0,'clickCount':1})
    check('鼠标实际拖动可调整取景',js('document.querySelector(".visitor-crop-preview").toDataURL()')!=initial)
    click_text('重新居中')
    js('const z=document.querySelector(".visitor-crop-zoom input");z.value="2";z.dispatchEvent(new Event("input",{bubbles:true}))')
    check('缩放改变预览且读数同步',js('document.querySelector(".visitor-crop-zoom output").value==="200%"') and js('document.querySelector(".visitor-crop-preview").toDataURL()')!=initial)
    click_text('向左');shot('crop-desktop-light.png')
    js('document.documentElement.classList.add("dark")');shot('crop-desktop-dark.png')
    cdp('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
    check('手机端弹窗和页面无横向溢出',js('document.documentElement.scrollWidth<=innerWidth&&document.querySelector(".visitor-crop").getBoundingClientRect().width<=innerWidth'))
    shot('crop-mobile-dark.png')
    click_text('确认并上传');wait('window.avatarPosts.length===1&&!document.querySelector("input[type=file]").disabled')
    png=base64.b64decode(js('window.avatarPosts[0].png'))
    check('确认后只上传一次128×128 PNG',png[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack('!II',png[16:24])==(128,128))
    (OUT/'cropped-result.png').write_bytes(png)
    pixel=js('''(async()=>{const img=new Image();img.src='data:image/png;base64,'+window.avatarPosts[0].png;await img.decode();const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');x.drawImage(img,0,0);return [...x.getImageData(0,0,1,1).data]})()''')
    check('上传取景与移动缩放后的原图区域一致',abs(pixel[0]-156)<=2 and abs(pixel[1]-50)<=2 and pixel[2]==32)
    saved=js('document.querySelector(".visitor-account-header img").src')
    choose(bad);wait('!document.querySelector("input[type=file]").disabled')
    check('无效图片不打开空弹窗也不改头像',js('!document.querySelector(".visitor-crop")&&window.avatarPosts.length===1&&document.querySelector(".visitor-account-header img").src')==saved)
    js('window.avatarFail=true');choose();wait('document.querySelector(".visitor-crop[open]")');click_text('确认并上传');wait('window.avatarPosts.length===2&&!document.querySelector("input[type=file]").disabled')
    check('上传失败保留当前头像且可重新选择',js('document.querySelector(".visitor-account-header img").src')==saved and js('document.querySelector("input[type=file]").value===""'))
    js('window.avatarFail=false');choose();wait('document.querySelector(".visitor-crop[open]")');click_text('确认并上传');wait('window.avatarPosts.length===3&&!document.querySelector("input[type=file]").disabled')
    check('上传失败后重试可恢复',js('document.querySelector(".visitor-account-header img").src')!=saved)
    js('window.avatarHold=true');choose();wait('document.querySelector(".visitor-crop[open]")');click_text('确认并上传');wait('window.avatarPosts.length===4&&window.resolveAvatar')
    click_text('退出当前登录');wait('!document.querySelector("input[type=file]")')
    js('window.resolveAvatar();new Promise(resolve=>setTimeout(resolve,200))')
    check('退出后延迟头像响应不会复活旧账户',js('!document.querySelector("input[type=file]")&&document.querySelector("[data-account-state]").textContent.includes("登录 / 创建账户")'))
    (OUT/'results.json').write_bytes(json.dumps({'passed':len(passed),'checks':passed},ensure_ascii=False,indent=2).encode('utf-8'))
    print(json.dumps({'passed':len(passed),'evidence':str(OUT)},ensure_ascii=False),flush=True)
finally:
    process.terminate()
    try:process.wait(timeout=10)
    except subprocess.TimeoutExpired:process.kill()
