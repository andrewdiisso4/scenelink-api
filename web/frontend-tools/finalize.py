#!/usr/bin/env python3
"""Rebuild recovered named bundles and content-address execution references. Never deploys."""
from pathlib import Path
import re,json,hashlib
from datetime import datetime,timezone
import os
from sync_auth_css import sync_auth_css
epoch=os.environ.get('SOURCE_DATE_EPOCH')
built=(datetime.fromtimestamp(int(epoch),timezone.utc) if epoch is not None else datetime.now(timezone.utc)).isoformat()
root=Path(__file__).resolve().parent.parent/'frontend'
sync_auth_css(root)
tag='connected-20261122-concierge-reopen'
for name in ['sl-bundle-7d.js','sl-bundle-7d-ui.js']:
 p=root/'js'/name;s=p.read_text();matches=list(re.finditer(r'/\* === (js/[^ ]+) === \*/',s));header=s[:matches[0].start()]
 p.write_text(header+'\n\n'.join('/* === '+m[1]+' === */\n'+(root/m[1]).read_text().strip() for m in matches)+'\n')
# Every JS/CSS execution URL gets the release tag because exported originals have immutable caching.
pattern=re.compile(r'((?:/?(?:js|css)/)[A-Za-z0-9_./-]+\.(?:js|css))(?:\?v=[A-Za-z0-9_.-]+)?(?=[\x27\x22])')
for p in root.rglob('*'):
 if p.suffix not in ['.html','.js']:continue
 s=p.read_text();s=pattern.sub(lambda m:m[1]+'?v='+tag,s);p.write_text(s)
p=root/'sw.js';s=p.read_text();s=re.sub(r"const VERSION = '[^']+';", "const VERSION = 'sl-"+tag+"';",s)
for asset in ['ai-concierge-v5','sl-connected-api','sl-connected-actions','sl-connected-lists','sl-connected-plans','sl-events','sl-social-profile','sl-social-messages']:
 path="  '/js/"+asset+".js?v="+tag+"',"
 if path not in s:s=s.replace('const SHELL_URLS = [','const SHELL_URLS = [\n'+path)
s=re.sub(r"phase: '[^']+'","phase: 'concierge-directory'",s);p.write_text(s)
p=root/'js/sl-version-marker.js';s=p.read_text()
for key,value in {'phase':'concierge-directory','sw_version':'sl-'+tag,'deploy':tag,'built':built,'backend_change':'compatible-concierge'}.items():
 s=re.sub(key+r": '[^']+'",key+": '"+value+"'",s)
p.write_text(s)
(root/'version.json').write_text(json.dumps({'phase':'concierge-directory','sw_version':'sl-'+tag,'timestamp':built,'status':'versioned_build','requires_paired_backend':False,'required_migration':'016_private_list_invitations.sql','rollout_order':'compatible_backend_then_frontend','summary':'Concierge directory improvements and saved itinerary reopening. The AI pilot stays off by default. No new database migrations, provider activation or venue imports.'},indent=2)+'\n')
evidence=root.parent/'frontend-evidence';evidence.mkdir(exist_ok=True)
(evidence/'candidate-sha256.json').write_text(json.dumps({str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.rglob('*')) if p.is_file()},indent=2)+'\n')
print(tag)
