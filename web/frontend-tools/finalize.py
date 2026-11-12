#!/usr/bin/env python3
"""Rebuild recovered named bundles and content-address execution references. Never deploys."""
from pathlib import Path
import re,json,hashlib
from datetime import datetime,timezone
built=datetime.now(timezone.utc).isoformat()
root=Path(__file__).resolve().parent.parent/'frontend'
tag='connected-20261112-auth1'
for name in ['sl-bundle-7d.js','sl-bundle-7d-ui.js']:
 p=root/'js'/name;s=p.read_text();matches=list(re.finditer(r'/\* === (js/[^ ]+) === \*/',s));header=s[:matches[0].start()]
 p.write_text(header+'\n\n'.join('/* === '+m[1]+' === */\n'+(root/m[1]).read_text().strip() for m in matches)+'\n')
# Every JS/CSS execution URL gets the release tag because exported originals have immutable caching.
pattern=re.compile(r'((?:/?(?:js|css)/)[A-Za-z0-9_./-]+\.(?:js|css))(?:\?v=[A-Za-z0-9_.-]+)?(?=[\x27\x22])')
for p in root.rglob('*'):
 if p.suffix not in ['.html','.js']:continue
 s=p.read_text();s=pattern.sub(lambda m:m[1]+'?v='+tag,s);p.write_text(s)
p=root/'sw.js';s=p.read_text();s=re.sub(r"const VERSION = '[^']+';", "const VERSION = 'sl-"+tag+"';",s)
for asset in ['sl-connected-api','sl-connected-actions','sl-connected-lists','sl-connected-plans','sl-events','sl-social-profile','sl-social-messages']:
 path="  '/js/"+asset+".js?v="+tag+"',"
 if path not in s:s=s.replace('const SHELL_URLS = [','const SHELL_URLS = [\n'+path)
s=re.sub(r"phase: '[^']+'","phase: 'oauth-signin-reliability'",s);p.write_text(s)
p=root/'js/sl-version-marker.js';s=p.read_text()
for key,value in {'phase':'oauth-signin-reliability','sw_version':'sl-'+tag,'deploy':tag,'built':built,'backend_change':'oauth-errors-no-schema'}.items():
 s=re.sub(key+r": '[^']+'",key+": '"+value+"'",s)
p.write_text(s)
(root/'version.json').write_text(json.dumps({'phase':'oauth-signin-reliability','sw_version':'sl-'+tag,'timestamp':built,'status':'local_candidate_not_deployed','requires_paired_backend':True,'required_migration':'016_private_list_invitations.sql','rollout_order':'backend_migrations_and_API_before_frontend','summary':'OAuth button readiness, cancellation, session ownership and safe provider-error reporting. Existing migration 016 remains required; no new migration or provider configuration is included. This is a local candidate, not a deployment. Hosted preview, exact-head CI and real-provider account acceptance remain separate gates.'},indent=2)+'\n')
evidence=root.parent/'frontend-evidence';evidence.mkdir(exist_ok=True)
(evidence/'candidate-sha256.json').write_text(json.dumps({str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.rglob('*')) if p.is_file()},indent=2)+'\n')
print(tag)
