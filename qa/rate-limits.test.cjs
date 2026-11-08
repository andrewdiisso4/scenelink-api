'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const express=require('express');
const {authLimiter}=require('../src/middleware/rateLimits');
test('changing spoofed forwarding headers does not reset the auth rate limit',async()=>{
  const app=express();
  app.get('/login',authLimiter,(_req,res)=>res.json({ok:true}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  try {
    const base='http://127.0.0.1:'+server.address().port;
    for(let i=0;i<11;i++) {
      const r=await fetch(base+'/login',{headers:{'cf-connecting-ip':'192.0.2.'+(i+1),'x-forwarded-for':'198.51.100.'+(i+1)}});
      assert.equal(r.status,i<10?200:429);
    }
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
