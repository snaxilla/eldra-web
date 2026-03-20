#!/usr/bin/env bash
set -euo pipefail

DIRECTUS_URL="http://ledouxvps-directus-269351-187-77-194-11.traefik.me"
DIRECTUS_TOKEN="7cdKmMbWeSelf1lDKwibPokHoo61HTlb"


auth_header="Authorization: Bearer ${DIRECTUS_TOKEN}"
json_header="Content-Type: application/json"

post_json() {
  local path="$1"
  local body="$2"

  echo
  echo "=== POST ${path} ==="
  http_code=$(
    curl -sS -o /tmp/directus_post.json -w "%{http_code}" \
      -X POST "${DIRECTUS_URL}${path}" \
      -H "${auth_header}" \
      -H "${json_header}" \
      -d "${body}"
  )
  cat /tmp/directus_post.json
  echo
  echo "HTTP ${http_code}"

  if [ "${http_code}" != "200" ] && [ "${http_code}" != "204" ]; then
    echo "Request failed for ${path}"
    exit 1
  fi
}

echo "Creating collection: worlds"
post_json "/collections" '{
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

echo "Creating worlds fields"
post_json "/fields/worlds" '{
  "field": "name",
  "type": "string",
  "meta": { "interface": "input", "required": true, "width": "half" },
  "schema": { "is_nullable": false }
}'
post_json "/fields/worlds" '{
  "field": "slug",
  "type": "string",
  "meta": { "interface": "input", "required": true, "width": "half" },
  "schema": { "is_nullable": false, "is_unique": true }
}'
post_json "/fields/worlds" '{
  "field": "system_key",
  "type": "string",
  "meta": { "interface": "input", "required": true, "width": "half" },
  "schema": { "is_nullable": false }
}'
post_json "/fields/worlds" '{
  "field": "description",
  "type": "text",
  "meta": { "interface": "input-multiline", "width": "full" },
  "schema": { "is_nullable": true }
}'
post_json "/fields/worlds" '{
  "field": "visibility",
  "type": "string",
  "meta": { "interface": "input", "width": "half" },
  "schema": { "default_value": "private", "is_nullable": true }
}'
post_json "/fields/worlds" '{
  "field": "owner_id",
  "type": "uuid",
  "meta": { "interface": "input", "width": "half" },
  "schema": { "is_nullable": true }
}'

echo "Creating collection: entities"
post_json "/collections" '{
  "collection": "entities",
  "meta": {
    "icon": "inventory_2",
    "note": "World-scoped Eldra entities",
    "hidden": false,
    "singleton": false
  },
  "schema": {
    "name": "entities"
  }
}'

echo "Creating entities fields"
post_json "/fields/entities" '{
  "field": "title",
  "type": "string",
  "meta": { "interface": "input", "required": true, "width": "half" },
  "schema": { "is_nullable": false }
}'
post_json "/fields/entities" '{
  "field": "slug",
  "type": "string",
  "meta": { "interface": "input", "required": true, "width": "half" },
  "schema": { "is_nullable": false }
}'
post_json "/fields/entities" '{
  "field": "world_id",
  "type": "uuid",
  "meta": { "interface": "input", "required": true, "width": "half" },
  "schema": { "is_nullable": false }
}'
post_json "/fields/entities" '{
  "field": "system_key",
  "type": "string",
  "meta": { "interface": "input", "required": true, "width": "half" },
  "schema": { "is_nullable": false }
}'
post_json "/fields/entities" '{
  "field": "entity_type",
  "type": "string",
  "meta": { "interface": "input", "required": true, "width": "half" },
  "schema": { "is_nullable": false }
}'
post_json "/fields/entities" '{
  "field": "status",
  "type": "string",
  "meta": { "interface": "input", "width": "half" },
  "schema": { "default_value": "draft", "is_nullable": true }
}'
post_json "/fields/entities" '{
  "field": "visibility",
  "type": "string",
  "meta": { "interface": "input", "width": "half" },
  "schema": { "default_value": "world", "is_nullable": true }
}'
post_json "/fields/entities" '{
  "field": "summary",
  "type": "text",
  "meta": { "interface": "input-multiline", "width": "full" },
  "schema": { "is_nullable": true }
}'

echo "Creating collection: block_instances"
post_json "/collections" '{
  "collection": "block_instances",
  "meta": {
    "icon": "view_agenda",
    "note": "Structured block data attached to Eldra entities",
    "hidden": false,
    "singleton": false
  },
  "schema": {
    "name": "block_instances"
  }
}'

echo "Creating block_instances fields"
post_json "/fields/block_instances" '{
  "field": "entity_id",
  "type": "uuid",
  "meta": { "interface": "input", "required": true, "width": "half" },
  "schema": { "is_nullable": false }
}'
post_json "/fields/block_instances" '{
  "field": "block_key",
  "type": "string",
  "meta": { "interface": "input", "required": true, "width": "half" },
  "schema": { "is_nullable": false }
}'
post_json "/fields/block_instances" '{
  "field": "label",
  "type": "string",
  "meta": { "interface": "input", "required": true, "width": "half" },
  "schema": { "is_nullable": false }
}'
post_json "/fields/block_instances" '{
  "field": "sort",
  "type": "integer",
  "meta": { "interface": "input", "width": "half" },
  "schema": { "default_value": 1, "is_nullable": true }
}'
post_json "/fields/block_instances" '{
  "field": "repeatable",
  "type": "boolean",
  "meta": { "interface": "boolean", "width": "half" },
  "schema": { "default_value": false, "is_nullable": true }
}'
post_json "/fields/block_instances" '{
  "field": "data",
  "type": "json",
  "meta": { "interface": "input-code", "width": "full" },
  "schema": { "is_nullable": true }
}'

echo
echo "Done."
echo "Verify with:"
echo "  ./verify_directus_collections.sh"
