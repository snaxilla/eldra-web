#!/usr/bin/env bash
set -u

DIRECTUS_URL="http://ledouxvps-directus-269351-187-77-194-11.traefik.me"
DIRECTUS_TOKEN="7cdKmMbWeSelf1lDKwibPokHoo61HTlb"


post() {
  local path="$1"
  local body="$2"

  echo
  echo "=== POST ${path} ==="
  curl -i -sS \
    -X POST "${DIRECTUS_URL}${path}" \
    -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "${body}"
  echo
}

get() {
  local path="$1"

  echo
  echo "=== GET ${path} ==="
  curl -i -sS \
    -H "Authorization: Bearer ${DIRECTUS_TOKEN}" \
    "${DIRECTUS_URL}${path}"
  echo
}

post "/collections" '{
  "collection": "worlds",
  "meta": {
    "icon": "public",
    "note": "Top-level campaign worlds",
    "hidden": false,
    "singleton": false
  },
  "schema": {
    "name": "worlds"
  }
}'

post "/fields/worlds" '{
  "field": "name",
  "type": "string",
  "meta": {
    "interface": "input",
    "required": true,
    "width": "half"
  },
  "schema": {
    "is_nullable": false
  }
}'

post "/fields/worlds" '{
  "field": "slug",
  "type": "string",
  "meta": {
    "interface": "input",
    "required": true,
    "width": "half"
  },
  "schema": {
    "is_nullable": false,
    "is_unique": true
  }
}'

post "/fields/worlds" '{
  "field": "system_key",
  "type": "string",
  "meta": {
    "interface": "input",
    "required": true,
    "width": "half"
  },
  "schema": {
    "is_nullable": false
  }
}'

post "/fields/worlds" '{
  "field": "description",
  "type": "text",
  "meta": {
    "interface": "input-multiline",
    "width": "full"
  },
  "schema": {
    "is_nullable": true
  }
}'

post "/fields/worlds" '{
  "field": "visibility",
  "type": "string",
  "meta": {
    "interface": "input",
    "width": "half"
  },
  "schema": {
    "default_value": "private",
    "is_nullable": true
  }
}'

post "/fields/worlds" '{
  "field": "owner_id",
  "type": "uuid",
  "meta": {
    "interface": "input",
    "width": "half"
  },
  "schema": {
    "is_nullable": true
  }
}'

get "/collections/worlds"
get "/fields/worlds"
