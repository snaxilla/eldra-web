<script setup lang="ts">
const props = defineProps<{
  classEntity?: any
}>()

const emit = defineEmits<{
  (event: 'update:payload', payload: Record<string, any>): void
  (event: 'update:complete', complete: boolean): void
}>()

const selectedPackageKey = ref('')

function asObject(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function parseJsonish(value: any): any {
  if (typeof value !== 'string') return value

  const trimmed = value.trim()
  if (!trimmed) return value

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(
        trimmed
          .replace(/:\s*True\b/g, ': true')
          .replace(/:\s*False\b/g, ': false')
          .replace(/:\s*None\b/g, ': null')
      )
    } catch {
      return value
    }
  }

  return value
}

function blockData(entity: any, key: string) {
  const blocks = Array.isArray(entity?.blocks) ? entity.blocks : []
  const block = blocks.find((item: any) =>
    String(item?.block_key || item?.blockKey || '') === key
  )

  return asObject(block?.data)
}

function rawJson(entity: any) {
  const source = blockData(entity, 'import_source')
  return asObject(parseJsonish(source.raw_json ?? source.rawJson))
}

function clean5eText(value: any) {
  return String(value ?? '')
    .replace(/\{@(?:feat|skill|item|spell|filter|book|action|variantrule|condition|class|race|creature|damage|sense|status)\s+([^|}]+)(?:\|[^}]*)?\}/gi, '$1')
    .replace(/\{@(?:i|b|dice|damage|hit|dc|scaledice|scaledamage)\s+([^}]+)\}/gi, '$1')
    .replace(/\{@[^}]+\}/g, '')
    .replace(/[#*_`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleCase(value: any) {
  return clean5eText(value)
    .replace(/\|[A-Za-z0-9_.:-]+(?:\|[^,\n;)]*)?/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\b([A-Za-z]+)'S\b/g, "$1's")
}

function dedupeValues(values: any[]) {
  const seen = new Set<string>()
  const out: string[] = []

  for (const value of Array.isArray(values) ? values : []) {
    const text = clean5eText(value)
    const key = text.toLowerCase()

    if (!text || seen.has(key)) continue

    seen.add(key)
    out.push(text)
  }

  return out
}

function itemNameFromRef(value: any) {
  const text = clean5eText(value)
  const first = text.split('|')[0] || text
  return titleCase(first)
}

function currencyFromCopper(value: any) {
  const copper = Number(value)
  if (!Number.isFinite(copper) || copper <= 0) return ''

  if (copper % 100 === 0) return `${copper / 100} GP`
  if (copper % 10 === 0) return `${copper / 10} SP`
  return `${copper} CP`
}

function currencyFromText(value: any) {
  const text = clean5eText(value)
  const matches = Array.from(text.matchAll(/(\d+)\s*(PP|GP|SP|CP|Gold Pieces?|Silver Pieces?|Copper Pieces?|Platinum Pieces?)/gi))

  return dedupeValues(matches.map((match) => {
    const amount = Number(match[1] || 0)
    const unitText = String(match[2] || '').toLowerCase()

    if (!amount) return ''

    const unit = unitText.startsWith('platinum') || unitText === 'pp'
      ? 'PP'
      : unitText.startsWith('silver') || unitText === 'sp'
        ? 'SP'
        : unitText.startsWith('copper') || unitText === 'cp'
          ? 'CP'
          : 'GP'

    return `${amount} ${unit}`
  }))
}

function classEquipmentChoiceText(raw: any) {
  const equipment = raw?.startingEquipment || raw?.starting_equipment || raw?.equipment
  const entries = equipment?.entries

  if (Array.isArray(entries)) {
    return entries.map(clean5eText).filter(Boolean).join('\n')
  }

  return clean5eText(entries || equipment || '')
}

function segmentForChoice(text: string, choice: string) {
  const clean = clean5eText(text)
    .replace(/\s+/g, ' ')
    .trim()

  if (!clean) return ''

  const aMatch = /\(A\)/i.exec(clean)
  const bMatch = /\(B\)/i.exec(clean)

  if (choice === 'A') {
    if (!aMatch) return ''
    const start = aMatch.index + aMatch[0].length
    const end = bMatch ? bMatch.index : clean.length

    return clean
      .slice(start, end)
      .replace(/;\s*or\s*$/i, '')
      .replace(/\s+or\s*$/i, '')
      .replace(/^[:;\s]+/, '')
      .trim()
  }

  if (!bMatch) return ''

  return clean
    .slice(bMatch.index + bMatch[0].length)
    .replace(/^[:;\s]+/, '')
    .trim()
}

function equipmentItemFromText(value: any) {
  const text = clean5eText(value)
    .replace(/choose\s+a\s+or\s+b\s*:/gi, '')
    .replace(/\(A\)|\(B\)/gi, '')
    .replace(/^and\s+/i, '')
    .replace(/^or\s+/i, '')
    .trim()

  if (!text) return ''
  if (/^\d+\s*(?:PP|GP|SP|CP|Gold Pieces?|Silver Pieces?|Copper Pieces?|Platinum Pieces?)$/i.test(text)) return ''
  if (/^(?:PP|GP|SP|CP|Gold Pieces?|Silver Pieces?|Copper Pieces?|Platinum Pieces?)$/i.test(text)) return ''
  if (/^or$/i.test(text)) return ''

  return titleCase(text)
}

function equipmentFromTextSegment(value: any) {
  const text = clean5eText(value)

  return dedupeValues(
    text
      .split(/\n|,|;/)
      .map(equipmentItemFromText)
      .filter(Boolean)
  )
}

function equipmentFromEntry(entry: any) {
  const parsed = parseJsonish(entry)

  if (!parsed) return {
    equipment: [],
    currency: []
  }

  if (Array.isArray(parsed)) {
    const equipment: string[] = []
    const currency: string[] = []

    for (const item of parsed) {
      const result = equipmentFromEntry(item)
      equipment.push(...result.equipment)
      currency.push(...result.currency)
    }

    return {
      equipment: dedupeValues(equipment),
      currency: dedupeValues(currency)
    }
  }

  if (typeof parsed === 'object') {
    if (parsed.item) {
      const name = itemNameFromRef(parsed.item)
      const quantity = Math.max(1, Number(parsed.quantity || parsed.count || 1) || 1)

      return {
        equipment: [quantity > 1 ? `${quantity} ${name}` : name],
        currency: []
      }
    }

    if (parsed.special) {
      return {
        equipment: [titleCase(parsed.special)].filter(Boolean),
        currency: []
      }
    }

    if (parsed.value !== undefined) {
      return {
        equipment: [],
        currency: [currencyFromCopper(parsed.value)].filter(Boolean)
      }
    }

    if (parsed.equipment) return equipmentFromEntry(parsed.equipment)
    if (parsed.items) return equipmentFromEntry(parsed.items)
    if (parsed.entries) return equipmentFromEntry(parsed.entries)
    if (parsed.defaultData) return equipmentFromEntry(parsed.defaultData)

    return {
      equipment: [],
      currency: []
    }
  }

  return {
    equipment: equipmentFromTextSegment(parsed),
    currency: currencyFromText(parsed)
  }
}

function packageFromDefaultData(key: string, entries: any[]) {
  const result = equipmentFromEntry(entries)

  return {
    key,
    label: key === 'A' ? 'A - Starting equipment package' : `${key} - Gold option`,
    equipment: result.equipment,
    currency: result.currency,
    note: key === 'A'
      ? 'Class starting gear.'
      : 'Take starting gold instead of class gear.'
  }
}

function packagesFromDefaultData(raw: any) {
  const defaultData = raw?.startingEquipment?.defaultData

  if (!Array.isArray(defaultData)) return []

  const packages: any[] = []

  for (const row of defaultData) {
    const obj = asObject(row)

    for (const key of Object.keys(obj).sort()) {
      const upperKey = key.toUpperCase()
      if (!['A', 'B', 'C', 'D'].includes(upperKey)) continue

      packages.push(packageFromDefaultData(upperKey, Array.isArray(obj[key]) ? obj[key] : [obj[key]]))
    }
  }

  return packages
}

function packagesFromText(raw: any) {
  const text = classEquipmentChoiceText(raw)
  if (!text || !/\(A\)/i.test(text)) return []

  return ['A', 'B']
    .map((key) => {
      const segment = segmentForChoice(text, key)
      if (!segment) return null

      return {
        key,
        label: key === 'A' ? 'A - Starting equipment package' : 'B - Gold option',
        equipment: key === 'A' ? equipmentFromTextSegment(segment) : [],
        currency: currencyFromText(segment),
        note: key === 'A'
          ? 'Class starting gear.'
          : 'Take starting gold instead of class gear.'
      }
    })
    .filter(Boolean)
}

const equipmentPackages = computed(() => {
  const raw = rawJson(props.classEntity)
  const fromDefault = packagesFromDefaultData(raw)

  if (fromDefault.length) return fromDefault

  return packagesFromText(raw)
})

const selectedPackage = computed(() =>
  equipmentPackages.value.find((option: any) => option.key === selectedPackageKey.value) || null
)

const choicesComplete = computed(() =>
  !equipmentPackages.value.length || Boolean(selectedPackage.value)
)

const payload = computed(() => {
  const selected = selectedPackage.value
  const out: Record<string, any> = {}

  if (!selected) return out

  if (selected.equipment?.length) {
    out['class-equipment'] = {
      label: 'Class Equipment',
      values: selected.equipment,
      note: `Chosen class equipment option ${selected.key}.`
    }
  }

  if (selected.currency?.length) {
    out['class-currency'] = {
      label: 'Class Currency',
      values: selected.currency,
      note: `Chosen class equipment option ${selected.key}.`
    }
  }

  return out
})

watch(
  () => props.classEntity?.id,
  () => {
    selectedPackageKey.value = ''
  }
)

watch(
  payload,
  (value) => emit('update:payload', value),
  { immediate: true, deep: true }
)

watch(
  choicesComplete,
  (value) => emit('update:complete', value),
  { immediate: true }
)
</script>

<template>
  <div
    v-if="equipmentPackages.length"
    class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(20,17,12,0.52)] p-3"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div class="text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Required Class Equipment</div>
        <div class="mt-1 text-sm font-semibold text-white">Starting Equipment</div>
        <div class="mt-1 text-xs leading-5 text-[#9f9278]">
          Choose the class starting package or starting gold.
        </div>
      </div>

      <div
        class="rounded-none border px-2 py-0.5 text-[10px]"
        :class="choicesComplete ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100' : 'border-amber-300/25 bg-amber-400/10 text-amber-100'"
      >
        {{ choicesComplete ? 'Complete' : 'Needed' }}
      </div>
    </div>

    <label class="mt-3 block">
      <span class="mb-1 block text-xs uppercase tracking-[0.18em] text-[#9f9278]">Equipment Package</span>

      <select
        v-model="selectedPackageKey"
        class="eldra-input w-full rounded-none px-3 py-2 text-sm text-white"
      >
        <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose...</option>
        <option
          v-for="option in equipmentPackages"
          :key="option.key"
          :value="option.key"
          class="bg-[#090909] text-[#f5e7bd]"
        >
          {{ option.label }}
        </option>
      </select>
    </label>

    <div
      v-if="selectedPackage"
      class="mt-3 rounded-none border border-[rgba(65,82,103,0.50)] bg-[rgba(8,17,27,0.52)] p-3 text-xs leading-5 text-[#d8ceb8]"
    >
      <div class="font-semibold text-white">{{ selectedPackage.label }}</div>

      <div v-if="selectedPackage.equipment?.length" class="mt-2">
        <span class="font-semibold text-white">Equipment:</span>
        {{ selectedPackage.equipment.join(', ') }}
      </div>

      <div v-if="selectedPackage.currency?.length" class="mt-1">
        <span class="font-semibold text-white">Currency:</span>
        {{ selectedPackage.currency.join(', ') }}
      </div>
    </div>

    <div
      v-if="Object.keys(payload).length"
      class="mt-3 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(20,17,12,0.42)] p-3"
    >
      <div class="text-[10px] uppercase tracking-[0.24em] text-[#9f9278]">Class Equipment Benefits</div>

      <div class="mt-2 grid gap-2">
        <div
          v-for="choice in Object.values(payload)"
          :key="choice.label"
          class="rounded-none border border-[rgba(65,82,103,0.50)] bg-[rgba(8,17,27,0.52)] p-2 text-xs leading-5"
        >
          <span class="font-semibold text-white">{{ choice.label }}:</span>
          <span class="text-[#d8ceb8]"> {{ choice.values.join(', ') }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
