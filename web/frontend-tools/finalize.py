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
tag='connected-20261128-social-plan-share'
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
s=re.sub(r"phase: '[^']+'","phase: 'release-acceptance'",s);p.write_text(s)
p=root/'js/sl-version-marker.js';s=p.read_text()
for key,value in {'phase':'release-acceptance','sw_version':'sl-'+tag,'deploy':tag,'built':built,'backend_change':'paired-release-candidate'}.items():
 s=re.sub(key+r": '[^']+'",key+": '"+value+"'",s)
p.write_text(s)
# Preserve release provenance when issuing a new shared asset revision.
metadata=json.loads((root/'version.json').read_text())
metadata.update({'phase':'release-acceptance','sw_version':'sl-'+tag,'timestamp':built,'status':'versioned_build','requires_paired_backend':True,'required_migration':'019_newsletter_opt_in.sql','rollout_order':'paired_backend_then_frontend','admin_controller_cache_key':tag,'business_controller_cache_key':tag,'summary':'Account and social release candidate: consistent sign-in and recovery, verified profile persistence, consent-aware people actions, recent-provider account deletion and branded welcome email. This build adds a confirmable footer newsletter and optional scoped signup email transport. Preserves unified discovery, high-contrast social links, the floating Concierge entry, and multi-location owner integrity with measured activity only. Adds current profile counts, confirmed profile/header identity synchronization, and narrow documented fixture exclusions including review writes and owner review reads. Includes canonical signed-in search, real profile and friend controls with copyable profile invites, reviewed event links and refreshed transactional email. Requires the paired API candidate. External provider cleanup and native App Store acceptance remain release gates; AI and provider pilots remain off.'})
(root/'version.json').write_text(json.dumps(metadata,indent=2)+'\n')
evidence=root.parent/'frontend-evidence';evidence.mkdir(exist_ok=True)
(evidence/'candidate-sha256.json').write_text(json.dumps({str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.rglob('*')) if p.is_file()},indent=2)+'\n')
print(tag)
