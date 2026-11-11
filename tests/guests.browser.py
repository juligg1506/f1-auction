import asyncio,pathlib
from playwright.async_api import async_playwright,expect
root=pathlib.Path(__file__).resolve().parent.parent
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for width in [1440,390,320]:
   c=await b.new_context(viewport={'width':width,'height':1000},reduced_motion='reduce');page=await c.new_page();errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.route('https://juligg1506.github.io/f1-auction/**',lambda r:r.fulfill(content_type='text/html',body=(root/'index.html').read_text()) if r.request.resource_type=='document' else r.continue_())
   await page.route('**/app.js?*',lambda r:r.fulfill(content_type='text/javascript',body=(root/'app.js').read_text()))
   async def api(r):
    path=r.request.url.split('/api/')[-1];requests.append((r.request.method,path));response=await page.request.fetch('http://127.0.0.1:8128/api/'+path,method=r.request.method,headers=r.request.headers,data=r.request.post_data);await r.fulfill(response=response)
   await page.route('**/api/**',api)
   await page.goto('https://juligg1506.github.io/f1-auction/',wait_until='networkidle');await expect(page.locator('#entryScreen')).to_be_visible();assert not requests
   await page.locator('#cookieNecessary').click();await page.locator('#guestContinue').click();await expect(page.locator('.hero')).to_be_visible()
   for route,selector in [('teams','#teams'),('kalender','.dashboard-calendar'),('rennergebnisse','#results-section'),('liga','#leagueRules'),('livestream','#twitchConsentPanel')]:
    await page.evaluate('(r)=>location.hash=r',route);await expect(page.locator(selector)).to_be_visible()
   assert await page.locator('#twitchPlayer').get_attribute('src') is None
   await page.reload(wait_until='networkidle');await expect(page.locator('.stream-page')).to_be_visible()
   await page.evaluate("location.hash='fahrerstatistiken'");await expect(page.locator('#entryScreen')).to_be_visible();assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth');assert all(m=='GET' for m,path in requests);assert not any(path=='me' for m,path in requests);assert not errors,errors
   await page.unroute_all(behavior='ignoreErrors');await c.close();print('PASS',width,'guest choice, public views, persistence, private stats gate and cookies preserved',flush=True)
  await b.close()
asyncio.run(main())
