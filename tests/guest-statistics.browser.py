import asyncio,pathlib,tempfile,os
from playwright.async_api import async_playwright,expect
root=pathlib.Path(__file__).resolve().parent.parent;artifacts=pathlib.Path(tempfile.mkdtemp(prefix='f1-guest-statistics-'))
html=(root/'index.html').read_text();js=(root/'app.js').read_text()
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  async def setup(width,token=None,hash=''):
   c=await b.new_context(viewport={'width':width,'height':1100},reduced_motion='reduce')
   if token:await c.add_init_script("sessionStorage.setItem('f1_session','"+token+"'.repeat(64))")
   page=await c.new_page();errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.route('https://juligg1506.github.io/f1-auction/**',lambda r:r.fulfill(content_type='text/html',body=html) if r.request.resource_type=='document' else r.continue_())
   await page.route('**/app.js?*',lambda r:r.fulfill(content_type='text/javascript',body=js))
   async def api(route):
    path=route.request.url.split('/api/')[-1];requests.append((route.request.method,path))
    response=await page.request.fetch('http://127.0.0.1:8128/api/'+path,method=route.request.method,headers=route.request.headers,data=route.request.post_data)
    await route.fulfill(response=response)
   await page.route('**/api/**',api);await page.route('https://media.formula1.com/**',lambda r:r.abort())
   await page.goto('https://juligg1506.github.io/f1-auction/'+hash,wait_until='networkidle');return c,page,errors,requests
  for width in [1440,820,390,320]:
   c,page,errors,requests=await setup(width,hash='#teams')
   await expect(page).to_have_url('https://juligg1506.github.io/f1-auction/#anmeldung')
   await expect(page.locator('#entryScreen')).to_be_visible();await expect(page.locator('#publicDashboard')).to_be_hidden();await expect(page.locator('.sidebar')).to_be_hidden()
   assert len(requests)==0,requests;assert await page.get_by_role('button').count()==2
   await page.screenshot(path=str(artifacts/f'entry-{width}.png'),full_page=True)
   await page.locator('#guestContinue').click();await expect(page.locator('#publicDashboard')).to_be_visible();await expect(page.locator('#entryScreen')).to_be_hidden()
   assert await page.locator('.nav-link:visible').count()==5
   await page.locator('[data-view-link=auktionen]').click();await expect(page.locator('.auction-overview')).to_be_visible();await expect(page.locator('#bidButton')).to_have_count(0)
   await page.locator('[data-view-link=teams]').click();await expect(page.locator('#teams .team-profile')).to_have_count(2)
   await page.locator('[data-view-link=rennergebnisse]').click();await expect(page.locator('.race-list-row')).to_have_count(3)
   await expect(page.locator('.race-list-row').first.locator('button')).to_have_text('Ergebnisse ansehen')
   await page.locator('.race-list-row').first.locator('button').click();await expect(page.locator('#raceDialogBody tbody tr')).to_have_count(3);assert await page.locator('#publishRace').count()==0
   await page.locator('#closeRaceDialog').click()
   await page.locator('[data-view-link=fahrerstatistiken]').click();await expect(page.locator('#statisticsList tbody tr')).to_have_count(4)
   await expect(page.locator('#ownStatistics')).to_be_hidden()
   await page.locator('#statisticsList').get_by_role('button',name='Theo neu',exact=True).click()
   await expect(page.locator('.driver-stat-grid')).to_be_visible();await expect(page.locator('.driver-stat-grid')).to_contain_text('33')
   await expect(page.locator('.driver-statistics tbody tr')).to_have_count(3)
   await page.screenshot(path=str(artifacts/f'statistics-{width}.png'))
   await page.locator('#closeDriver').click()
   assert all(method=='GET' for method,path in requests),requests
   assert not any(path=='me' for method,path in requests),requests
   await page.reload(wait_until='networkidle');await expect(page.locator('#statistics-section')).to_be_visible()
   await page.evaluate("location.hash='administration'");await expect(page).to_have_url('https://juligg1506.github.io/f1-auction/#dashboard')
   assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
   await page.locator('#returnToLogin').click();await expect(page.locator('#entryScreen')).to_be_visible();await expect(page.locator('#publicDashboard')).to_be_hidden()
   assert await page.get_by_role('button').count()==2
   assert not errors,errors;await page.unroute_all(behavior='ignoreErrors');await c.close();print(width,'PASS entry only; guest all public views, live auction without bidding, results read-only, profile stats, persistence and exit',flush=True)
  c,page,errors,requests=await setup(820,token='c',hash='#fahrerstatistiken')
  await expect(page.locator('#ownStatistics')).to_be_visible();await expect(page.locator('#ownStatistics')).to_contain_text('Theo neu');await expect(page.locator('#ownStatistics')).to_contain_text('33')
  await page.get_by_role('button',name='Mein Fahrerprofil öffnen').click();await expect(page.locator('#driverDialogTitle')).to_have_text('Theo neu');await page.locator('#closeDriver').click()
  await page.locator('#statisticsSeason').fill('2027');await page.locator('#statisticsFilter button').click()
  await expect(page.locator('#ownStatistics .driver-stat dd').first).to_have_text('0')
  assert not errors,errors;await page.unroute_all(behavior='ignoreErrors');await c.close()
  c,page,errors,requests=await setup(820,token='b',hash='#fahrerstatistiken')
  await expect(page.locator('#driverLinkHint')).to_be_visible();await expect(page.locator('#ownStatistics')).to_be_hidden();assert not errors,errors;await page.unroute_all(behavior='ignoreErrors');await c.close()
  print('PASS own profile via Discord ID, season filtering, unlinked account has no fabricated own statistics',flush=True);print('Screenshots:',artifacts,flush=True);await b.close()
asyncio.run(main())
