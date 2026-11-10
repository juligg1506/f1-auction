import asyncio,pathlib,tempfile,os
from datetime import datetime,timedelta,timezone
from playwright.async_api import async_playwright
async def main():
 pth=pathlib.Path(__file__).resolve().parent.parent;html=(pth/'index.html').read_text();js=(pth/'app.js').read_text();artifacts=pathlib.Path(tempfile.mkdtemp(prefix='f1-browser-test-'))
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  for width,mode in [(1440,'admin'),(820,'admin'),(390,'admin'),(320,'viewer'),(820,'legacy')]:
   context=await browser.new_context(viewport={'width':width,'height':1100},reduced_motion='reduce')
   await context.add_init_script("sessionStorage.setItem('f1_session','a'.repeat(64))")
   page=await context.new_page();errors=[];posts=[];page.on('pageerror',lambda e:errors.append(str(e)))
   now=datetime.now(timezone.utc)
   state={'leader':1,'amount':5000000,'queue':[],'auction':True,'budget':95000000}
   transfer={'auctionId':2,'driverId':1,'driverName':'Theo','teamId':1,'teamName':'Ferrari','amount':2500000,'endedAt':now.isoformat()}
   async def api(route):
    req=route.request;path=req.url.split('/api/')[-1];data={};status=200
    if req.method=='POST':posts.append((path,req.post_data_json))
    if path=='me':data={'username':'Testchef','admin':mode=='admin','team':None if mode=='viewer' else {'id':1,'name':'Ferrari','budget':state['budget']}}
    elif path=='teams':data={'teams':[{'id':1,'name':'Ferrari','budget':state['budget'],'owner_username':'Testchef','drivers':[{'id':1,'name':'Theo'}]}]}
    elif path=='drivers':data={'drivers':[{'id':1,'name':'Theo'},{'id':2,'name':'Moritz'}]}
    elif path=='features':
     if mode=='legacy':status=404;data={'error':'Not found'}
     else:data={'version':2,'antiSnipeSeconds':15,'discordConfigured':False}
    elif path=='transfers':data={'transfers':[transfer]}
    elif path.startswith('drivers/'):
     data={'driver':{'id':1,'name':'Theo','teamName':'Ferrari'},'transfers':[transfer]}
    elif path=='auctions/bid':
     assert req.post_data_json['amount']==5500000
     state.update(leader=1,amount=5500000,budget=94500000)
     data={'ok':True,'amount':5500000}
    elif path=='auctions':
     auction={'id':1,'driverId':1,'driverName':'Theo','startingPrice':2500000,'endsAt':(now+timedelta(seconds=120)).isoformat(),'highestBid':state['amount']}
     if mode!='legacy':auction.update(leadingTeamId=state['leader'],leadingTeamName='Ferrari' if state['leader']==1 else 'McLaren',bids=[{'id':2,'teamId':state['leader'],'teamName':'Ferrari' if state['leader']==1 else 'McLaren','amount':state['amount'],'createdAt':now.isoformat()}])
     data={'auction':auction if state['auction'] else None,'serverTime':datetime.now(timezone.utc).isoformat()}
     if mode!='legacy':data['features']={'version':2,'antiSnipeSeconds':15}
    elif path=='admin/queue':
     if req.method=='POST':state['queue']=[dict(req.post_data_json,id=1,driverName='Moritz',status='pending')];data={'ok':True,'id':1}
     else:data={'queue':state['queue']}
    elif path=='admin/queue/1/cancel':state['queue']=[];data={'ok':True}
    else:status=404;data={'error':'Not found'}
    await route.fulfill(status=status,json=data)
   await page.route('**/api/**',api)
   await page.route('https://juligg1506.github.io/f1-auction/',lambda r:r.fulfill(content_type='text/html',body=html))
   await page.route('**/app.js?*',lambda r:r.fulfill(content_type='text/javascript',body=js+'\nwindow.refreshAuction=loadAuction;'))
   await page.route('https://media.formula1.com/**',lambda r:r.abort())
   await page.goto('https://juligg1506.github.io/f1-auction/',wait_until='networkidle')
   await page.locator('[data-view-link=auktionen]').click()
   if mode=='legacy':
    assert await page.locator('#queueSection').is_hidden()
    assert 'nicht verfügbar' in await page.locator('.bid-history').inner_text()
   else:
    assert await page.locator('.bid-history-row').count()==1
    assert await page.locator('#bidButton').count()==0
    if mode=='admin':
     state.update(leader=2,amount=5250000,budget=100000000)
     await page.evaluate('window.refreshAuction()')
     await page.locator('#outbidAlert').wait_for(state='attached')
     assert 'überboten' in await page.locator('#outbidAlert').inner_text()
     assert await page.locator('#bidButton').is_visible()
     page.once('dialog',lambda d:d.accept())
     await page.locator('#bidButton').click()
     await page.wait_for_function("document.querySelector('.auction-bidding').textContent.includes('Dein Team führt')")
     assert len([x for x in posts if x[0]=='auctions/bid'])==1
     assert await page.locator('#outbidAlert').is_hidden()
   assert not await page.locator('#auctionPage').evaluate('e=>e.scrollWidth>e.clientWidth')
   await page.screenshot(path=str(artifacts/f'preview-{width}-{mode}.png'))
   await page.locator('.auction-overview .driver-link').click()
   assert await page.locator('#driverDialog').evaluate('d=>d.open')
   await page.wait_for_function("document.getElementById('driverProfileBody').textContent.includes('Ferrari')")
   if mode!='legacy':assert await page.locator('#driverDialog .transfer-row').count()==1
   await page.locator('#closeDriver').click()
   assert await page.locator('#auctionPage').is_visible()
   await page.locator('[data-view-link=dashboard]').click()
   if mode=='admin':
    await page.locator('[data-view-link=administration]').click()
    await page.locator('#queueDriver').select_option('2')
    await page.locator('#planAuction input[name=scheduledAt]').fill('2027-01-02T15:00')
    await page.locator('#planAuction button').click()
    await page.locator('.queue-row').wait_for()
    assert posts[-1][1]['driverId']==2
    page.once('dialog',lambda d:d.accept())
    await page.locator('.queue-row button').click()
    await page.locator('.queue-row').wait_for(state='detached')
   assert not await page.evaluate('document.documentElement.scrollWidth>innerWidth')
   assert not errors,errors
   print(width,mode,'PASS profiles/history, leader/outbid, exact bid, queue, focus/dialogs, responsive, legacy fallback',flush=True)
   await context.close()
  await browser.close()
asyncio.run(main())


