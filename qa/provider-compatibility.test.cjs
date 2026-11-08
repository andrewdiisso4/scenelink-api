'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const nodemailer=require('nodemailer');
const {OAuth2Client}=require('google-auth-library');
test('upgraded Nodemailer compiles transactional message offline with exact recipient',async()=>{
 const transport=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'unix',disableFileAccess:true,disableUrlAccess:true});
 const result=await transport.sendMail({from:'SceneLink <noreply@example.invalid>',to:'test@example.invalid',replyTo:'support@example.invalid',subject:'SceneLink local compatibility',text:'Local fixture only',html:'<p>Local fixture only</p>'});
 assert.deepEqual(result.envelope.to,['test@example.invalid']);
 assert.match(result.message.toString(),/Local fixture only/);
 assert.match(result.message.toString(),/Reply-To: support@example.invalid/);
 transport.close();
});
test('upgraded Google OAuth verifier accepts valid local signed fixture and rejects wrong audience',async()=>{
 const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const now=Math.floor(Date.now()/1000),audience='isolated-client.invalid';
 const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const input=enc({alg:'RS256',kid:'local'})+'.'+enc({iss:'https://accounts.google.com',sub:'local-fixture',aud:audience,iat:now,exp:now+3600,email:'test@example.invalid',email_verified:true});
 const token=input+'.'+crypto.sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url');
 const client=new OAuth2Client(audience),certs={local:publicKey.export({type:'spki',format:'pem'})};
 const ticket=await client.verifySignedJwtWithCertsAsync(token,certs,audience,['https://accounts.google.com']);
 assert.equal(ticket.getPayload().sub,'local-fixture');
 await assert.rejects(client.verifySignedJwtWithCertsAsync(token,certs,'wrong-client.invalid',['https://accounts.google.com']),/audience/i);
});
