import asyncio,pathlib,tempfile,os
from playwright.async_api import async_playwright,expect
root=pathlib.Path(__file__).resolve().parent.parent
artifacts=root/'tests'/'screenshots';artifacts.mkdir(exist_ok=True)
html=(root/'index.html').read_text();js=(root/'app.js').read_text()
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  async def setup(width,token=None,hash=''):
   c=await browser.new_context(viewport={'width':width,'height':1000},reduced_motion='reduce')
   if token:await c.add_init_script("sessionStorage.setItem('f1_session','"+token+"'.repeat(64))")
   page=await c.new_page();errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.route('https://juligg1506.github.io/f1-auction/**',lambda r:r.fulfill(content_type='text/html',body=html) if r.request.resource_type=='document' else r.fulfill(content_type='text/javascript',body=''))
   await page.route('**/app.js?*',lambda r:r.fulfill(content_type='text/javascript',body=js))
   async def api(route):
    path=route.request.url.split('/api/')[-1];requests.append(path)
    response=await page.request.fetch('http://127.0.0.1:8128/api/'+path,method=route.request.method,headers=route.request.headers,data=route.request.post_data)
    await route.fulfill(response=response)
   await page.route('**/api/**',api);await page.route('https://media.formula1.com/**',lambda r:r.abort())
   await page.goto('https://juligg1506.github.io/f1-auction/'+hash,wait_until='networkidle');return c,page,errors,requests
  async def nav(page,key):
   if await page.locator('#menuToggle').is_visible():await page.locator('#menuToggle').click()
   await page.locator('[data-view-link='+key+']').click()
  for width in [1440,820,390,320]:
   c,page,errors,requests=await setup(width)
   await expect(page.locator('.hero')).to_be_visible();await expect(page.locator('#entryScreen')).to_be_hidden()
   await expect(page.locator('#leagueSeasonLabel')).to_have_text('Noch offen')
   assert not any(x.split('?')[0] in ['me','drivers','auctions','transfers','driver-stats'] for x in requests),requests
   await page.screenshot(path=str(artifacts/f'start-{width}.png'),full_page=True)
   await nav(page,'kalender');await expect(page.locator('.dashboard-calendar')).to_be_visible();await expect(page.locator('.hero')).to_be_hidden()
   await nav(page,'rennergebnisse');await expect(page.locator('.race-list-row')).to_have_count(3)
   await page.locator('.race-list-row').first.locator('button').click();await expect(page.locator('#raceDialog')).to_be_visible();await page.locator('#closeRaceDialog').click()
   await nav(page,'teams');await expect(page.locator('#teams .team-profile')).to_have_count(2);await expect(page.locator('.team-budget')).to_have_count(0)
   await page.locator('.team-roster .driver-link').first.click();await expect(page.locator('#entryScreen')).to_be_visible();assert page.url.endswith('#anmeldung')
   await page.locator('#guestContinue').click();await expect(page.locator('.hero')).to_be_visible()
   await nav(page,'fahrerbereich');await expect(page.locator('#entryScreen')).to_be_visible();await expect(page.locator('#login')).to_be_visible()
   assert await page.locator('#app').get_by_role('button',name='Gebot abgeben').count()==0
   assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth'),width
   assert not errors,errors;await page.unroute_all(behavior='ignoreErrors');await c.close();print('PASS public routes, private login redirect and responsive width',width,flush=True)
  c,page,errors,requests=await setup(820,'c','#fahrerstatistiken')
  await expect(page.locator('#ownStatistics')).to_be_visible();await expect(page.locator('#ownStatistics')).to_contain_text('Theo neu');await expect(page.locator('#ownStatistics')).to_contain_text('33')
  await page.get_by_role('button',name='Mein Fahrerprofil öffnen').click();await expect(page.locator('#driverDialogTitle')).to_have_text('Theo neu');await page.locator('#closeDriver').click()
  await nav(page,'auktionen');await expect(page.locator('#auctionPage')).to_be_visible();await expect(page.locator('#bidButton')).to_have_count(0)
  assert not errors,errors;await page.unroute_all(behavior='ignoreErrors');await c.close();print('PASS Discord-linked own stats and member-only auctions',flush=True)
  c,page,errors,requests=await setup(1440,'a','#administration')
  await expect(page.locator('#leagueSeasonForm')).to_be_visible();await expect(page.locator('#newRaceSeason')).to_have_value('')
  await page.locator('#leagueSeasonInput').fill('Saison 1');await page.locator('#leagueSeasonForm button').click();await expect(page.locator('#leagueAdminNotice')).to_have_text('Saison gespeichert.')
  await page.locator('#contentTitle').fill('Browser-Nachricht');await page.locator('#contentBody').fill('<img src=x onerror=alert(1)>\nNachricht der Ligaleitung.');await page.locator('#leagueContentForm button').click();await expect(page.locator('#leagueAdminNotice')).to_have_text('Inhalt gespeichert.')
  await nav(page,'start');await expect(page.locator('#leagueNews')).not_to_contain_text('Browser-Nachricht')
  await nav(page,'administration');await page.locator('#contentList').get_by_role('button',name='Browser-Nachricht · Entwurf').click();await page.locator('#contentStatus').select_option('published');page.once('dialog',lambda d:d.accept());await page.locator('#leagueContentForm button').click();await expect(page.locator('#leagueAdminNotice')).to_have_text('Inhalt gespeichert.')
  await nav(page,'start');await expect(page.locator('#leagueNews')).to_contain_text('Browser-Nachricht');await expect(page.locator('#leagueNews img')).to_have_count(0);await expect(page.locator('#leagueSeasonLabel')).to_have_text('Saison 1')
  assert not errors,errors;await page.unroute_all(behavior='ignoreErrors');await c.close();print('PASS admin season, draft publication and safe plain text content',flush=True)
  await browser.close()
asyncio.run(main())
