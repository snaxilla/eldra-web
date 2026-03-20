#!/usr/bin/env bash
set -euo pipefail

DIRECTUS_URL="http://ledouxvps-directus-269351-187-77-194-11.traefik.me"
DIRECTUS_TOKEN="7cdKmMbWeSelf1lDKwibPokHoo61HTlb"

auth_header="Authorization: Bearer ${DIRECTUS_TOKEN}"
json_header="Content-Type: application/json"

echo "Creating collection: worlds"
curl -fsS -X POST "${DIRECTUS_URL}/collections" \
  -H "${auth_header}" \
  -H "${json_header}" \
  -d '{
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
  }' || true

echo "Creating fields for: worlds"
curl -fsS -X POST "${DIRECTUS_URL}/fields/worlds" \
  -H "${auth_header}" \
  -H "${json_header}" \
  -d '{
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
  }' || true

curl -fsS -X POST "${DIRECTUS_URL}/fields/worlds" \
  -H "${auth_header}" \
  -H "${json_header}" \
  -d '{
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
  }' || true

curl -fsS -X POST "${DIRECTUS_URL}/fields/worlds" \
  -H "${auth_header}" \
  -H "${json_header}" \
  -d '{
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
  }' || true

curl -fsS -X POST "${DIRECTUS_URL}/fields/worlds" \
  -H "${auth_header}" \
  -H "${json_header}" \
  -d '{
    "field": "description",
    "type": "text",
    "meta": {
      "interface": "input-multiline",
      "width": "full"
    },
    "schema": {
      "is_nullable": true
    }
  }' || true

curl -fsS -X POST "${DIRECTUS_URL}/fields/worlds" \
  -H "${auth_header}" \
  -H "${json_header}" \
  -d '{
    "field": "visibility",
    "type": "string",
    "meta": {
      "interface": "select-dropdown",
      "options": {
        "choices": [
          { "text": "Private", "value": "private" },
          { "text": "World", "value": "world" },
          { "text": "Public", "value": "public" }
        ]
      },
      "width": "half"
    },
    "schema": {
      "default_value": "private",
      "is_nullable": true
    }
  }' || true

curl -fsS -X POST "${DIRECTUS_URL}/fields/worlds" \
  -H "${auth_header}" \
  -H "${json_header}" \
  -d '{
    "field": "owner",
    "type": "uuid",
    "meta": {
      "interface": "select-dropdown-m2o",
      "special": ["m2o"],
      "options": {
        "template": "{{first_name}} {{last_name}} ({{email}})"
      },
      "width": "half"
    },
    "schema": {
      "is_nullable": true,
      "foreign_key_table": "directus_users",
      "foreign_key_column": "id"
    }
  }' || true

echo "Creating collection: entities"
curl -fsS -X POST "${DIRECTUS_URL}/collections" \
  -H "${auth_header}" \
  -H "${json_header}" \
  -d '{
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
  }' || true

echo "Creating fields for: entities"
curl -fsS -X POST "${DIRECTUS_URL}/fields/entities" \
  -H "${auth_header}" \
  -H "${json_header}" \
  -d '{
    "field": "title",
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

curl -fsS -X POST "${DIRECTUS_URL}/fields/entities" \
  -H "${auth_header}" \
  -H "${json_header}" \
  -d '{
    "field": "slug",
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

curl -fsS -X POST "${DIRECTUS_URL}/fields/entities" \
  -H "${auth_header}" \
  -H "${json_header}" \
  -d '{
    "field": "world",
    "type": "uuid",
    "meta": {
      "interface": "select-dropdown-m2o",
      "special": ["m2o"],
      "options": {
        "template": "{{name}}"
      },
      "required": true,
      "width": "half"
    },
    "schema": {
      "is_nullable": false,
      "foreign_key_table": "worlds",
      "foreign_key_column": "id"
    }
  }' || true

curl -fsS -X POST "${DIRECTUS_URL}/fields/entities" \
  -H "${auth_header}" \
  -H "${json_header}" \
  -d '{
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
  }' || true

curl -fsS -X POST "${DIRECTUS_URL}/fields/entities" \
  -H "${auth_header}" \
  -H "${json_header}" \
  -d '{
    "field": "entity_type",
    "type": "string",
    "meta": {
      "interface": "select-dropdown",
      "options": {
        "choices": [
          { "text": "Article", "value": "article" },
          { "text": "Character", "value": "character" },
          { "text": "Spell", "value": "spell" },
          { "text": "Item", "value": "item" },
          { "text": "Background", "value": "background" },
          { "text": "Feat", "value": "feat" },
          { "text": "Class", "value": "class" },
          { "text": "Subclass", "value": "subclass" },
          { "text": "Monster", "value": "monster" }
        ]
      },
      "required": true,
      "width": "half"
    },
    "schema": {
      "is_nullable": false
    }
  }' || true

curl -fsS -X POST "${DIRECTUS_URL}/fields/entities" \
  -H "${auth_header}" \
  -H "${json_header}" \
  -d '{
    "field": "status",
    "type": "string",
    "meta": {
      "interface": "select-dropdown",
      "options": {
        "choices": [
          { "text": "Draft", "value": "draft" },
          { "text": "Published", "value": "published" },
          { "text": "Archived", "value": "archived" }
        ]
      },
      "width": "half"
    },
    "schema": {
      "default_value": "draft",
      "is_nullable": true
    }
  }' || true

curl -fsS -X POST "${DIRECTUS_URL}/fields/entities" \
  -H "${auth_header}" \
  -H "${json_header}" \
  -d '{
    "field": "visibility",
    "type": "string",
    "meta": {
      "interface": "select-dropdown",
      "options": {
        "choices": [
          { "text": "Private", "value": "private" },
          { "text": "World", "value": "world" },
          { "text": "Public", "value": "public" }
        ]
      },
      "width": "half"
    },
    "schema": {
      "default_value": "world",
      "is_nullable": true
    }
  }' || true

curl -fsS -X POST "${DIRECTUS_URL}/fields/entities" \
  -H "${auth_header}" \
  -H "${json_header}" \
  -d '{
    "field": "summary",
    "type": "text",
    "meta": {
      "interface": "input-multiline",
      "width": "full"
    },
    "schema": {
      "is_nullable": true
    }
  }' || true

echo
echo "Done. Verifying..."
echo

curl -fsS "${DIRECTUS_URL}/collections/worlds" -H "${auth_header}"
echo
curl -fsS "${DIRECTUS_URL}/collections/entities" -H "${auth_header}"
echo
