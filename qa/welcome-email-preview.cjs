'use strict';
// Render fictional welcome templates to local files. This script never sends mail.
const fs=require('node:fs');
const path=require('node:path');
process.env.EMAIL_PROVIDER='disabled';
process.env.APP_BASE_URL='https://scenelink.app';
process.env.SUPPORT_EMAIL='info@scenelink.app';
const {welcomeEmail}=require('../src/services/mailer');
const out=path.resolve(__dirname,'../evidence/welcome-email');
fs.mkdirSync(out,{recursive:true});
for(const email_verified of [false,true]){
 const name=email_verified?'verified':'unverified';
 const template=welcomeEmail({display_name:'Casey Preview',email_verified});
 fs.writeFileSync(path.join(out,name+'.html'),'<!-- Offline welcome preview. Fictional account; no email sent. Regenerate with node qa/welcome-email-preview.cjs. -->\n'+template.html+'\n');
 fs.writeFileSync(path.join(out,name+'.txt'),'OFFLINE PREVIEW — fictional account; no email sent.\nSubject: '+template.subject+'\n\n'+template.text+'\n');
}
console.log('Wrote offline welcome previews to evidence/welcome-email. No email sent.');
