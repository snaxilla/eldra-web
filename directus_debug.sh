#!/usr/bin/env bash
set -u

DIRECTUS_URL="http://ledouxvps-directus-269351-187-77-194-11.traefik.me"
DIRECTUS_TOKEN="7cdKmMbWeSelf1lDKwibPokHoo61HTlb"


echo "== /server/info =="
curl -i -sS \
  -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
  "${DIRECTUS_URL}/server/info"

echo
echo "== /users/me =="
curl -i -sS \
  -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
  "${DIRECTUS_URL}/users/me?fields=id,email,role.id,role.name,role.admin_access,role.app_access"
