const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const moduleRoot=process.env.SCENELINK_BROWSER_MODULE_ROOT;
const {chromium}=require(moduleRoot?path.join(moduleRoot,'playwright'):'playwright');
const root=path.resolve(__dirname,'../web/frontend');
const eventId='12abcdef-1234-5678-9012-123456789abc';
const types={'.js':'application/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname.startsWith('/api/')){
 const data=u.pathname==='/api/search/universal'?{venues:[{id:'qa-1',name:'Harbor Test Kitchen',slug:'harbor-qa',neighborhood:'South Boston',cuisine:'American'}],events:[{id:eventId,title:'Harbor Review Night',date:'2099-01-02',venue_name:'Harbor Test Kitchen'}]} :
  u.pathname==='/api/events/'+eventId?{event:{id:eventId,title:'Harbor Review Night',date:'2099-01-02',venue_name:'Harbor Test Kitchen',source_review_status:'reviewed',rsvp_is_reservation:false}} : [];
 res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(data));
 }
 let filename=u.pathname==='/'?'index.html':u.pathname.slice(1);
 if(!path.extname(filename))filename+='.html';
 const file=path.resolve(root,filename);
 if(!file.startsWith(root+'/')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
 fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({...(process.env.SCENELINK_CHROMIUM?{executablePath:process.env.SCENELINK_CHROMIUM}:{}),args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 for(const width of [320,390,820,1024,1280,1440]){
  const ctx=await browser.newContext({viewport:{width,height:840},serviceWorkers:'block',reducedMotion:'reduce'});
  const posts=[];
  await ctx.route('**/*',r=>{const req=r.request();if(!req.url().startsWith(origin+'/'))return r.abort();if(req.method()==='POST')posts.push(req.url());return r.continue();});
  const page=await ctx.newPage();
  for(const route of (width===390||width===1440?['index','explore','events','nightlife','tonight','profile','messages','social-feed','my-lists','plan-with-friends','business','contact','about','press','careers','privacy','terms']:['index','explore','events'])){
   await page.goto(origin+'/'+route+'.html',{waitUntil:'domcontentloaded'});
   const prefix=width+' '+route;
   console.log('CHECK',prefix);
   const search=page.locator('.slus-input'), launcher=page.locator('.sl-concierge-launcher');
   const out=await page.evaluate(()=>({view:innerWidth,scroll:document.documentElement.scrollWidth, root:document.querySelector('.sl-universal-search')?.parentElement?.className}));
   await search.waitFor({state:'visible',timeout:6000}); await launcher.waitFor({state:'visible',timeout:6000});
   assert.equal(await launcher.count(),1,prefix);
   const searchBox=await search.boundingBox(), btn=await launcher.boundingBox();
   assert(searchBox.x>=0&&searchBox.x+searchBox.width<=width+1&&searchBox.width>=75,prefix+' search bounds '+JSON.stringify(searchBox));
   assert(btn.x>=0&&btn.x+btn.width<=width+1&&btn.height>=44,prefix+' launcher bounds '+JSON.stringify(btn));
   console.log('GEOMETRY',prefix,Math.round(searchBox.width),out.scroll,out.root);
   if(width===390||width===1440){
    assert.equal(await search.count(),1,prefix+' one unified search control');
    const wordmark=page.locator('img.sl-brand-wordmark').first();
    if(await wordmark.count()){
      assert.equal(await wordmark.getAttribute('src'),'/images/brand/scenelink-wordmark.png',prefix);
      await wordmark.evaluate(img=>img.decode());
      const home=await wordmark.evaluate(img=>img.closest('a')?.getAttribute('href'));
      assert.equal(home,'/',prefix+' wordmark points home');
    }
    const entry=page.locator('header .sl-auth-trigger:visible,.sl-explore-header .sl-auth-trigger:visible').first();
    await entry.waitFor({state:'visible',timeout:7000});
    await entry.click();
    await page.locator('.sl-auth-overlay.open #slLoginEmail').waitFor({state:'visible',timeout:6000});
    await page.locator('.sl-auth-close').click();
    await page.locator('.sl-auth-overlay.open').waitFor({state:'hidden',timeout:6000});
   }
   if(width===390&&route==='index'){
    await page.locator('[data-sl-open-search="live music"]').click();
    assert.equal(await search.inputValue(),'live music');
    await page.getByText('Harbor Review Night',{exact:true}).waitFor();
    await Promise.all([page.waitForURL(origin+'/events.html?event='+eventId),page.getByText('Harbor Review Night',{exact:true}).click()]);
    await page.locator('#eventsGrid').getByText('Harbor Review Night',{exact:true}).waitFor();
    await page.goto(origin+'/index.html',{waitUntil:'domcontentloaded'});
   }
   if(width===390&&['index','events','messages'].includes(route)){
    await search.fill('Harbor');
    await page.getByText('Harbor Test Kitchen',{exact:true}).waitFor({state:'visible',timeout:6000});
    await search.press('ArrowDown');
    assert.match(await page.locator('[aria-selected=true].slus-item').innerText(), /Harbor Test Kitchen/);
    const contrastRatios=await page.locator('[aria-selected=true].slus-item').evaluate(row=>{
      const luminance=color=>color.match(/[0-9.]+/g).slice(0,3).map(Number).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
      const b=luminance(getComputedStyle(row).backgroundColor);
      return [...row.querySelectorAll('.slus-name,.slus-meta')].map(e=>{const f=luminance(getComputedStyle(e).color);return (Math.max(f,b)+.05)/(Math.min(f,b)+.05);});
    });
    assert.equal(contrastRatios.length,2,prefix);
    assert(contrastRatios.every(ratio=>ratio>=4.5),prefix+' search contrast '+JSON.stringify(contrastRatios));
    await page.locator('.slus-clear').click();
    assert.equal(await search.inputValue(),'');
    await launcher.click();
    await page.locator('#slConciergePanel').waitFor({state:'visible',timeout:6000});
    assert.equal(await page.locator('.slc-input').inputValue(),'');
    await page.locator('.slc-close').click();
    await page.locator('#slConciergePanel').waitFor({state:'hidden',timeout:3000});
    assert.equal(await launcher.evaluate(el=>el===document.activeElement),true);
    await search.fill('Dinner in Back Bay');
    await page.locator('.slus-ai').click({timeout:6000});
    await page.locator('#slConciergePanel').waitFor({state:'visible',timeout:6000});
    assert.equal(await page.locator('.slc-input').inputValue(),'Dinner in Back Bay');
    assert.equal(posts.filter(url=>url.includes('concierge')).length,0);
   }
   if(['index','explore','profile','social-feed','messages'].includes(route)&&[390,1440].includes(width)){
    const dir=path.join(__dirname,'../evidence/account-social/discovery');fs.mkdirSync(dir,{recursive:true});
    await page.screenshot({path:path.join(dir,width+'-'+route+'.png'),timeout:5000,animations:'disabled'});
   }
  }
  await ctx.close();
 }
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
