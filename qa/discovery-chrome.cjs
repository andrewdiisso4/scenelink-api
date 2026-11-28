const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const moduleRoot=process.env.SCENELINK_BROWSER_MODULE_ROOT;
const {chromium}=require(moduleRoot?path.join(moduleRoot,'playwright'):'playwright');
const root=path.resolve(__dirname,'../web/frontend');
const types={'.js':'application/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname.startsWith('/api/')){
 const data=u.pathname==='/api/search/universal'?{venues:[{id:'qa-1',name:'Harbor Test Kitchen',slug:'harbor-qa',neighborhood:'South Boston',cuisine:'American'}]} : [];
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
  for(const route of (width===390||width===1440?['index','explore','events','nightlife','tonight','profile','messages','social-feed','my-lists','plan-with-friends','business','contact']:['index','explore','events'])){
   await page.goto(origin+'/'+route+'.html',{waitUntil:'domcontentloaded'});
   const prefix=width+' '+route;
   const search=page.locator('.slus-input'), launcher=page.locator('.sl-concierge-launcher');
   const out=await page.evaluate(()=>({view:innerWidth,scroll:document.documentElement.scrollWidth, root:document.querySelector('.sl-universal-search')?.parentElement?.className}));
   await search.waitFor({state:'visible',timeout:6000}); await launcher.waitFor({state:'visible',timeout:6000});
   assert.equal(await launcher.count(),1,prefix);
   const searchBox=await search.boundingBox(), btn=await launcher.boundingBox();
   assert(searchBox.x>=0&&searchBox.x+searchBox.width<=width+1&&searchBox.width>=75,prefix+' search bounds '+JSON.stringify(searchBox));
   assert(btn.x>=0&&btn.x+btn.width<=width+1&&btn.height>=44,prefix+' launcher bounds '+JSON.stringify(btn));
   console.log('GEOMETRY',prefix,Math.round(searchBox.width),out.scroll,out.root);
   if(width===390&&['index','events','messages'].includes(route)){
    await search.fill('Harbor');
    await page.getByText('Harbor Test Kitchen',{exact:true}).waitFor({state:'visible',timeout:6000});
    await search.press('ArrowDown');
    assert.match(await page.locator('[aria-selected=true].slus-item').innerText(), /Harbor Test Kitchen/);
    await page.locator('.slus-clear').click();
    assert.equal(await search.inputValue(),'');
    await launcher.click();
    await page.locator('#slConciergePanel').waitFor({state:'visible',timeout:6000});
    assert.equal(await page.locator('.slc-input').inputValue(),'');
    await page.locator('.slc-close').click();
    assert.equal(await launcher.evaluate(el=>el===document.activeElement),true);
    await search.fill('Dinner in Back Bay');
    await page.locator('.slus-ai').click();
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
