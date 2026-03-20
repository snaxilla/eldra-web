#!/usr/bin/env bash
set -euo pipefail

DIRECTUS_URL="http://ledouxvps-directus-269351-187-77-194-11.traefik.me"
DIRECTUS_TOKEN="7cdKmMbWeSelf1lDKwibPokHoo61HTlb"

for path in \
  "/collections/worlds" \
  "/collections/entities" \
  "/collections/block_instances" \
  "/fields/worlds" \
  "/fields/entities" \
  "/fields/block_instances"
do
  echo
  echo "=== GET ${path} ==="
  curl -sS -o /tmp/directus_check.json -w "HTTP %{http_code}\n" \
    -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
    "${DIRECTUS_URL}${path}"
  cat /tmp/directus_check.json
  echo
done
