import asyncio,pathlib,tempfile,os
from playwright.async_api import async_playwright,expect
root=pathlib.Path(__file__).resolve().parent.parent;artifacts=pathlib.Path(tempfile.mkdtemp(prefix='f1-navigation-test-')); html=(root/'index.html').read_text();js=(root/'app.js').read_text()
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  async def setup(width,admin=True,logged=True,hash=''):
   c=await b.new_context(viewport={'width':width,'height':1100},reduced_motion='reduce')
   if logged:await c.add_init_script("sessionStorage.setItem('f1_session','a'.repeat(64))")
   page=await c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.route('https://juligg1506.github.io/f1-auction/**',lambda r:r.fulfill(content_type='text/html',body=html) if r.request.resource_type=='document' else r.continue_())
   await page.route('**/app.js?*',lambda r:r.fulfill(content_type='text/javascript',body=js))
   async def api(route):
    path=route.request.url.split('/api/')[-1].split('?')[0]
    race={'id':1,'name':'Österreich','season':'2026','raceDate':'2026-11-10','status':'published','revision':1}
    data={'me':{'username':'Test','admin':admin,'team':{'id':1,'name':'Ferrari','budget':100000000}},'teams':{'teams':[{'id':1,'name':'Ferrari','budget':100000000,'drivers':[]}]},'drivers':{'drivers':[{'id':1,'name':'Theo'}]},'features':{'version':2,'raceResults':True,'discordConfigured':True},'auctions':{'auction':None,'serverTime':'2026-11-10T12:00:00Z'},'transfers':{'transfers':[]},'admin/queue':{'queue':[]},'admin/races/options':{'drivers':[{'id':1,'name':'Theo','teamId':1,'active':1}],'teams':[{'id':1,'name':'Ferrari'}]},'races':{'races':[race],'seasons':['2026'],'pointsSystem':[25,18,15,12,10,8,6,4,2,1]},'admin/races':{'races':[race],'seasons':['2026'],'pointsSystem':[25,18,15,12,10,8,6,4,2,1]},'standings':{'drivers':[{'rank':1,'name':'Theo','points':25,'wins':1}],'teams':[{'rank':1,'name':'Ferrari','points':25,'wins':1}]},'admin/races/1':{'race':race,'results':[{'driverId':1,'driverName':'Theo','teamId':1,'teamName':'Ferrari','position':1,'status':'classified','points':25}],'pointsSystem':[25,18,15,12,10,8,6,4,2,1]}}
    await route.fulfill(json=data.get(path,{'error':'Not found'}),status=200 if path in data else 404)
   await page.route('**/api/**',api);await page.route('https://media.formula1.com/**',lambda r:r.abort())
   await page.goto('https://juligg1506.github.io/f1-auction/'+hash,wait_until='networkidle')
   return c,page,errors
  for width in [1440,820,390,320]:
   c,page,errors=await setup(width)
   await expect(page.locator('.summary-grid')).to_be_visible();await expect(page.locator('#results-section')).to_be_hidden();await expect(page.locator('#teams')).to_be_hidden();await expect(page.locator('#admin')).to_be_hidden()
   await page.locator('[data-view-link=rennergebnisse]').click()
   await expect(page).to_have_url('https://juligg1506.github.io/f1-auction/#rennergebnisse')
   await expect(page.locator('#results-section')).to_be_visible();await expect(page.locator('.hero')).to_be_hidden();await expect(page.locator('.summary-grid')).to_be_hidden();await expect(page.locator('.transfers-section')).to_be_hidden()
   await expect(page.locator('[data-view-link=rennergebnisse]')).to_have_attribute('aria-current','page')
   await page.locator('[data-view-link=teams]').click();await expect(page.locator('#teams')).to_be_visible();await expect(page.locator('#results-section')).to_be_hidden()
   await page.go_back();await expect(page.locator('#results-section')).to_be_visible()
   await page.go_forward();await expect(page.locator('#teams')).to_be_visible()
   await page.reload(wait_until='networkidle');await expect(page.locator('#teams')).to_be_visible()
   await page.locator('[data-view-link=auktionen]').click();await expect(page.locator('#auctionPage')).to_be_visible();await expect(page).to_have_url('https://juligg1506.github.io/f1-auction/#auktionen');await expect(page.locator('#teams')).to_be_hidden();await page.go_back();await expect(page.locator('#teams')).to_be_visible()
   await page.locator('[data-view-link=administration]').click();await expect(page.locator('#admin')).to_be_visible();await expect(page.locator('#createRace')).to_be_visible();await expect(page.locator('#teams')).to_be_hidden()
   await page.locator('[data-view-link=rennergebnisse]').click();await page.locator('.race-list-row button').click();await expect(page.locator('#raceDialog')).to_be_visible();await expect(page.locator('#raceEditorForm')).to_be_visible();await page.locator('#closeRaceDialog').click()
   assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
   await page.screenshot(path=str(artifacts/f'view-{width}.png'))
   assert not errors,errors;await c.close();print(width,'PASS navigation, separate views, history, refresh, dialogs, responsive',flush=True)
  c,page,errors=await setup(820,admin=False,hash='#administration');await expect(page).to_have_url('https://juligg1506.github.io/f1-auction/#dashboard');await expect(page.locator('[data-view-link=administration]')).to_be_hidden();assert not errors;await c.close()
  c,page,errors=await setup(820,hash='#results-section');await expect(page).to_have_url('https://juligg1506.github.io/f1-auction/#rennergebnisse');await expect(page.locator('#results-section')).to_be_visible();await c.close()
  c,page,errors=await setup(820,logged=False,hash='#rennergebnisse');await expect(page.locator('#app')).to_be_hidden();await expect(page.locator('#guest')).to_be_visible()
  await page.route('**/auth/start',lambda r:r.fulfill(content_type='text/html',body='OAuth-Test'))
  await page.locator('#login').click();await page.wait_for_url('**/auth/start');await page.goto('https://juligg1506.github.io/f1-auction/#session='+'a'*64,wait_until='networkidle');await expect(page.locator('#results-section')).to_be_visible();await expect(page).to_have_url('https://juligg1506.github.io/f1-auction/#rennergebnisse');assert not errors,errors;await c.close()
  await b.close();print('PASS admin access, old links, direct results link and OAuth return view',flush=True)
asyncio.run(main())

