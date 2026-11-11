import asyncio,pathlib
from playwright.async_api import async_playwright,expect
root=pathlib.Path(__file__).resolve().parent.parent
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  for width in [1440,820,390,320]:
   for auth in [False,True]:
    c=await b.new_context(viewport={'width':width,'height':1000},reduced_motion='reduce')
    if auth:await c.add_init_script("sessionStorage.setItem('f1_session','c'.repeat(64))")
    page=await c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    await page.route('https://juligg1506.github.io/f1-auction/',lambda r:r.fulfill(content_type='text/html',body=(root/'index.html').read_text()))
    await page.route('**/app.js?*',lambda r:r.fulfill(content_type='text/javascript',body=(root/'app.js').read_text()))
    async def api(route):
     path=route.request.url.split('/api/')[-1]
     r=await page.request.fetch('http://127.0.0.1:8128/api/'+path,method=route.request.method,headers=route.request.headers,data=route.request.post_data)
     await route.fulfill(response=r)
    await page.route('**/api/**',api);await page.route('https://media.formula1.com/**',lambda r:r.abort())
    await page.goto('https://juligg1506.github.io/f1-auction/#teams',wait_until='networkidle')
    await expect(page.locator('.team-roster .racing-number').first).to_have_text('#8')
    await expect(page.locator('.team-roster .racing-number')).to_have_count(2)
    if auth:
     await page.locator('.team-roster .driver-link').first.click();await expect(page.locator('#driverDialogTitle')).to_contain_text('#8');await expect(page.locator('.profile-racing-number')).to_have_text('Startnummer #8');await page.locator('#closeDriver').click()
     await page.evaluate("location.hash='fahrerstatistiken'");await expect(page.locator('#ownStatistics')).to_contain_text('#7');await expect(page.locator('#statisticsList .racing-number')).to_have_count(2)
     await page.evaluate("location.hash='fahrerbereich'");await expect(page.locator('.number-guide')).to_be_visible();await page.locator('.number-rules summary').click();await expect(page.locator('#numberRules')).to_contain_text('#44 (Lewis Hamilton)');await expect(page.locator('.number-guide a')).to_have_attribute('href','https://discord.com/channels/1542175377961648128/1570008456981905460')
     await page.screenshot(path=str(root/'tests'/f'numbers-{width}.png'),full_page=True)
    else:
     await page.locator('.team-roster .driver-link').first.click();await expect(page.locator('#entryScreen')).to_be_visible()
    assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth'),width
    assert not errors,errors;await page.unroute_all(behavior='ignoreErrors');await c.close()
   print('PASS',width,'public team number, protected profile, own statistics and Discord channel guide',flush=True)
  await b.close()
asyncio.run(main())
