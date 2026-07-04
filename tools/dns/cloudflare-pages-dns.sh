#!/usr/bin/env bash
#
# Point plecoxa.com (Cloudflare DNS) at the pleco-xa docs site on GitHub Pages.
# Creates the four apex A records + a www CNAME, all grey-cloud (DNS only) so
# GitHub can provision the TLS certificate.
#
# Requires a Cloudflare API token scoped to  Zone → DNS → Edit  for this zone.
#
#   export CF_API_TOKEN=<token>
#   export CF_ZONE_ID=<plecoxa.com zone id>   # dashboard → domain → Overview
#   bash tools/dns/cloudflare-pages-dns.sh
#
set -euo pipefail

: "${CF_API_TOKEN:?set CF_API_TOKEN (Zone:DNS:Edit)}"
: "${CF_ZONE_ID:?set CF_ZONE_ID (plecoxa.com zone id)}"

API="https://api.cloudflare.com/client/v4"
AUTH=(-H "Authorization: Bearer ${CF_API_TOKEN}" -H "Content-Type: application/json")

# Resolve the zone (apex) name so the A records get their fully-qualified name.
ZONE_NAME=$(curl -s "${AUTH[@]}" "${API}/zones/${CF_ZONE_ID}" \
  | sed -n 's/.*"name":"\([^"]*\)".*/\1/p' | head -1)
: "${ZONE_NAME:?could not read zone name — check CF_ZONE_ID and token}"
echo "zone: ${ZONE_NAME}"

PAGES_IPS=(185.199.108.153 185.199.109.153 185.199.110.153 185.199.111.153)
PAGES_HOST="pleco-xa.github.io"

create() { # type name content
  local type="$1" name="$2" content="$3"
  echo "→ ${type} ${name} ${content}"
  curl -s -X POST "${AUTH[@]}" "${API}/zones/${CF_ZONE_ID}/dns_records" \
    --data "{\"type\":\"${type}\",\"name\":\"${name}\",\"content\":\"${content}\",\"ttl\":1,\"proxied\":false}" \
    | sed -n 's/.*"success":\(true\|false\).*/  success=\1/p'
}

for ip in "${PAGES_IPS[@]}"; do
  create A "${ZONE_NAME}" "${ip}"
done
create CNAME "www.${ZONE_NAME}" "${PAGES_HOST}"

echo
echo "Done. If a record already existed Cloudflare reports success=false — check"
echo "the dashboard and delete stale/duplicate records if needed."
