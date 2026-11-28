'use strict';
function requestBridge(){
 const request=window.fetch.bind(window);
 window.fetch=(input,options)=>{
   if(!['/api/newsletter/confirm','/api/newsletter/unsubscribe'].includes(input)||options?.method!=='POST')
     throw new Error('Unexpected newsletter request');
   return request(input,{...options,mode:'same-origin',credentials:'same-origin',redirect:'error',referrerPolicy:'strict-origin'});
 };
}
function build(html,script){
 const embedded='('+requestBridge.toString()+')();\n'+script;
 if(/<\/script/i.test(embedded)||!/<script src="\/js\/sl-newsletter-email\.js\?v=[\w.-]+"(?: defer)?><\/script>/.test(html))
   throw new Error('Unsafe newsletter landing asset');
 return html.replace(/<script src="\/js\/sl-newsletter-email\.js\?v=[\w.-]+"(?: defer)?><\/script>/,'<script>'+embedded+'</script>');
}
module.exports={build};
