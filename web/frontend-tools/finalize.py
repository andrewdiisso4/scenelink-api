#!/usr/bin/env python3
"""Rebuild recovered named bundles and content-address execution references. Never deploys."""
from pathlib import Path
import re,json,hashlib
from datetime import datetime,timezone
built=datetime.now(timezone.utc).isoformat()
root=Path(__file__).resolve().parent.parent/'frontend'
tag='connected-20261108-6'
for name in ['sl-bundle-7d.js','sl-bundle-7d-ui.js']:
 p=root/'js'/name;s=p.read_text();matches=list(re.finditer(r'/\* === (js/[^ ]+) === \*/',s));header=s[:matches[0].start()]
 p.write_text(header+'\n\n'.join('/* === '+m[1]+' === */\n'+(root/m[1]).read_text().strip() for m in matches)+'\n')
# Every JS/CSS execution URL gets the release tag because exported originals have immutable caching.
pattern=re.compile(r'((?:/?(?:js|css)/)[A-Za-z0-9_./-]+\.(?:js|css))(?:\?v=[A-Za-z0-9_.-]+)?(?=[\x27\x22])')
for p in root.rglob('*'):
 if p.suffix not in ['.html','.js']:continue
 s=p.read_text();s=pattern.sub(lambda m:m[1]+'?v='+tag,s);p.write_text(s)
p=root/'sw.js';s=p.read_text();s=re.sub(r"const VERSION = '[^']+';", "const VERSION = 'sl-"+tag+"';",s)
for asset in ['sl-connected-api','sl-connected-actions','sl-connected-plans','sl-events','sl-social-profile','sl-social-messages']:
 path="  '/js/"+asset+".js?v="+tag+"',"
 if path not in s:s=s.replace('const SHELL_URLS = [','const SHELL_URLS = [\n'+path)
s=re.sub(r"phase: '[^']+'","phase: 'social-candidate'",s);p.write_text(s)
p=root/'js/sl-version-marker.js';s=p.read_text()
for key,value in {'phase':'social-candidate','sw_version':'sl-'+tag,'deploy':tag,'built':built,'backend_commit':'paired-local-candidate-required'}.items():
 s=re.sub(key+r": '[^']+'",key+": '"+value+"'",s)
p.write_text(s)
(root/'version.json').write_text(json.dumps({'phase':'social-candidate','sw_version':'sl-'+tag,'timestamp':built,'status':'local_not_deployed','requires_paired_backend':True,'summary':'Connected social candidate with account-safe notifications, private-plan links, owner editing and restricted-plan recovery. Local synthetic-account browser acceptance passed; production authentication/providers, physical-device/Safari and coordinated-release acceptance remain pending. In-site booking unavailable.'},indent=2)+'\n')
evidence=root.parent/'frontend-evidence';evidence.mkdir(exist_ok=True)
(evidence/'candidate-sha256.json').write_text(json.dumps({str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.rglob('*')) if p.is_file()},indent=2)+'\n')
print(tag)
