import asyncio,pathlib,tempfile,os
from playwright.async_api import async_playwright,expect
root=pathlib.Path(__file__).resolve().parent.parent;artifacts=pathlib.Path(tempfile.mkdtemp(prefix='f1-public-dashboard-'))
html=(root/'index.html').read_text();js=(root/'app.js').read_text()
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  async def setup(width,role=None,hash=''):
   context=await browser.new_context(viewport={'width':width,'height':1100},reduced_motion='reduce')
   if role:await context.add_init_script("sessionStorage.setItem('f1_session','"+('a' if role=='admin' else 'c')+"'.repeat(64))")
   page=await context.new_page();errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.route('https://juligg1506.github.io/f1-auction/**',lambda r:r.fulfill(content_type='text/html',body=html) if r.request.resource_type=='document' else r.continue_())
   await page.route('**/app.js?*',lambda r:r.fulfill(content_type='text/javascript',body=js+'\nwindow.testApi=apiRequest;'))
   async def api(route):
    path=route.request.url.split('/api/')[-1];requests.append(path)
    response=await page.request.fetch('http://127.0.0.1:8128/api/'+path,method=route.request.method,headers=route.request.headers,data=route.request.post_data)
    await route.fulfill(response=response)
   await page.route('**/api/**',api);await page.route('https://media.formula1.com/**',lambda r:r.abort())
   await page.goto('https://juligg1506.github.io/f1-auction/'+hash,wait_until='networkidle')
   return context,page,errors,requests
  for width in [1440,820,390,320]:
   context,page,errors,requests=await setup(width,hash='#teams')
   await expect(page).to_have_url('https://juligg1506.github.io/f1-auction/#dashboard')
   await expect(page.locator('#publicDashboard')).to_be_visible();await expect(page.locator('#app')).to_be_hidden()
   assert await page.locator('.nav-link:visible').count()==1
   assert await page.get_by_role('button',name='Mit Discord anmelden',exact=True).count()==1
   await expect(page.locator('#dashboardDrivers tbody tr')).to_have_count(2)
   await expect(page.locator('#dashboardTeams tbody tr')).to_have_count(2)
   await expect(page.locator('.calendar-entry')).to_have_count(2)
   assert not await page.locator('[data-auth-only]').is_visible()
   await page.evaluate("location.hash='auktionen'");await expect(page).to_have_url('https://juligg1506.github.io/f1-auction/#dashboard')
   assert all(path.startswith(('standings?','calendar?')) for path in requests),requests
   assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
   await page.screenshot(path=str(artifacts/f'dashboard-{width}.png'),full_page=True)
   await page.locator('#dashboardSeason').fill('2030');await page.locator('#dashboardFilter button').click()
   await expect(page.locator('#dashboardCalendar')).to_contain_text('Noch keine Renntermine')
   await expect(page.locator('#dashboardDrivers')).to_contain_text('Noch keine gewerteten')
   assert not errors,errors;await context.close();print(width,'PASS public standings/calendar, only Dashboard, direct-link guard, no member API calls, empty season, responsive',flush=True)
  # Explicit calendar consent publishes a date without publishing any results.
  admin,ap,ae,_=await setup(820,'admin',hash='#teams');await expect(ap.locator('#teams')).to_be_visible()
  await ap.locator('[data-view-link=administration]').click();await expect(ap.locator('#createRace')).to_be_visible()
  await ap.locator('#createRace input[name=raceName]').fill('Kalendertest')
  await ap.locator('#createRace input[name=raceDate]').fill('2027-01-02')
  assert await ap.locator('#createRace input[name=calendarVisible]').is_checked()
  await ap.locator('#createRace button').click();await ap.locator('#raceEditorForm').wait_for()
  assert await ap.locator('#raceEditorForm input[name=calendarVisible]').is_checked()
  await ap.locator('#closeRaceDialog').click()
  guest,gp,ge,_=await setup(390)
  await expect(gp.locator('#dashboardCalendar')).to_contain_text('Kalendertest')
  await expect(gp.locator('#dashboardNextRace')).to_contain_text('Kalendertest')
  await expect(gp.locator('#dashboardDrivers')).to_contain_text('33')
  await ap.locator('[data-view-link=rennergebnisse]').click()
  await ap.locator('.race-list-row').filter(has=ap.get_by_role('heading',name='Kalendertest',exact=True)).locator('button').click()
  await ap.locator('#raceEditorForm').wait_for()
  await ap.locator('#raceEditorForm input[name=calendarVisible]').uncheck()
  await ap.locator('.race-result-input button').click()
  await ap.locator('#saveRaceDraft').click();await expect(ap.locator('#raceDialog')).not_to_be_visible()
  await gp.locator('#dashboardFilter button').click();await expect(gp.locator('#dashboardCalendar')).not_to_contain_text('Kalendertest')
  assert not ae,ae;assert not ge,ge;await guest.close();await admin.close()
  # Expired sessions withdraw access immediately, including existing open dialogs.
  member,mp,me,_=await setup(820,'viewer',hash='#teams');await expect(mp.locator('#teams')).to_be_visible()
  await mp.route('**/api/teams',lambda r:r.fulfill(status=401,json={'error':'Abgelaufen'}))
  await mp.evaluate("window.testApi('/api/teams').catch(()=>{})")
  await expect(mp).to_have_url('https://juligg1506.github.io/f1-auction/#dashboard')
  await expect(mp.locator('#app')).to_be_hidden();assert await mp.locator('.nav-link:visible').count()==1
  await expect(mp.locator('#publicDashboard')).to_be_visible();assert not me,me;await member.close()
  print('PASS calendar consent/revocation, drafts excluded from standings, authenticated deep links and session expiry',flush=True)
  print('Screenshots:',artifacts,flush=True);await browser.close()
asyncio.run(main())
