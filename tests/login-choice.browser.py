import asyncio,pathlib,tempfile,os
from playwright.async_api import async_playwright,expect
root=pathlib.Path(__file__).resolve().parent.parent;artifacts=pathlib.Path(tempfile.mkdtemp(prefix='f1-login-choice-'))
html=(root/'index.html').read_text();js=(root/'app.js').read_text()
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  for width in [1440,820,390,320]:
   c=await b.new_context(viewport={'width':width,'height':1100},reduced_motion='reduce');page=await c.new_page();errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.route('https://juligg1506.github.io/f1-auction/**',lambda r:r.fulfill(content_type='text/html',body=html) if r.request.resource_type=='document' else r.continue_())
   await page.route('**/app.js?*',lambda r:r.fulfill(content_type='text/javascript',body=js))
   async def api(route):
    path=route.request.url.split('/api/')[-1].split('?')[0];requests.append((path,route.request.headers.get('authorization')))
    data={'standings':{'drivers':[],'teams':[]},'calendar':{'calendar':[],'seasons':[]},'features':{'version':2},'me':{'username':'Testchef','admin':False,'team':None},'drivers':{'drivers':[]},'teams':{'teams':[]},'auctions':{'auction':None,'serverTime':'2026-11-10T14:00:00Z'},'transfers':{'transfers':[]},'logout':{'ok':True}}
    await route.fulfill(json=data.get(path,{}),status=200 if path in data else 404)
   await page.route('**/api/**',api)
   await page.goto('https://juligg1506.github.io/f1-auction/',wait_until='networkidle')
   login=page.get_by_role('button',name='Mit Discord anmelden',exact=True)
   await expect(login).to_have_count(1);assert await page.locator('.topbar #login').count()==0
   box=await login.bounding_box();assert box['height']>=64 and box['width']>=230,box
   await expect(page.locator('#guestContinue')).to_be_visible();await expect(page.locator('#publicDashboard')).to_be_hidden()
   assert await page.locator('.nav-link:visible').count()==0
   await page.screenshot(path=str(artifacts/f'login-{width}.png'),full_page=True)
   await page.locator('#guestContinue').click()
   await expect(page.locator('#guestSession')).to_be_visible();await expect(page.locator('#loginChoice')).to_be_hidden()
   assert await page.evaluate("sessionStorage.getItem('f1_guest_readonly_v2')")=='1'
   assert await page.evaluate("sessionStorage.getItem('f1_session')") is None
   assert all(auth is None and path!='me' for path,auth in requests),requests
   await page.reload(wait_until='networkidle');await expect(page.locator('#guestSession')).to_be_visible();await expect(page.locator('#app')).to_be_visible()
   await page.evaluate("location.hash='auktionen'");await expect(page).to_have_url('https://juligg1506.github.io/f1-auction/#auktionen')
   await page.locator('#returnToLogin').click();await expect(login).to_be_visible()
   assert await login.evaluate('e=>e===document.activeElement')
   await page.route('**/auth/start',lambda r:r.fulfill(content_type='text/html',body='OAuth-Test'))
   await login.click();await page.wait_for_url('**/auth/start')
   await page.goto('https://juligg1506.github.io/f1-auction/#session='+'a'*64,wait_until='networkidle')
   await expect(page.locator('#app')).to_be_visible();await expect(page.locator('#guest')).to_be_hidden()
   await expect(page.locator('#logout')).to_be_visible()
   assert await page.evaluate("sessionStorage.getItem('f1_guest_readonly_v2')") is None
   assert await page.locator('.nav-link:visible').count()==5
   await page.locator('#logout').click();await expect(page.locator('#login')).to_be_visible()
   await expect(page.locator('#accountActions')).to_be_hidden();await expect(page.locator('#guestSession')).to_be_hidden()
   assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
   assert not errors,errors;await c.close();print(width,'PASS large single central login, guest choice/persistence/restrictions, switch to Discord, callback and logout, responsive',flush=True)
  await b.close();print('Screenshots:',artifacts,flush=True)
asyncio.run(main())

