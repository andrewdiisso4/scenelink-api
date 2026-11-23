'use strict';
// Served before every shipped bundle as /env.js. This overlay belongs only to
// the isolated host; canonical frontend files remain byte-for-byte unchanged.
function browserBootstrap(origin, release) {
  window.__SL_ENV = {env:'isolated-acceptance',sentryDsn:'',gaId:'',release:release};
  const forced = {API_BASE_URL:'/api',API_URL:'/api',API_BASE:origin,GOOGLE_CLIENT_ID:'',APPLE_CLIENT_ID:'',APPLE_ENABLED:false};
  for (const name of ['SL_CONFIG','SLConfig']) {
    let current;
    const normalize = value => new Proxy(Object.assign({},value || {},forced), {
      get(target, key) { return Object.prototype.hasOwnProperty.call(forced,key) ? forced[key] : target[key]; },
      set(target, key, value) { if (!Object.prototype.hasOwnProperty.call(forced,key)) target[key]=value; return true; }
    });
    current=normalize(window[name]);
    Object.defineProperty(window,name,{configurable:false,enumerable:true,get(){return current;},set(value){current=normalize(value);}});
  }
  for (const name of ['GOOGLE_CLIENT_ID','APPLE_CLIENT_ID']) Object.defineProperty(window,name,{configurable:false,get(){return '';},set(){}});
  const request=window.fetch.bind(window);
  window.fetch=function(input,options){
    const address=typeof input === 'string' ? input : input && typeof input.url === 'string' ? input.url : String(input);
    const url=new URL(address,window.location.href);
    if(url.origin!==origin)return Promise.reject(new Error('External requests are unavailable in isolated acceptance.'));
    // Canonical clients omit browser credentials because the production API
    // uses bearer auth. This host adds a separate outer access cookie.
    return request(input,Object.assign({},options || {},{credentials:'same-origin'}));
  };
}
module.exports = {browserBootstrap, script:(origin,release)=>'('+browserBootstrap.toString()+')('+JSON.stringify(origin)+','+JSON.stringify(release)+');'};
