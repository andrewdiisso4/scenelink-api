'use strict';
const http = require('node:http');
// Undici's fetch rewrites Sec-Fetch-Mode. Use raw loopback HTTP only when
// simulating a browser's navigation metadata (never a provider request).
module.exports = function navigationRequest(url, headers) {
  if(new URL(url).hostname !== '127.0.0.1') throw Error('Loopback only');
  return new Promise((resolve,reject)=>{
    const req=http.get(url,{headers},res=>{
      let body='';res.setEncoding('utf8');res.on('data',chunk=>body+=chunk);
      res.on('end',()=>resolve(new Response(body,{status:res.statusCode,headers:res.headers})));
      res.on('error',reject);
    });
    req.on('error',reject);
  });
};
