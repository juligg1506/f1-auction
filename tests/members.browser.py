import asyncio,pathlib
from playwright.async_api import async_playwright,expect
root=pathlib.Path(__file__).resolve().parent.parent
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  async def setup(width,token=None,hash=''):
   c=await b.new_context(viewport={'width':width,'height':1000},reduced_motion='reduce')
   if token:await c.add_init_script("sessionStorage.setItem('f1_session','"+token+"'.repeat(64))")
   page=await c.new_page();errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.route('https://juligg1506.github.io/f1-auction/**',lambda r:r.fulfill(content_type='text/html',body=(root/'index.html').read_text()) if r.request.resource_type=='document' else r.continue_())
   await page.route('**/app.js?*',lambda r:r.fulfill(content_type='text/javascript',body=(root/'app.js').read_text()))
   async def api(r):
    path=r.request.url.split('/api/')[-1];requests.append(path)
    response=await page.request.fetch('http://127.0.0.1:8128/api/'+path,method=r.request.method,headers=r.request.headers,data=r.request.post_data)
    await r.fulfill(response=response)
   await page.route('**/api/**',api)
   await page.goto('https://juligg1506.github.io/f1-auction/'+hash,wait_until='networkidle');return c,page,errors,requests
  for width in [1440,820,390,320]:
   c,page,errors,requests=await setup(width,hash='#teams')
   for route in ['start','kalender','teams','rennergebnisse','liga','livestream','fahrerbereich','fahrerstatistiken','auktionen','administration']:
    await page.evaluate('(route)=>location.hash=route',route);await expect(page.locator('#entryScreen')).to_be_visible();await expect(page.locator('.sidebar')).to_be_hidden();await expect(page.locator('.hero')).to_be_hidden();assert page.url.endswith('#anmeldung')
   assert not requests,requests;await expect(page.locator('#guestContinue')).to_have_count(1);assert await page.locator('[data-page-view]:visible').count()==0
   assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth');assert not errors,errors
   if width==390:await page.screenshot(path=str(root/'tests/login-members-390.png'),full_page=True)
   await page.unroute_all(behavior='ignoreErrors');await c.close()
   c,page,errors,requests=await setup(width,'c','#start');await expect(page.locator('.hero')).to_be_visible();await expect(page.locator('#entryScreen')).to_be_hidden();await expect(page.locator('[data-view-link=administration]')).to_be_hidden()
   await page.evaluate("location.hash='teams'");await expect(page.locator('.team-profile')).to_have_count(2)
   await page.evaluate("location.hash='livestream'");await expect(page.locator('#twitchConsentPanel')).to_be_visible();assert await page.locator('#twitchPlayer').get_attribute('src') is None
   await page.route('**/api/me',lambda r:r.fulfill(status=401,json={'error':'Kein Servermitglied'}));await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))");await expect(page.locator('#entryScreen')).to_be_visible();assert await page.evaluate("sessionStorage.getItem('f1_session')") is None
   assert not errors,errors;await page.unroute_all(behavior='ignoreErrors');await c.close();print('PASS',width,'anonymous sees login only with zero API calls; member without roles accesses pages; membership loss closes UI',flush=True)
  c,page,errors,requests=await setup(820,'d','#teams');await expect(page.locator('#entryScreen')).to_be_visible();await expect(page.locator('.hero')).to_be_hidden();assert await page.evaluate("sessionStorage.getItem('f1_session')") is None;assert not errors,errors;await page.unroute_all(behavior='ignoreErrors');await c.close();await b.close()
asyncio.run(main())
