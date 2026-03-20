#!/usr/bin/env bash
set -euo pipefail

DIRECTUS_URL="http://YOUR-DIRECTUS-URL"
DIRECTUS_TOKEN="YOUR_ADMIN_TOKEN"

auth_header="Authorization: Bearer ${DIRECTUS_TOKEN}"
json_header="Content-Type: application/json"

echo "Creating collection: block_instances"
curl -fsS -X POST "${DIRECTUS_URL}/collections" \
  -H "${auth_header}" \
  -H "${json_header}" \
  -d '{
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
  }' || true

echo "Creating fields for: block_instances"
curl -fsS -X POST "${DIRECTUS_URL}/fields/block_instances" \
  -H "${auth_header}" \
  -H "${json_header}" \
  -d '{
    "field": "entity",
    "type": "uuid",
    "meta": {
      "interface": "select-dropdown-m2o",
      "special": ["m2o"],
      "options": {
        "template": "{{title}}"
      },
      "required": true,
      "width": "half"
    },
    "schema": {
      "is_nullable": false,
      "foreign_key_table": "entities",
      "foreign_key_column": "id"
    }
  }' || true

curl -fsS -X POST "${DIRECTUS_URL}/fields/block_instances" \
  -H "${auth_header}" \
  -H "${json_header}" \
  -d '{
    "field": "block_key",
    "type": "string",
    "meta": {
      "interface": "input",
      "required": true,
      "width": "half"
    },
    "schema": {
      "is_nullable": false
    }
  }' || true

curl -fsS -X POST "${DIRECTUS_URL}/fields/block_instances" \
  -H "${auth_header}" \
  -H "${json_header}" \
  -d '{
    "field": "label",
    "type": "string",
    "meta": {
      "interface": "input",
      "required": true,
      "width": "half"
    },
    "schema": {
      "is_nullable": false
    }
  }' || true

curl -fsS -X POST "${DIRECTUS_URL}/fields/block_instances" \
  -H "${auth_header}" \
  -H "${json_header}" \
  -d '{
    "field": "sort",
    "type": "integer",
    "meta": {
      "interface": "input",
      "width": "half"
    },
    "schema": {
      "default_value": 1,
      "is_nullable": true
    }
  }' || true

curl -fsS -X POST "${DIRECTUS_URL}/fields/block_instances" \
  -H "${auth_header}" \
  -H "${json_header}" \
  -d '{
    "field": "repeatable",
    "type": "boolean",
    "meta": {
      "interface": "boolean",
      "width": "half"
    },
    "schema": {
      "default_value": false,
      "is_nullable": true
    }
  }' || true

curl -fsS -X POST "${DIRECTUS_URL}/fields/block_instances" \
  -H "${auth_header}" \
  -H "${json_header}" \
  -d '{
    "field": "data",
    "type": "json",
    "meta": {
      "interface": "input-code",
      "options": {
        "language": "json"
      },
      "width": "full"
    },
    "schema": {
      "is_nullable": true
    }
  }' || true

echo
echo "Done. Verifying..."
echo
curl -fsS "${DIRECTUS_URL}/collections/block_instances" -H "${auth_header}"
echo
