import asyncio,pathlib,tempfile,os
from playwright.async_api import async_playwright,expect
root=pathlib.Path(__file__).resolve().parent.parent
artifacts=pathlib.Path(tempfile.mkdtemp(prefix='f1-race-browser-'))
html=(root/'index.html').read_text();js=(root/'app.js').read_text()
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  async def setup(width,role='admin',legacy=False):
   context=await browser.new_context(viewport={'width':width,'height':1100},reduced_motion='reduce')
   token='a' if role=='admin' else 'c'
   await context.add_init_script(f"sessionStorage.setItem('f1_session','{token}'.repeat(64))")
   page=await context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.route('https://juligg1506.github.io/f1-auction/',lambda r:r.fulfill(content_type='text/html',body=html))
   await page.route('**/app.js?*',lambda r:r.fulfill(content_type='text/javascript',body=js))
   async def api(route):
    path=route.request.url.split('/api/')[1]
    if legacy and path=='features':await route.fulfill(json={'version':2});return
    response=await page.request.fetch('http://127.0.0.1:8128/api/'+path,method=route.request.method,headers=route.request.headers,data=route.request.post_data)
    await route.fulfill(response=response)
   await page.route('**/api/**',api)
   await page.route('https://media.formula1.com/**',lambda r:r.abort())
   await page.goto('https://juligg1506.github.io/f1-auction/',wait_until='networkidle')
   return context,page,errors
  for width in [1440,820,390,320]:
   context,page,errors=await setup(width)
   await page.locator('[data-view-link=administration]').click()
   await expect(page.locator('#raceCreateSection')).to_be_visible()
   name=f'Browser-Test {width}'
   await page.locator('#createRace input[name=raceName]').fill(name)
   await page.locator('#createRace input[name=raceDate]').fill('2026-11-11')
   await page.locator('#createRace button').click()
   await page.locator('#raceEditorForm').wait_for()
   rows=page.locator('.race-result-input')
   await rows.first.locator('.race-driver').select_option('1')
   await rows.first.locator('.race-team').select_option('1')
   await expect(rows.first.locator('.race-points')).to_have_text('25')
   await page.locator('#addRaceResult').click()
   await rows.nth(1).locator('.race-driver').select_option('2')
   await rows.nth(1).locator('.race-team').select_option('2')
   await rows.nth(1).locator('.race-result-status').select_option('dnf')
   await expect(rows.nth(1).locator('.race-points')).to_have_text('0')
   await expect(rows.nth(1).locator('.race-position')).to_be_disabled()
   await rows.nth(1).locator('.race-result-status').select_option('classified')
   await rows.nth(1).locator('.race-position').fill('2')
   await expect(rows.nth(1).locator('.race-points')).to_have_text('18')
   await page.locator('#saveRaceDraft').click()
   await expect(page.locator('#raceDialog')).not_to_be_visible()
   race=page.locator('.race-list-row').filter(has=page.get_by_role('heading',name=name,exact=True))
   await expect(race).to_contain_text('Entwurf')
   await race.locator('button').click()
   await page.locator('#raceEditorForm').wait_for()
   await expect(page.locator('.race-result-input')).to_have_count(2)
   await expect(page.locator('.race-team').first).to_have_value('1')
   # Client catches duplicate drivers and retains entered data.
   await page.locator('.race-driver').nth(1).select_option('1')
   await page.locator('#publishRace').click()
   await expect(page.locator('#raceEditorNotice')).to_contain_text('nur einmal')
   await page.locator('.race-driver').nth(1).select_option('2')
   page.once('dialog',lambda d:d.accept())
   await page.locator('#publishRace').click()
   await expect(page.locator('#raceDialog')).not_to_be_visible()
   await expect(race).to_contain_text('Veröffentlicht')
   assert await page.locator('#driverStandings tbody tr').count()>=2
   assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
   await race.locator('button').click()
   await page.locator('#raceEditorForm').wait_for()
   await page.locator('.race-position').first.fill('3')
   await expect(page.locator('.race-points').first).to_have_text('15')
   await page.screenshot(path=str(artifacts/f'preview-race-editor-{width}.png'))
   assert not await page.locator('#raceDialog').evaluate('d=>d.scrollWidth>d.clientWidth')
   await page.locator('#closeRaceDialog').click()
   await page.locator('[data-view-link=administration]').click()
   await page.locator('#createRace input[name=raceName]').fill(name)
   await page.locator('#createRace button').click()
   await expect(page.locator('#raceCreateNotice')).to_contain_text('bereits vorhanden')
   assert not errors,errors
   await page.unroute_all(behavior='ignoreErrors');await context.close()
   print(width,'PASS actual worker: draft/create/edit/publish, driver/team persistence, duplicates, points, mobile scrolling',flush=True)
  context,page,errors=await setup(390,'viewer')
  await page.locator('[data-view-link=rennergebnisse]').click()
  await expect(page.locator('#raceCreateSection')).to_be_hidden()
  await expect(page.locator('.race-list-row').first.locator('button')).to_have_text('Ergebnisse ansehen')
  await page.locator('.race-list-row').filter(has=page.get_by_role('heading',name='Browser-Test 320',exact=True)).locator('button').click()
  await expect(page.locator('#raceDialogBody tbody tr')).to_have_count(2)
  assert await page.locator('#publishRace').count()==0
  await page.keyboard.press('Escape');await expect(page.locator('#raceDialog')).not_to_be_visible()
  assert not errors,errors
  await page.unroute_all(behavior='ignoreErrors');await context.close()
  context,page,errors=await setup(820,'admin',True)
  await expect(page.locator('#raceCreateSection')).to_be_hidden()
  await expect(page.locator('#raceList')).to_have_text('Noch keine Rennergebnisse verfügbar.')
  assert not errors,errors
  await page.unroute_all(behavior='ignoreErrors');await context.close();await browser.close()
  print('PASS spectator read-only and old-worker fallback',flush=True)
asyncio.run(main())


