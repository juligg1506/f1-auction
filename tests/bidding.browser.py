import asyncio,pathlib,tempfile,os
from datetime import datetime,timedelta,timezone
from playwright.async_api import async_playwright,expect
root=pathlib.Path(__file__).resolve().parent.parent;artifacts=pathlib.Path(tempfile.mkdtemp(prefix='f1-bids-'))
html=(root/'index.html').read_text();js=(root/'app.js').read_text()
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  for width in [1440,820,390,320]:
   c=await b.new_context(viewport={'width':width,'height':1100},reduced_motion='reduce');await c.add_init_script("sessionStorage.setItem('f1_session','a'.repeat(64))")
   page=await c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   state={'budget':10000000,'highest':2500000,'leader':2,'expired':False,'auction':True,'posts':[],'rejected':False,'viewer':False}
   async def api(route):
    path=route.request.url.split('/api/')[-1].split('?')[0];now=datetime.now(timezone.utc);status=200
    data={}
    if path=='me':data={'username':'Testchef','admin':False,'team':None if state['viewer'] else {'id':1,'name':'Ferrari','budget':state['budget']}}
    elif path=='teams':data={'teams':[]}
    elif path=='drivers':data={'drivers':[{'id':1,'name':'Theo'}]}
    elif path=='features':data={'version':2}
    elif path=='transfers':data={'transfers':[]}
    elif path=='auctions':data={'auction':{'id':1,'driverId':1,'driverName':'Theo de Vries','startingPrice':2500000,'highestBid':state['highest'],'leadingTeamId':state['leader'],'leadingTeamName':'Ferrari' if state['leader']==1 else 'McLaren','endsAt':(now+timedelta(seconds=-1 if state['expired'] else 90)).isoformat(),'bids':[{'id':i+1,'teamId':2,'teamName':'McLaren','amount':2500000,'createdAt':now.isoformat()} for i in range(20)]} if state['auction'] else None,'serverTime':now.isoformat(),'features':{'antiSnipeSeconds':15}}
    elif path=='auctions/bid':
     state['posts'].append(route.request.post_data_json);await asyncio.sleep(.2)
     if state['rejected']:data={'error':'Gebot zwischenzeitlich überboten'};status=409
     else:
      amount=route.request.post_data_json['amount'];state.update(highest=amount,leader=1,budget=state['budget']-amount);data={'ok':True,'amount':amount}
    else:status=404;data={'error':'Not found'}
    await route.fulfill(status=status,json=data)
   await page.route('**/api/**',api)
   await page.route('https://juligg1506.github.io/f1-auction/**',lambda r:r.fulfill(content_type='text/html',body=html) if r.request.resource_type=='document' else r.continue_())
   await page.route('**/app.js?*',lambda r:r.fulfill(content_type='text/javascript',body=js+'\nwindow.testRefresh=loadAuction;window.testBoot=boot;'))
   await page.goto('https://juligg1506.github.io/f1-auction/#auktionen',wait_until='networkidle')
   await expect(page.locator('#auctionPage')).to_be_visible();await expect(page.locator('.hero')).to_be_hidden()
   amount=page.locator('.bid-controls strong')
   await expect(amount).to_contain_text('2.750.000')
   await page.get_by_role('button',name='Gebot um 250.000 Coins erhöhen',exact=True).click();await expect(amount).to_contain_text('3.000.000')
   await page.get_by_role('button',name='Gebot um 250.000 Coins verringern',exact=True).click();await expect(amount).to_contain_text('2.750.000')
   await page.get_by_role('button',name='Gebot um 1.000.000 Coins erhöhen',exact=True).click();await expect(amount).to_contain_text('3.750.000')
   await expect(page.locator('.bid-budget-preview')).to_contain_text('6.250.000')
   await page.get_by_role('button',name='Mindestgebot auswählen').click();await expect(amount).to_contain_text('2.750.000')
   await page.locator('[data-auction-focus=plus]').focus()
   await page.locator('.bid-history-list').evaluate('e=>e.scrollTop=80')
   await page.evaluate('window.testRefresh()')
   assert await page.locator('[data-auction-focus=plus]').evaluate('e=>e===document.activeElement')
   assert await page.locator('.bid-history-list').evaluate('e=>e.scrollTop')==80
   page.once('dialog',lambda d:d.dismiss());await page.locator('#bidButton').click();assert len(state['posts'])==0
   state['rejected']=True;page.once('dialog',lambda d:d.accept());await page.locator('#bidButton').click()
   await expect(page.locator('#auctionNotice')).to_contain_text('Gebot fehlgeschlagen')
   await expect(page.locator('#bidButton')).to_be_enabled()
   await expect(page.locator('#notice')).to_be_hidden();await expect(page.locator('#auctionNotice')).to_be_visible()
   state['rejected']=False;await page.locator('[data-auction-focus=plus]').click();await expect(amount).to_contain_text('3.000.000')
   await page.screenshot(path=str(artifacts/f'bidding-{width}.png'))
   page.once('dialog',lambda d:d.accept())
   await page.locator('#bidButton').evaluate("button=>{button.click();button.dispatchEvent(new MouseEvent('click',{bubbles:true}));}")
   await expect(page.locator('.bid-leading')).to_be_visible()
   assert len(state['posts'])==2;assert state['posts'][-1]=={'auctionId':1,'amount':3000000}
   assert state['budget']==7000000
   state.update(leader=2,highest=3250000,budget=1000000)
   await page.evaluate('window.testBoot()');await expect(page.locator('#bidButton')).to_be_disabled();await expect(page.locator('.bid-warning')).to_contain_text('Budget')
   state.update(budget=10000000,expired=True);await page.evaluate('window.testBoot()')
   await expect(page.locator('#auctionTimer')).to_have_class('stat red is-expired')
   for button in await page.locator('.bid-controls button,.bid-shortcuts button,#bidButton').all():assert await button.is_disabled()
   state.update(expired=False,viewer=True);await page.evaluate('window.testBoot()');await expect(page.locator('#bidButton')).to_have_count(0)
   state['auction']=False;await page.evaluate('window.testRefresh()');await expect(page.locator('.auction-empty')).to_be_visible()
   assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth');assert not errors,errors
   await c.close();print(width,'PASS bid steps/shortcuts/budget, cancel, rejection, one POST on double-click, leader/viewer/expired/empty, focus/history preservation',flush=True)
  await b.close();print('Screenshots:',artifacts,flush=True)
asyncio.run(main())
