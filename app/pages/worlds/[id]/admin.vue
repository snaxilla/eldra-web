<script setup lang="ts">
definePageMeta({
  layout: 'world-workspace'
})

import WorldEntityContextDrawer from '~/components/world/WorldEntityContextDrawer.vue'

const route = useRoute()
const router = useRouter()

const worldId = computed(() => String(route.params.id || ''))
const mode = useState<'play' | 'build'>('world-workspace-mode', () => 'play')

const activePanel = ref<'overview' | 'party' | 'grants' | 'homebrew' | 'setup' | 'transfers' | 'relationships'>('overview')
const partySearch = ref('')
const selectedContextEntity = ref<any | null>(null)
const contextDrawerOpen = ref(false)

const grantTargetEntityId = ref('')
const itemSearch = ref('')
const itemSearchPending = ref(false)
const itemResults = ref<any[]>([])
const selectedItem = ref<any | null>(null)
const customItemName = ref('')
const itemGrantQuantity = ref('1')
const itemGrantNotes = ref('Granted by Game Admin')

const currencyTargetEntityId = ref('')
const currencyType = ref('Gold')
const currencyAmount = ref('1')
const currencyNotes = ref('Granted by Game Admin')
const grantSaving = ref(false)
const grantError = ref('')
const grantSuccess = ref('')

let itemSearchTimer: ReturnType<typeof setTimeout> | null = null

const {
  data: partyPayload,
  pending: partyPending,
  refresh: refreshParty
} = await useFetch(
  () => `/api/worlds/${worldId.value}/entities?summary=1&type=character,npc,npc_sheet,pc,player_character&limit=250`,
  {
    default: () => [],
    watch: [worldId]
  }
)

const {
  data: relationshipsPayload,
  pending: relationshipsPending,
  refresh: refreshRelationships
} = await useFetch(
  () => `/api/worlds/${worldId.value}/relationships?limit=80`,
  {
    default: () => ({
      relationships: [],
      outgoing: [],
      incoming: []
    }),
    watch: [worldId]
  }
)

const {
  data: transferPayload,
  pending: transfersPending,
  refresh: refreshTransfers
} = await useFetch(
  () => `/api/worlds/${worldId.value}/admin/transfers?limit=60`,
  {
    default: () => ({
      transfers: []
    }),
    watch: [worldId]
  }
)

const {
  data: itemHealthPayload,
  pending: itemHealthPending
} = await useFetch(
  () => `/api/worlds/${worldId.value}/items/normalized?equippable=1&limit=12`,
  {
    default: () => ({
      items: [],
      count: 0,
      returned: 0
    }),
    watch: [worldId]
  }
)

const partyEntities = computed(() =>
  Array.isArray(partyPayload.value) ? partyPayload.value : []
)

const relationships = computed(() =>
  Array.isArray((relationshipsPayload.value as any)?.relationships)
    ? (relationshipsPayload.value as any).relationships
    : []
)

const transfers = computed(() =>
  Array.isArray((transferPayload.value as any)?.transfers)
    ? (transferPayload.value as any).transfers
    : []
)

const grantTargets = computed(() =>
  partyEntities.value.filter((entity: any) => entityId(entity))
)

const filteredParty = computed(() => {
  const q = partySearch.value.trim().toLowerCase()

  return partyEntities.value
    .filter((entity: any) => {
      if (!q) return true

      return [
        entity?.title,
        entity?.name,
        entity?.slug,
        entity?.summary,
        entityTypeLabel(entity)
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
    .sort((a: any, b: any) => String(a?.title || '').localeCompare(String(b?.title || '')))
})

const pendingTransfers = computed(() =>
  transfers.value.filter((transfer: any) =>
    ['offered', 'pending'].includes(String(transfer?.status || '').toLowerCase())
  )
)

const completedTransfers = computed(() =>
  transfers.value.filter((transfer: any) =>
    ['completed', 'granted'].includes(String(transfer?.status || '').toLowerCase())
  )
)

const pcCount = computed(() =>
  partyEntities.value.filter((entity: any) => {
    const type = entityType(entity)
    return ['pc', 'player_character', 'character'].includes(type)
  }).length
)

const npcCount = computed(() =>
  partyEntities.value.filter((entity: any) => {
    const type = entityType(entity)
    return ['npc', 'npc_sheet'].includes(type)
  }).length
)

const healthCards = computed(() => [
  {
    label: 'Cast',
    value: partyEntities.value.length,
    sub: `${pcCount.value} PCs / ${npcCount.value} NPCs`
  },
  {
    label: 'Relationships',
    value: relationships.value.length,
    sub: 'World graph links'
  },
  {
    label: 'Transfers',
    value: transfers.value.length,
    sub: `${pendingTransfers.value.length} pending`
  },
  {
    label: 'Equippable Items',
    value: Number((itemHealthPayload.value as any)?.count || 0),
    sub: itemHealthPending.value ? 'Loading...' : 'Normalized catalog'
  }
])


type HomebrewForgeType = 'spell' | 'item' | 'enemy' | 'species' | 'class' | 'feat' | 'background'

const homebrewTypes: Array<{
  key: HomebrewForgeType
  label: string
  description: string
  icon: string
}> = [
  {
    key: 'spell',
    label: 'Spell',
    description: 'Level, school, casting, range, components, duration, and combat delivery.',
    icon: 'i-lucide-sparkles'
  },
  {
    key: 'item',
    label: 'Item',
    description: 'Equipment, weapons, armor, resources, modifiers, and granted actions.',
    icon: 'i-lucide-package'
  },
  {
    key: 'enemy',
    label: 'Enemy',
    description: 'Statblock-ready creatures with CR, abilities, defenses, traits, and actions.',
    icon: 'i-lucide-skull'
  },
  {
    key: 'species',
    label: 'Species',
    description: 'Size, speed, traits, proficiencies, senses, and granted features.',
    icon: 'i-lucide-dna'
  },
  {
    key: 'class',
    label: 'Class',
    description: 'Hit die, proficiencies, saves, spellcasting hooks, and level features.',
    icon: 'i-lucide-shield'
  },
  {
    key: 'feat',
    label: 'Feat',
    description: 'Prerequisites, benefits, granted spells, actions, and mechanical choices.',
    icon: 'i-lucide-badge-plus'
  },
  {
    key: 'background',
    label: 'Background',
    description: 'ASI, skills, tools, languages, feat hooks, and starting flavor.',
    icon: 'i-lucide-scroll-text'
  }
]

const homebrewType = ref<HomebrewForgeType>('spell')
const homebrewTemplateSearch = ref('')
const homebrewTemplates = ref<any[]>([])
const homebrewTemplatesPending = ref(false)
const homebrewSelectedTemplateId = ref('')
const homebrewTitle = ref('')
const homebrewCreating = ref(false)
const homebrewError = ref('')
const homebrewSuccess = ref('')
const homebrewCreatedEntity = ref<any | null>(null)

const selectedHomebrewType = computed(() =>
  homebrewTypes.find((type) => type.key === homebrewType.value) || homebrewTypes[0]
)

const homebrewFilteredTemplates = computed(() => {
  const q = homebrewTemplateSearch.value.trim().toLowerCase()

  return homebrewTemplates.value
    .filter((template: any) => {
      if (!q) return true

      return [
        template.title,
        template.summary,
        template.sourceBook,
        template.metaLine,
        template.entityType
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
    .slice(0, 80)
})

const selectedHomebrewTemplate = computed(() =>
  homebrewTemplates.value.find((template: any) =>
    String(template.id) === String(homebrewSelectedTemplateId.value)
  ) || null
)


const SPELL_SCHOOL_OPTIONS = [
  { value: 'A', label: 'Abjuration' },
  { value: 'C', label: 'Conjuration' },
  { value: 'D', label: 'Divination' },
  { value: 'E', label: 'Enchantment' },
  { value: 'V', label: 'Evocation' },
  { value: 'I', label: 'Illusion' },
  { value: 'N', label: 'Necromancy' },
  { value: 'T', label: 'Transmutation' }
]

const SPELL_LEVEL_OPTIONS = [
  { value: '0', label: 'Cantrip' },
  { value: '1', label: 'Level 1' },
  { value: '2', label: 'Level 2' },
  { value: '3', label: 'Level 3' },
  { value: '4', label: 'Level 4' },
  { value: '5', label: 'Level 5' },
  { value: '6', label: 'Level 6' },
  { value: '7', label: 'Level 7' },
  { value: '8', label: 'Level 8' },
  { value: '9', label: 'Level 9' }
]

const SPELL_ATTACK_OPTIONS = [
  { value: '', label: 'None / Utility' },
  { value: 'spell_attack', label: 'Spell Attack' },
  { value: 'saving_throw', label: 'Saving Throw' },
  { value: 'healing', label: 'Healing' },
  { value: 'summon', label: 'Summon / Control' }
]

const SPELL_SAVE_OPTIONS = [
  { value: '', label: 'No Save' },
  { value: 'str', label: 'Strength' },
  { value: 'dex', label: 'Dexterity' },
  { value: 'con', label: 'Constitution' },
  { value: 'int', label: 'Intelligence' },
  { value: 'wis', label: 'Wisdom' },
  { value: 'cha', label: 'Charisma' }
]

const SPELL_DAMAGE_TYPES = [
  '',
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder'
]

const spellBuilderForm = reactive({
  name: '',
  level: '0',
  school: 'V',
  castingTime: '',
  range: '',
  duration: '',
  components: '',
  ritual: false,
  concentration: false,
  attackType: '',
  saveAbility: '',
  damage: '',
  damageType: '',
  classes: '',
  description: '',
  higherLevel: ''
})

function spellBuilderText(value: any) {
  return String(value ?? '').trim()
}

function spellLevelLabel(value: any) {
  const key = String(value ?? '0')
  return SPELL_LEVEL_OPTIONS.find((option) => option.value === key)?.label || `Level ${key}`
}

function spellSchoolLabel(value: any) {
  const key = String(value || '').toUpperCase()
  return SPELL_SCHOOL_OPTIONS.find((option) => option.value === key)?.label || key || 'School'
}

function spellBuilderBool(value: any) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function hydrateSpellBuilderFromTemplate(template: any) {
  const core = template?.core || {}

  spellBuilderForm.name = spellBuilderText(core.name || template?.title || '')
  spellBuilderForm.level = String(core.level ?? '0')
  spellBuilderForm.school = spellBuilderText(core.school || 'V').toUpperCase()
  spellBuilderForm.castingTime = spellBuilderText(core.casting_time || core.castingTime || '')
  spellBuilderForm.range = spellBuilderText(core.range || '')
  spellBuilderForm.duration = spellBuilderText(core.duration || '')
  spellBuilderForm.components = spellBuilderText(core.components || '')
  spellBuilderForm.ritual = spellBuilderBool(core.ritual)
  spellBuilderForm.concentration = spellBuilderBool(core.concentration)
  spellBuilderForm.attackType = spellBuilderText(core.attack_type || core.attackType || '')
  spellBuilderForm.saveAbility = spellBuilderText(core.save_ability || core.saveAbility || '')
  spellBuilderForm.damage = spellBuilderText(core.damage || '')
  spellBuilderForm.damageType = spellBuilderText(core.damage_type || core.damageType || '')
  spellBuilderForm.classes = spellBuilderText(core.classes || '')
  spellBuilderForm.description = spellBuilderText(core.description || template?.summary || '')
  spellBuilderForm.higherLevel = spellBuilderText(core.higher_level || core.higherLevel || '')

  if (!homebrewTitle.value.trim()) {
    homebrewTitle.value = spellBuilderForm.name
      ? `Homebrew: ${spellBuilderForm.name}`
      : defaultHomebrewTitle(template)
  }
}

function spellBuilderPayload() {
  return {
    name: spellBuilderForm.name,
    level: Number(spellBuilderForm.level || 0),
    school: spellBuilderForm.school,
    castingTime: spellBuilderForm.castingTime,
    range: spellBuilderForm.range,
    duration: spellBuilderForm.duration,
    components: spellBuilderForm.components,
    ritual: spellBuilderForm.ritual,
    concentration: spellBuilderForm.concentration,
    attackType: spellBuilderForm.attackType,
    saveAbility: spellBuilderForm.saveAbility,
    damage: spellBuilderForm.damage,
    damageType: spellBuilderForm.damageType,
    classes: spellBuilderForm.classes,
    description: spellBuilderForm.description,
    higherLevel: spellBuilderForm.higherLevel
  }
}

const spellBuilderSummaryLine = computed(() => {
  if (homebrewType.value !== 'spell') return ''

  return [
    spellLevelLabel(spellBuilderForm.level),
    spellSchoolLabel(spellBuilderForm.school),
    spellBuilderForm.castingTime,
    spellBuilderForm.range,
    spellBuilderForm.duration,
    spellBuilderForm.concentration ? 'Concentration' : '',
    spellBuilderForm.ritual ? 'Ritual' : ''
  ].filter(Boolean).join(' · ')
})

function resetSpellBuilderForm() {
  spellBuilderForm.name = ''
  spellBuilderForm.level = '0'
  spellBuilderForm.school = 'V'
  spellBuilderForm.castingTime = ''
  spellBuilderForm.range = ''
  spellBuilderForm.duration = ''
  spellBuilderForm.components = ''
  spellBuilderForm.ritual = false
  spellBuilderForm.concentration = false
  spellBuilderForm.attackType = ''
  spellBuilderForm.saveAbility = ''
  spellBuilderForm.damage = ''
  spellBuilderForm.damageType = ''
  spellBuilderForm.classes = ''
  spellBuilderForm.description = ''
  spellBuilderForm.higherLevel = ''
}



const ITEM_TYPE_OPTIONS = [
  { value: 'G', label: 'Adventuring Gear / Wondrous' },
  { value: 'M', label: 'Melee Weapon' },
  { value: 'R', label: 'Ranged Weapon' },
  { value: 'A', label: 'Ammunition' },
  { value: 'LA', label: 'Light Armor' },
  { value: 'MA', label: 'Medium Armor' },
  { value: 'HA', label: 'Heavy Armor' },
  { value: 'S', label: 'Shield' },
  { value: 'P', label: 'Potion' },
  { value: 'RD', label: 'Rod' },
  { value: 'WD', label: 'Wand' },
  { value: 'ST', label: 'Staff' },
  { value: 'RG', label: 'Ring' },
  { value: 'SC', label: 'Scroll' },
  { value: 'SCF', label: 'Spellcasting Focus' },
  { value: 'T', label: 'Tool' }
]

const ITEM_RARITY_OPTIONS = [
  'none',
  'common',
  'uncommon',
  'rare',
  'very rare',
  'legendary',
  'artifact'
]

const ITEM_EQUIP_SLOT_OPTIONS = [
  { value: '', label: 'Not Equipped' },
  { value: 'hand', label: 'Hand' },
  { value: 'off_hand', label: 'Off Hand' },
  { value: 'body', label: 'Body / Armor' },
  { value: 'ammo', label: 'Ammunition' },
  { value: 'ring', label: 'Ring' },
  { value: 'neck', label: 'Neck' },
  { value: 'shoulders', label: 'Shoulders' },
  { value: 'head', label: 'Head' },
  { value: 'hands', label: 'Hands' },
  { value: 'feet', label: 'Feet' },
  { value: 'waist', label: 'Waist' },
  { value: 'worn', label: 'Worn' }
]

const ITEM_DAMAGE_TYPES = [
  '',
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder'
]

const ITEM_ACTION_TIMINGS = [
  'Action',
  'Bonus Action',
  'Reaction',
  'Magic Action',
  'Free Action',
  'Other'
]

const ITEM_RECHARGE_OPTIONS = [
  '',
  'short rest',
  'long rest',
  'dawn',
  'daily',
  'charges'
]

const itemBuilderForm = reactive({
  name: '',
  itemType: 'G',
  rarity: 'common',
  requiresAttunement: false,
  attunementText: '',
  equippable: false,
  equipSlot: '',
  weight: '',
  value: '',
  description: '',
  weaponEnabled: false,
  weaponKind: 'melee',
  weaponCategory: '',
  weaponDamage: '',
  weaponDamageType: '',
  weaponRange: '',
  weaponProperties: '',
  magicBonus: '',
  attackBonus: '',
  damageBonus: '',
  armorEnabled: false,
  armorClass: '',
  armorType: 'armor',
  dexCap: '',
  strength: '',
  stealthDisadvantage: false,
  acBonus: '',
  saveBonus: '',
  spellAttackBonus: '',
  spellSaveDcBonus: '',
  grantedActionName: '',
  grantedActionTiming: 'Action',
  grantedActionDetail: '',
  grantedActionUses: '',
  grantedActionRecharge: ''
})

function itemBuilderText(value: any) {
  return String(value ?? '').trim()
}

function itemBuilderBool(value: any) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function itemTypeLabel(value: any) {
  const key = String(value || '').toUpperCase()
  return ITEM_TYPE_OPTIONS.find((option) => option.value === key)?.label || key || 'Item'
}

function hydrateItemBuilderFromTemplate(template: any) {
  const core = template?.core || {}

  itemBuilderForm.name = itemBuilderText(core.name || template?.title || '')
  itemBuilderForm.itemType = itemBuilderText(core.item_type || core.itemType || 'G').split('|')[0].toUpperCase() || 'G'
  itemBuilderForm.rarity = itemBuilderText(core.rarity || 'common')
  itemBuilderForm.requiresAttunement = itemBuilderBool(core.requiresAttunement)
  itemBuilderForm.attunementText = itemBuilderText(core.attunementText || '')
  itemBuilderForm.equippable = itemBuilderBool(core.equippable)
  itemBuilderForm.equipSlot = itemBuilderText(core.equipSlot || '')
  itemBuilderForm.weight = itemBuilderText(core.weight || '')
  itemBuilderForm.value = itemBuilderText(core.value || '')
  itemBuilderForm.description = itemBuilderText(core.description || template?.summary || '')

  itemBuilderForm.weaponEnabled = itemBuilderBool(core.weaponKind || core.damage || ['M', 'R', 'A'].includes(itemBuilderForm.itemType))
  itemBuilderForm.weaponKind = itemBuilderText(core.weaponKind || (itemBuilderForm.itemType === 'R' ? 'ranged' : 'melee'))
  itemBuilderForm.weaponCategory = itemBuilderText(core.weaponCategory || '')
  itemBuilderForm.weaponDamage = itemBuilderText(core.damage || '')
  itemBuilderForm.weaponDamageType = itemBuilderText(core.damageType || core.damage_type || '')
  itemBuilderForm.weaponRange = itemBuilderText(core.weaponRange || '')
  itemBuilderForm.weaponProperties = itemBuilderText(core.weaponProperties || '')
  itemBuilderForm.magicBonus = itemBuilderText(core.magicBonus || '')
  itemBuilderForm.attackBonus = itemBuilderText(core.attackBonus || '')
  itemBuilderForm.damageBonus = itemBuilderText(core.damageBonus || '')

  itemBuilderForm.armorEnabled = itemBuilderBool(core.armorClass || ['LA', 'MA', 'HA', 'S'].includes(itemBuilderForm.itemType))
  itemBuilderForm.armorClass = itemBuilderText(core.armorClass || '')
  itemBuilderForm.armorType = itemBuilderText(core.armorType || (itemBuilderForm.itemType === 'S' ? 'shield' : 'armor'))
  itemBuilderForm.dexCap = itemBuilderText(core.dexCap || '')
  itemBuilderForm.strength = itemBuilderText(core.strength || '')
  itemBuilderForm.stealthDisadvantage = itemBuilderBool(core.stealthDisadvantage)

  itemBuilderForm.acBonus = itemBuilderText(core.acBonus || '')
  itemBuilderForm.saveBonus = itemBuilderText(core.saveBonus || '')
  itemBuilderForm.spellAttackBonus = itemBuilderText(core.spellAttackBonus || '')
  itemBuilderForm.spellSaveDcBonus = itemBuilderText(core.spellSaveDcBonus || '')

  itemBuilderForm.grantedActionName = itemBuilderText(core.grantedActionName || '')
  itemBuilderForm.grantedActionTiming = itemBuilderText(core.grantedActionTiming || 'Action')
  itemBuilderForm.grantedActionDetail = itemBuilderText(core.grantedActionDetail || '')
  itemBuilderForm.grantedActionUses = itemBuilderText(core.grantedActionUses || '')
  itemBuilderForm.grantedActionRecharge = itemBuilderText(core.grantedActionRecharge || '')

  if (!homebrewTitle.value.trim()) {
    homebrewTitle.value = itemBuilderForm.name
      ? `Homebrew: ${itemBuilderForm.name}`
      : defaultHomebrewTitle(template)
  }
}

function resetItemBuilderForm() {
  itemBuilderForm.name = ''
  itemBuilderForm.itemType = 'G'
  itemBuilderForm.rarity = 'common'
  itemBuilderForm.requiresAttunement = false
  itemBuilderForm.attunementText = ''
  itemBuilderForm.equippable = false
  itemBuilderForm.equipSlot = ''
  itemBuilderForm.weight = ''
  itemBuilderForm.value = ''
  itemBuilderForm.description = ''
  itemBuilderForm.weaponEnabled = false
  itemBuilderForm.weaponKind = 'melee'
  itemBuilderForm.weaponCategory = ''
  itemBuilderForm.weaponDamage = ''
  itemBuilderForm.weaponDamageType = ''
  itemBuilderForm.weaponRange = ''
  itemBuilderForm.weaponProperties = ''
  itemBuilderForm.magicBonus = ''
  itemBuilderForm.attackBonus = ''
  itemBuilderForm.damageBonus = ''
  itemBuilderForm.armorEnabled = false
  itemBuilderForm.armorClass = ''
  itemBuilderForm.armorType = 'armor'
  itemBuilderForm.dexCap = ''
  itemBuilderForm.strength = ''
  itemBuilderForm.stealthDisadvantage = false
  itemBuilderForm.acBonus = ''
  itemBuilderForm.saveBonus = ''
  itemBuilderForm.spellAttackBonus = ''
  itemBuilderForm.spellSaveDcBonus = ''
  itemBuilderForm.grantedActionName = ''
  itemBuilderForm.grantedActionTiming = 'Action'
  itemBuilderForm.grantedActionDetail = ''
  itemBuilderForm.grantedActionUses = ''
  itemBuilderForm.grantedActionRecharge = ''
}

function itemBuilderPayload() {
  return {
    name: itemBuilderForm.name,
    itemType: itemBuilderForm.itemType,
    rarity: itemBuilderForm.rarity,
    requiresAttunement: itemBuilderForm.requiresAttunement,
    attunementText: itemBuilderForm.attunementText,
    equippable: itemBuilderForm.equippable,
    equipSlot: itemBuilderForm.equipSlot,
    weight: itemBuilderForm.weight,
    value: itemBuilderForm.value,
    description: itemBuilderForm.description,
    weaponEnabled: itemBuilderForm.weaponEnabled,
    weaponKind: itemBuilderForm.weaponKind,
    weaponCategory: itemBuilderForm.weaponCategory,
    damage: itemBuilderForm.weaponDamage,
    damageType: itemBuilderForm.weaponDamageType,
    weaponRange: itemBuilderForm.weaponRange,
    weaponProperties: itemBuilderForm.weaponProperties,
    magicBonus: itemBuilderForm.magicBonus,
    attackBonus: itemBuilderForm.attackBonus,
    damageBonus: itemBuilderForm.damageBonus,
    armorEnabled: itemBuilderForm.armorEnabled,
    armorClass: itemBuilderForm.armorClass,
    armorType: itemBuilderForm.armorType,
    dexCap: itemBuilderForm.dexCap,
    strength: itemBuilderForm.strength,
    stealthDisadvantage: itemBuilderForm.stealthDisadvantage,
    acBonus: itemBuilderForm.acBonus,
    saveBonus: itemBuilderForm.saveBonus,
    spellAttackBonus: itemBuilderForm.spellAttackBonus,
    spellSaveDcBonus: itemBuilderForm.spellSaveDcBonus,
    grantedActionName: itemBuilderForm.grantedActionName,
    grantedActionTiming: itemBuilderForm.grantedActionTiming,
    grantedActionDetail: itemBuilderForm.grantedActionDetail,
    grantedActionUses: itemBuilderForm.grantedActionUses,
    grantedActionRecharge: itemBuilderForm.grantedActionRecharge
  }
}

const itemBuilderSummaryLine = computed(() => {
  if (homebrewType.value !== 'item') return ''

  return [
    itemTypeLabel(itemBuilderForm.itemType),
    itemBuilderForm.rarity,
    itemBuilderForm.requiresAttunement ? 'Attunement' : '',
    itemBuilderForm.equippable ? itemBuilderForm.equipSlot || 'Equippable' : '',
    itemBuilderForm.weaponEnabled && itemBuilderForm.weaponDamage ? itemBuilderForm.weaponDamage : '',
    itemBuilderForm.armorEnabled && itemBuilderForm.armorClass ? `AC ${itemBuilderForm.armorClass}` : ''
  ].filter(Boolean).join(' · ')
})


function defaultHomebrewTitle(template: any) {
  const title = String(template?.title || selectedHomebrewType.value?.label || 'Homebrew').trim()
  return title.startsWith('Homebrew:')
    ? title
    : `Homebrew: ${title}`
}

function homebrewTemplateSubtitle(template: any) {
  return [
    template?.sourceBook,
    template?.sourcePage ? `p.${template.sourcePage}` : '',
    template?.entityType,
    template?.blockCount ? `${template.blockCount} blocks` : ''
  ].filter(Boolean).join(' · ')
}

function selectHomebrewTemplate(template: any) {
  homebrewSelectedTemplateId.value = String(template?.id || '')
  homebrewSuccess.value = ''
  homebrewError.value = ''

  if (homebrewType.value === 'spell') {
    hydrateSpellBuilderFromTemplate(template)
  }

  if (homebrewType.value === 'item') {
    hydrateItemBuilderFromTemplate(template)
  }

  if (!homebrewTitle.value.trim()) {
    homebrewTitle.value = defaultHomebrewTitle(template)
  }
}

async function loadHomebrewTemplates() {
  if (!worldId.value) return

  homebrewTemplatesPending.value = true
  homebrewError.value = ''

  try {
    const res: any = await $fetch(`/api/worlds/${worldId.value}/homebrew/templates`, {
      query: {
        type: homebrewType.value
      }
    })

    homebrewTemplates.value = Array.isArray(res?.templates) ? res.templates : []

    if (
      homebrewSelectedTemplateId.value &&
      !homebrewTemplates.value.some((template: any) => String(template.id) === String(homebrewSelectedTemplateId.value))
    ) {
      homebrewSelectedTemplateId.value = ''
    }
  } catch (error: any) {
    homebrewError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to load homebrew templates.'
    homebrewTemplates.value = []
  } finally {
    homebrewTemplatesPending.value = false
  }
}


type HomebrewCheckStatus = 'ok' | 'warn' | 'error'

function homebrewHasText(value: any) {
  return String(value ?? '').trim().length > 0
}

function homebrewNumberText(value: any) {
  const text = String(value ?? '').trim()
  if (!text) return ''

  return text.startsWith('+') || text.startsWith('-')
    ? text
    : text
}

function homebrewReviewValue(value: any, fallback = '—') {
  const text = String(value ?? '').trim()
  return text || fallback
}

const homebrewDraftTitlePreview = computed(() => {
  if (homebrewType.value === 'spell') {
    return homebrewTitle.value.trim() ||
      spellBuilderForm.name.trim() ||
      (selectedHomebrewTemplate.value ? defaultHomebrewTitle(selectedHomebrewTemplate.value) : '')
  }

  if (homebrewType.value === 'item') {
    return homebrewTitle.value.trim() ||
      itemBuilderForm.name.trim() ||
      (selectedHomebrewTemplate.value ? defaultHomebrewTitle(selectedHomebrewTemplate.value) : '')
  }

  return homebrewTitle.value.trim() ||
    (selectedHomebrewTemplate.value ? defaultHomebrewTitle(selectedHomebrewTemplate.value) : '')
})

const homebrewDraftChecks = computed(() => {
  const checks: Array<{
    status: HomebrewCheckStatus
    label: string
    detail: string
  }> = []

  function push(status: HomebrewCheckStatus, label: string, detail: string) {
    checks.push({ status, label, detail })
  }

  if (!selectedHomebrewTemplate.value) {
    push('error', 'Template Required', 'Choose a template before creating a homebrew draft.')
    return checks
  }

  if (!homebrewHasText(homebrewDraftTitlePreview.value)) {
    push('error', 'Title Required', 'Give the draft a title.')
  }

  if (homebrewType.value === 'spell') {
    if (!homebrewHasText(spellBuilderForm.name)) {
      push('error', 'Spell Name Required', 'Set the spell name before creating the draft.')
    }

    if (!homebrewHasText(spellBuilderForm.description)) {
      push('warn', 'Description Empty', 'The spell can be created, but its article and overview will be thin.')
    }

    if (spellBuilderForm.attackType === 'saving_throw' && !homebrewHasText(spellBuilderForm.saveAbility)) {
      push('error', 'Save Ability Required', 'Saving throw spells need a Strength, Dexterity, Constitution, Intelligence, Wisdom, or Charisma save.')
    }

    if (homebrewHasText(spellBuilderForm.damageType) && !homebrewHasText(spellBuilderForm.damage)) {
      push('warn', 'Damage Dice Missing', 'A damage type is set, but no damage/healing dice were entered.')
    }

    if (homebrewHasText(spellBuilderForm.damage) && !homebrewHasText(spellBuilderForm.damageType)) {
      push('warn', 'Damage Type Missing', 'Damage/healing dice are set, but no damage type is selected.')
    }

    if (!homebrewHasText(spellBuilderForm.castingTime)) {
      push('warn', 'Casting Time Empty', 'Foundry-style export will eventually need a casting time.')
    }

    if (!homebrewHasText(spellBuilderForm.range)) {
      push('warn', 'Range Empty', 'Foundry-style export will eventually need range.')
    }

    if (!homebrewHasText(spellBuilderForm.duration)) {
      push('warn', 'Duration Empty', 'Foundry-style export will eventually need duration.')
    }
  }

  if (homebrewType.value === 'item') {
    if (!homebrewHasText(itemBuilderForm.name)) {
      push('error', 'Item Name Required', 'Set the item name before creating the draft.')
    }

    if (!homebrewHasText(itemBuilderForm.description)) {
      push('warn', 'Description Empty', 'The item can be created, but its article and overview will be thin.')
    }

    if (itemBuilderForm.equippable && !homebrewHasText(itemBuilderForm.equipSlot)) {
      push('warn', 'Equip Slot Empty', 'Equippable items should usually have a slot.')
    }

    if (itemBuilderForm.requiresAttunement && !homebrewHasText(itemBuilderForm.attunementText)) {
      push('warn', 'Attunement Text Empty', 'Attunement is enabled, but there is no restriction text.')
    }

    if (itemBuilderForm.weaponEnabled && !homebrewHasText(itemBuilderForm.weaponDamage)) {
      push('warn', 'Weapon Damage Empty', 'Weapon profile is enabled without damage dice.')
    }

    if (itemBuilderForm.weaponEnabled && !homebrewHasText(itemBuilderForm.weaponDamageType)) {
      push('warn', 'Weapon Damage Type Empty', 'Weapon profile is enabled without a damage type.')
    }

    if (itemBuilderForm.armorEnabled && !homebrewHasText(itemBuilderForm.armorClass)) {
      push('warn', 'Armor Class Empty', 'Armor/shield profile is enabled without an AC value.')
    }

    if (homebrewHasText(itemBuilderForm.grantedActionDetail) && !homebrewHasText(itemBuilderForm.grantedActionName)) {
      push('warn', 'Granted Action Name Empty', 'Action detail exists, but no action name is set.')
    }
  }

  if (!checks.length) {
    push('ok', 'Ready', 'This draft has the minimum fields Eldra needs.')
  }

  return checks
})

const homebrewBlockingCheckCount = computed(() =>
  homebrewDraftChecks.value.filter((check) => check.status === 'error').length
)

const homebrewWarningCheckCount = computed(() =>
  homebrewDraftChecks.value.filter((check) => check.status === 'warn').length
)

const homebrewCanCreate = computed(() =>
  Boolean(selectedHomebrewTemplate.value) &&
  homebrewBlockingCheckCount.value === 0
)

function homebrewCheckClass(status: HomebrewCheckStatus) {
  if (status === 'error') {
    return 'border-red-400/25 bg-red-500/10 text-red-100'
  }

  if (status === 'warn') {
    return 'border-amber-300/25 bg-amber-400/10 text-amber-100'
  }

  return 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100'
}

const homebrewReviewRows = computed(() => {
  if (!selectedHomebrewTemplate.value) return []

  if (homebrewType.value === 'spell') {
    return [
      ['Title', homebrewDraftTitlePreview.value],
      ['Level', spellLevelLabel(spellBuilderForm.level)],
      ['School', spellSchoolLabel(spellBuilderForm.school)],
      ['Casting', spellBuilderForm.castingTime],
      ['Range', spellBuilderForm.range],
      ['Duration', spellBuilderForm.duration],
      ['Components', spellBuilderForm.components],
      ['Mode', SPELL_ATTACK_OPTIONS.find((option) => option.value === spellBuilderForm.attackType)?.label || 'None / Utility'],
      ['Save', SPELL_SAVE_OPTIONS.find((option) => option.value === spellBuilderForm.saveAbility)?.label || 'No Save'],
      ['Damage', [spellBuilderForm.damage, spellBuilderForm.damageType].filter(Boolean).join(' ')],
      ['Classes', spellBuilderForm.classes]
    ]
  }

  if (homebrewType.value === 'item') {
    return [
      ['Title', homebrewDraftTitlePreview.value],
      ['Type', itemTypeLabel(itemBuilderForm.itemType)],
      ['Rarity', itemBuilderForm.rarity],
      ['Weight', itemBuilderForm.weight],
      ['Value', itemBuilderForm.value],
      ['Equipped', itemBuilderForm.equippable ? itemBuilderForm.equipSlot || 'Equippable' : 'No'],
      ['Attunement', itemBuilderForm.requiresAttunement ? itemBuilderForm.attunementText || 'Required' : 'No'],
      ['Weapon', itemBuilderForm.weaponEnabled ? [itemBuilderForm.weaponDamage, itemBuilderForm.weaponDamageType, itemBuilderForm.weaponRange].filter(Boolean).join(' · ') : 'No'],
      ['Armor', itemBuilderForm.armorEnabled ? `AC ${itemBuilderForm.armorClass || '—'}` : 'No'],
      ['Modifiers', [
        itemBuilderForm.acBonus ? `AC ${homebrewNumberText(itemBuilderForm.acBonus)}` : '',
        itemBuilderForm.saveBonus ? `Save ${homebrewNumberText(itemBuilderForm.saveBonus)}` : '',
        itemBuilderForm.spellAttackBonus ? `Spell Attack ${homebrewNumberText(itemBuilderForm.spellAttackBonus)}` : '',
        itemBuilderForm.spellSaveDcBonus ? `Spell DC ${homebrewNumberText(itemBuilderForm.spellSaveDcBonus)}` : ''
      ].filter(Boolean).join(' · ')],
      ['Granted Action', itemBuilderForm.grantedActionName || itemBuilderForm.grantedActionDetail ? itemBuilderForm.grantedActionName || 'Unnamed Action' : 'No']
    ]
  }

  return [
    ['Title', homebrewDraftTitlePreview.value],
    ['Type', selectedHomebrewType.value.label],
    ['Template', selectedHomebrewTemplate.value?.title || '—']
  ]
})

async function createHomebrewDraft() {
  if (!selectedHomebrewTemplate.value) {
    homebrewError.value = 'Choose a template first.'
    return
  }

  homebrewCreating.value = true
  homebrewError.value = ''
  homebrewSuccess.value = ''
  homebrewCreatedEntity.value = null

  try {
    const res: any = await $fetch(`/api/worlds/${worldId.value}/homebrew/create`, {
      method: 'POST',
      body: {
        type: homebrewType.value,
        templateEntityId: homebrewSelectedTemplateId.value,
        title: homebrewType.value === 'spell'
          ? (homebrewTitle.value || spellBuilderForm.name || defaultHomebrewTitle(selectedHomebrewTemplate.value))
          : (homebrewTitle.value || defaultHomebrewTitle(selectedHomebrewTemplate.value)),
        spell: homebrewType.value === 'spell'
          ? spellBuilderPayload()
          : undefined,
        item: homebrewType.value === 'item'
          ? itemBuilderPayload()
          : undefined
      }
    })

    homebrewCreatedEntity.value = res?.entity || null
    homebrewSuccess.value = `Created ${res?.entity?.title || 'homebrew draft'}.`

    if (res?.entity?.id) {
      router.push(`/worlds/${worldId.value}/entities/${res.entity.id}`)
    }
  } catch (error: any) {
    homebrewError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to create homebrew draft.'
  } finally {
    homebrewCreating.value = false
  }
}

watch(
  () => [worldId.value, homebrewType.value],
  () => {
    homebrewSelectedTemplateId.value = ''
    homebrewTitle.value = ''
    homebrewTemplateSearch.value = ''
    homebrewCreatedEntity.value = null
    homebrewSuccess.value = ''
    resetSpellBuilderForm()
    void loadHomebrewTemplates()
  },
  { immediate: true }
)


const panels = [
  { key: 'overview', label: 'Overview', icon: 'i-lucide-layout-dashboard' },
  { key: 'party', label: 'Party / Cast', icon: 'i-lucide-users' },
  { key: 'grants', label: 'Grants', icon: 'i-lucide-gift' },
  { key: 'homebrew', label: 'Homebrew', icon: 'i-lucide-flask-conical' },
  { key: 'setup', label: 'Page Setup', icon: 'i-lucide-sliders-horizontal' },
  { key: 'transfers', label: 'Transfers', icon: 'i-lucide-arrow-left-right' },
  { key: 'relationships', label: 'Relationships', icon: 'i-lucide-share-2' }
] as const

const pageSetupSections = [
  {
    key: 'characters',
    title: 'Characters',
    description: 'Controls the characters and cast browsing page presentation.'
  },
  {
    key: 'locations',
    title: 'Locations',
    description: 'Controls the locations page presentation and background.'
  },
  {
    key: 'items',
    title: 'Items',
    description: 'Controls the item catalog page presentation and background.'
  },
  {
    key: 'spells',
    title: 'Spells',
    description: 'Controls the spell catalog page presentation and background.'
  },
  {
    key: 'species',
    title: 'Species',
    description: 'Controls the species page presentation and background.'
  },
  {
    key: 'classes',
    title: 'Classes',
    description: 'Controls the classes page presentation and background.'
  },
  {
    key: 'feats',
    title: 'Feats',
    description: 'Controls the feats page presentation and background.'
  },
  {
    key: 'enemies',
    title: 'Enemies',
    description: 'Controls the enemies page presentation and background.'
  },
  {
    key: 'maps',
    title: 'Maps',
    description: 'Controls the maps and world-map presentation background.'
  },
  {
    key: 'timelines',
    title: 'Timelines',
    description: 'Controls timeline list and timeline detail presentation.'
  },
  {
    key: 'entity-article',
    title: 'Entity Articles',
    description: 'Controls the full article page presentation and background.'
  },
  {
    key: 'game-admin',
    title: 'Game Admin',
    description: 'Reserved for Game Admin presentation controls and command-deck polish.'
  }
] as const

const selectedPageSetupKey = ref('characters')

const selectedPageSetup = computed(() =>
  pageSetupSections.find((section) => section.key === selectedPageSetupKey.value) || pageSetupSections[0]
)


watch(
  grantTargets,
  (targets) => {
    const first = targets[0]
    if (!grantTargetEntityId.value && first) grantTargetEntityId.value = entityId(first)
    if (!currencyTargetEntityId.value && first) currencyTargetEntityId.value = entityId(first)
  },
  { immediate: true }
)

watch(itemSearch, () => {
  if (itemSearchTimer) clearTimeout(itemSearchTimer)

  itemSearchTimer = setTimeout(() => {
    void searchItems()
  }, 180)
})

onBeforeUnmount(() => {
  if (itemSearchTimer) clearTimeout(itemSearchTimer)
})

function entityId(entity: any) {
  return String(entity?.id || entity?.entityId || entity?.entity_id || '').trim()
}

function entityType(entity: any) {
  return String(entity?.entity_type || entity?.entityType || entity?.type || 'entity').trim().toLowerCase()
}

function titleCase(value: any) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function entityTypeLabel(entity: any) {
  return titleCase(entityType(entity))
}

function entityTitle(entity: any) {
  return String(entity?.title || entity?.name || 'Untitled')
}

function entitySummary(entity: any) {
  return String(entity?.summary || entity?.description || '').trim()
}

function entityImageUrl(entity: any) {
  return String(entity?.imageUrl || entity?.image_url || entity?.image || '').trim()
}

function initialsFor(value: any) {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  return parts.length
    ? parts.map((part) => part[0]?.toUpperCase() || '').join('')
    : '?'
}

function openEntityContext(entity: any) {
  selectedContextEntity.value = entity
  contextDrawerOpen.value = true
}

function closeEntityContext() {
  selectedContextEntity.value = null
  contextDrawerOpen.value = false
}

function openArticle(entity: any) {
  const id = entityId(entity)
  if (id) router.push(`/worlds/${worldId.value}/entities/${id}`)
}

function openSheet(entity: any) {
  const id = entityId(entity)
  if (id) router.push(`/worlds/${worldId.value}/entities/${id}/sheet`)
}

function relationshipOther(relationship: any) {
  return relationship?.other || relationship?.target || relationship?.source || null
}

function relationshipTitle(relationship: any) {
  const other = relationshipOther(relationship)
  return other ? entityTitle(other) : 'Unknown Entity'
}

function relationshipTypeLabel(relationship: any) {
  return titleCase(relationship?.relationshipType || relationship?.relationship_type || 'related')
}

function transferStatusClass(status: any) {
  const key = String(status || '').toLowerCase()

  if (['offered', 'pending'].includes(key)) return 'border-amber-300/25 bg-amber-400/10 text-amber-100'
  if (['completed', 'granted'].includes(key)) return 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100'
  if (['declined', 'cancelled'].includes(key)) return 'border-slate-300/20 bg-slate-400/10 text-slate-200'

  return 'border-[rgba(201,164,90,0.20)] bg-[rgba(201,164,90,0.10)] text-[#f5e7bd]'
}

function transferPartyLine(transfer: any) {
  const source = transfer?.source?.title || transfer?.source?.name || 'Unknown'
  const target = transfer?.target?.title || transfer?.target?.name || 'Unknown'
  return `${source} -> ${target}`
}

function itemProfile(item: any) {
  return item?.profile || {}
}

function itemTypeLine(item: any) {
  const profile = itemProfile(item)

  return [
    profile.displayType,
    profile.rarity,
    profile.source
  ]
    .filter(Boolean)
    .join(' / ')
}

async function searchItems() {
  const q = itemSearch.value.trim()

  if (!q || q.length < 2) {
    itemResults.value = []
    return
  }

  itemSearchPending.value = true

  try {
    const res: any = await $fetch(`/api/worlds/${worldId.value}/items/normalized`, {
      query: {
        q,
        limit: 12
      }
    })

    itemResults.value = Array.isArray(res?.items) ? res.items : []
  } catch {
    itemResults.value = []
  } finally {
    itemSearchPending.value = false
  }
}

function selectItem(item: any) {
  selectedItem.value = item
  itemSearch.value = item?.title || item?.profile?.name || ''
  itemResults.value = []
}

function clearGrantMessages() {
  grantError.value = ''
  grantSuccess.value = ''
}

async function grantItem() {
  clearGrantMessages()
  grantSaving.value = true

  try {
    const targetEntityId = grantTargetEntityId.value
    const itemEntityId = selectedItem.value?.id ? String(selectedItem.value.id) : ''
    const name = customItemName.value.trim() || selectedItem.value?.title || selectedItem.value?.profile?.name || ''

    await $fetch(`/api/worlds/${worldId.value}/admin/grants`, {
      method: 'POST',
      body: {
        action: 'item',
        targetEntityId,
        itemEntityId: itemEntityId || null,
        name,
        quantity: itemGrantQuantity.value,
        notes: itemGrantNotes.value
      }
    })

    grantSuccess.value = `Granted ${name || 'item'}.`
    customItemName.value = ''
    itemGrantQuantity.value = '1'
    selectedItem.value = null
    await refreshTransfers()
  } catch (error: any) {
    grantError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to grant item.'
  } finally {
    grantSaving.value = false
  }
}

async function grantCurrency() {
  clearGrantMessages()
  grantSaving.value = true

  try {
    await $fetch(`/api/worlds/${worldId.value}/admin/grants`, {
      method: 'POST',
      body: {
        action: 'currency',
        targetEntityId: currencyTargetEntityId.value,
        currency: currencyType.value,
        amount: currencyAmount.value,
        notes: currencyNotes.value
      }
    })

    grantSuccess.value = `Granted ${currencyAmount.value} ${currencyType.value}.`
    currencyAmount.value = '1'
    await refreshTransfers()
  } catch (error: any) {
    grantError.value =
      error?.data?.statusMessage ||
      error?.data?.message ||
      error?.message ||
      'Failed to grant currency.'
  } finally {
    grantSaving.value = false
  }
}

async function refreshAdmin() {
  await Promise.all([
    refreshParty(),
    refreshRelationships(),
    refreshTransfers()
  ])
}
</script>

<template>
  <div class="game-admin-space relative isolate h-full overflow-y-auto bg-[#020712] text-[#efe2bd]">
    <WorldChooserThpace mode="sticky" />
    <div
      class="relative z-10 -mt-[100dvh] mx-auto max-w-[1700px] p-6 transition-[margin,max-width] duration-200"
      :class="contextDrawerOpen ? 'xl:mr-[404px] xl:max-w-none' : ''"
    >
      <section class="eldra-filigree rounded-none border border-[rgba(201,164,90,0.30)] bg-[linear-gradient(to_bottom,rgba(18,16,12,0.74),rgba(7,7,6,0.54))] p-6 shadow-[0_18px_50px_rgba(0,0,0,0.22)] backdrop-blur-xl">
        <div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div class="text-xs uppercase tracking-[0.35em] text-[#9f9278]">
              World Control
            </div>

            <h1 class="mt-2 text-4xl font-semibold text-white">
              Game Admin
            </h1>

            <p class="mt-3 max-w-3xl text-sm leading-6 text-[#d8ceb8]">
              DM cockpit for party state, grants, transfers, relationships, and campaign cleanup.
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.28)] bg-[rgba(20,17,12,0.72)] px-4 py-3 text-sm font-semibold text-[#fff7df] transition hover:border-[rgba(201,164,90,0.52)] hover:bg-[rgba(201,164,90,0.12)]"
              @click="refreshAdmin"
            >
              Refresh Admin
            </button>

            <NuxtLink
              :to="`/worlds/${worldId}/characters`"
              class="rounded-none border border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.58)] px-4 py-3 text-sm font-semibold text-[#d8ceb8] transition hover:border-[rgba(201,164,90,0.38)] hover:text-[#fff7df]"
            >
              Characters
            </NuxtLink>
          </div>
        </div>

        <div class="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article
            v-for="card in healthCards"
            :key="card.label"
            class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(8,17,27,0.42)] p-4"
          >
            <div class="text-xs uppercase tracking-[0.24em] text-[#9f9278]">
              {{ card.label }}
            </div>

            <div class="mt-2 text-3xl font-semibold text-white">
              {{ card.value }}
            </div>

            <div class="mt-1 text-xs text-[#d8ceb8]">
              {{ card.sub }}
            </div>
          </article>
        </div>

        <div class="mt-6 overflow-x-auto">
          <div class="flex min-w-max gap-2">
            <button
              v-for="panel in panels"
              :key="panel.key"
              type="button"
              class="inline-flex items-center gap-2 rounded-none border px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] transition"
              :class="activePanel === panel.key
                ? 'border-[rgba(201,164,90,0.64)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
                : 'border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.52)] text-[#d8ceb8] hover:border-[rgba(201,164,90,0.38)] hover:text-[#fff7df]'"
              @click="activePanel = panel.key"
            >
              <UIcon :name="panel.icon" class="h-4 w-4" />
              <span>{{ panel.label }}</span>
            </button>
          </div>
        </div>
      </section>

      <section
        v-if="activePanel === 'overview'"
        class="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]"
      >
        <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                Fast Table View
              </div>
              <h2 class="mt-2 text-2xl font-semibold text-white">
                Party / Cast
              </h2>
            </div>

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
              @click="activePanel = 'party'"
            >
              View All
            </button>
          </div>

          <div
            v-if="partyPending"
            class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-5 text-sm text-[#9f9278]"
          >
            Loading cast...
          </div>

          <div
            v-else
            class="mt-4 grid gap-3 md:grid-cols-2"
          >
            <article
              v-for="entity in filteredParty.slice(0, 6)"
              :key="entityId(entity)"
              class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.42)] p-3"
            >
              <button
                type="button"
                class="flex w-full items-start gap-3 text-left"
                @click="openEntityContext(entity)"
              >
                <div class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] text-lg font-semibold text-[#d8ceb8]">
                  <img
                    v-if="entityImageUrl(entity)"
                    :src="entityImageUrl(entity)"
                    :alt="entityTitle(entity)"
                    class="h-full w-full object-cover object-top"
                  >
                  <span v-else>{{ initialsFor(entityTitle(entity)) }}</span>
                </div>

                <div class="min-w-0">
                  <div class="truncate text-base font-semibold text-white">
                    {{ entityTitle(entity) }}
                  </div>
                  <div class="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                    {{ entityTypeLabel(entity) }}
                  </div>
                  <p class="mt-2 line-clamp-2 text-xs leading-5 text-[#d8ceb8]">
                    {{ entitySummary(entity) || 'No summary yet.' }}
                  </p>
                </div>
              </button>
            </article>
          </div>
        </div>

        <div class="grid gap-6">
          <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
              Pending Movement
            </div>
            <h2 class="mt-2 text-2xl font-semibold text-white">
              Transfers
            </h2>

            <div
              v-if="transfersPending"
              class="mt-4 text-sm text-[#9f9278]"
            >
              Loading transfers...
            </div>

            <div
              v-else-if="!transfers.length"
              class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.18)] p-4 text-sm text-[#9f9278]"
            >
              No transfers yet.
            </div>

            <div
              v-else
              class="mt-4 grid gap-2"
            >
              <article
                v-for="transfer in transfers.slice(0, 6)"
                :key="transfer.id"
                class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(8,17,27,0.38)] p-3"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <div class="truncate text-sm font-semibold text-white">
                      {{ transfer.itemName }} x{{ transfer.quantity || 1 }}
                    </div>
                    <div class="mt-1 text-xs text-[#9f9278]">
                      {{ transferPartyLine(transfer) }}
                    </div>
                  </div>

                  <span
                    class="shrink-0 rounded-none border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
                    :class="transferStatusClass(transfer.status)"
                  >
                    {{ transfer.status }}
                  </span>
                </div>
              </article>
            </div>
          </div>

          <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
              Relationship Activity
            </div>
            <h2 class="mt-2 text-2xl font-semibold text-white">
              Recent Links
            </h2>

            <div
              v-if="relationshipsPending"
              class="mt-4 text-sm text-[#9f9278]"
            >
              Loading relationships...
            </div>

            <div
              v-else-if="!relationships.length"
              class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.18)] p-4 text-sm text-[#9f9278]"
            >
              No relationships yet.
            </div>

            <div
              v-else
              class="mt-4 grid gap-2"
            >
              <button
                v-for="relationship in relationships.slice(0, 6)"
                :key="relationship.id"
                type="button"
                class="rounded-none border border-[rgba(201,164,90,0.14)] bg-[rgba(8,17,27,0.38)] p-3 text-left transition hover:border-[rgba(201,164,90,0.36)]"
                @click="relationshipOther(relationship) && openEntityContext(relationshipOther(relationship))"
              >
                <div class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                  {{ relationshipTypeLabel(relationship) }}
                </div>
                <div class="mt-1 text-sm font-semibold text-white">
                  {{ relationship.displayLabel || relationship.label || 'related to' }}
                  <span class="text-[#9f9278]">-></span>
                  {{ relationshipTitle(relationship) }}
                </div>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section
        v-else-if="activePanel === 'homebrew'"
        class="mt-6 grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]"
      >
        <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
            Homebrew Forge
          </div>
          <h2 class="mt-2 text-2xl font-semibold text-white">
            New Homebrew
          </h2>
          <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
            Create a draft entity from an existing imported or homebrew template. Eldra clones the structured mechanics so this can become Foundry-ready later.
          </p>

          <div class="mt-5 grid gap-3">
            <button
              v-for="type in homebrewTypes"
              :key="type.key"
              type="button"
              class="rounded-none border p-3 text-left transition"
              :class="homebrewType === type.key
                ? 'border-[rgba(201,164,90,0.60)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
                : 'border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.42)] text-[#d8ceb8] hover:border-[rgba(201,164,90,0.36)] hover:bg-[rgba(201,164,90,0.08)]'"
              @click="homebrewType = type.key"
            >
              <div class="flex items-start gap-3">
                <UIcon :name="type.icon" class="mt-0.5 h-4 w-4 shrink-0 text-[#c9a45a]" />
                <div class="min-w-0">
                  <div class="text-sm font-semibold text-white">{{ type.label }}</div>
                  <div class="mt-1 text-xs leading-5 text-[#9f9278]">{{ type.description }}</div>
                </div>
              </div>
            </button>
          </div>
        </div>

        <div class="grid gap-6">
          <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
            <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                  Template Library
                </div>
                <h2 class="mt-2 text-2xl font-semibold text-white">
                  {{ selectedHomebrewType.label }} Templates
                </h2>
                <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
                  Pick an existing {{ selectedHomebrewType.label.toLowerCase() }} as the starting mechanical shape.
                </p>
              </div>

              <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(201,164,90,0.08)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#d8ceb8]">
                {{ homebrewTemplates.length }} templates
              </div>
            </div>

            <input
              v-model="homebrewTemplateSearch"
              class="eldra-input mt-5 w-full rounded-none px-3 py-3 text-sm text-white"
              :placeholder="`Search ${selectedHomebrewType.label.toLowerCase()} templates...`"
            >

            <div
              v-if="homebrewTemplatesPending"
              class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-5 text-sm text-[#9f9278]"
            >
              Loading templates...
            </div>

            <div
              v-else-if="!homebrewFilteredTemplates.length"
              class="mt-4 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-5 text-sm text-[#9f9278]"
            >
              No templates found for this type.
            </div>

            <div
              v-else
              class="mt-4 grid max-h-[520px] gap-3 overflow-y-auto pr-1"
            >
              <button
                v-for="template in homebrewFilteredTemplates"
                :key="template.id"
                type="button"
                class="rounded-none border p-4 text-left transition"
                :class="String(homebrewSelectedTemplateId) === String(template.id)
                  ? 'border-[rgba(201,164,90,0.60)] bg-[rgba(201,164,90,0.16)]'
                  : 'border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.42)] hover:border-[rgba(201,164,90,0.36)] hover:bg-[rgba(201,164,90,0.08)]'"
                @click="selectHomebrewTemplate(template)"
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="text-lg font-semibold text-white">
                      {{ template.title }}
                    </div>
                    <div class="mt-1 text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                      {{ homebrewTemplateSubtitle(template) || selectedHomebrewType.label }}
                    </div>
                  </div>

                  <span class="shrink-0 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(201,164,90,0.08)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#d8ceb8]">
                    {{ template.blockCount || 0 }} blocks
                  </span>
                </div>

                <p
                  v-if="template.summary"
                  class="mt-3 line-clamp-2 text-sm leading-6 text-[#d8ceb8]"
                >
                  {{ template.summary }}
                </p>

                <div
                  v-if="template.coreBlockKeys?.length"
                  class="mt-3 flex flex-wrap gap-2"
                >
                  <span
                    v-for="key in template.coreBlockKeys.slice(0, 5)"
                    :key="`${template.id}-${key}`"
                    class="rounded-none border border-[rgba(65,82,103,0.58)] bg-[rgba(8,17,27,0.58)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#9f9278]"
                  >
                    {{ key }}
                  </span>
                </div>
              </button>
            </div>
          </div>

          <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
              Draft Setup
            </div>
            <h2 class="mt-2 text-2xl font-semibold text-white">
              Create {{ selectedHomebrewType.label }} Draft
            </h2>

            <div
              v-if="selectedHomebrewTemplate"
              class="mt-4 rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(8,17,27,0.42)] p-4"
            >
              <div class="text-sm font-semibold text-white">
                Template: {{ selectedHomebrewTemplate.title }}
              </div>
              <div class="mt-1 text-xs text-[#9f9278]">
                {{ homebrewTemplateSubtitle(selectedHomebrewTemplate) || 'Structured template selected.' }}
              </div>
            </div>

            <div
              v-if="homebrewType === 'spell' && selectedHomebrewTemplate"
              data-homebrew-spell-builder
              class="mt-5 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(8,17,27,0.42)] p-4"
            >
              <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                    Spell Builder
                  </div>
                  <h3 class="mt-2 text-xl font-semibold text-white">
                    Spell Mechanics
                  </h3>
                  <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
                    Start from the selected template, then override the combat-useful fields before Eldra creates the draft.
                  </p>
                </div>

                <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(201,164,90,0.08)] px-3 py-2 text-xs leading-5 text-[#d8ceb8]">
                  {{ spellBuilderSummaryLine || 'No mechanics yet' }}
                </div>
              </div>

              <div class="mt-5 grid gap-4 xl:grid-cols-3">
                <label>
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Spell Name</span>
                  <input
                    v-model="spellBuilderForm.name"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    placeholder="Magic Missile, Fireball, etc."
                  >
                </label>

                <label>
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Level</span>
                  <select
                    v-model="spellBuilderForm.level"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                  >
                    <option
                      v-for="level in SPELL_LEVEL_OPTIONS"
                      :key="level.value"
                      :value="level.value"
                      class="bg-[#090909] text-[#f5e7bd]"
                    >
                      {{ level.label }}
                    </option>
                  </select>
                </label>

                <label>
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">School</span>
                  <select
                    v-model="spellBuilderForm.school"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                  >
                    <option
                      v-for="school in SPELL_SCHOOL_OPTIONS"
                      :key="school.value"
                      :value="school.value"
                      class="bg-[#090909] text-[#f5e7bd]"
                    >
                      {{ school.label }}
                    </option>
                  </select>
                </label>
              </div>

              <div class="mt-4 grid gap-4 xl:grid-cols-4">
                <label>
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Casting Time</span>
                  <input
                    v-model="spellBuilderForm.castingTime"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    placeholder="1 Action"
                  >
                </label>

                <label>
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Range</span>
                  <input
                    v-model="spellBuilderForm.range"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    placeholder="60 feet"
                  >
                </label>

                <label>
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Duration</span>
                  <input
                    v-model="spellBuilderForm.duration"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    placeholder="Instantaneous"
                  >
                </label>

                <label>
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Components</span>
                  <input
                    v-model="spellBuilderForm.components"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    placeholder="V, S, M (a tiny bell)"
                  >
                </label>
              </div>

              <div class="mt-4 flex flex-wrap gap-3">
                <label class="inline-flex items-center gap-2 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.52)] px-3 py-2 text-sm text-[#d8ceb8]">
                  <input
                    v-model="spellBuilderForm.concentration"
                    type="checkbox"
                    class="accent-[#c9a45a]"
                  >
                  Concentration
                </label>

                <label class="inline-flex items-center gap-2 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.52)] px-3 py-2 text-sm text-[#d8ceb8]">
                  <input
                    v-model="spellBuilderForm.ritual"
                    type="checkbox"
                    class="accent-[#c9a45a]"
                  >
                  Ritual
                </label>
              </div>

              <div class="mt-4 grid gap-4 xl:grid-cols-4">
                <label>
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Combat Mode</span>
                  <select
                    v-model="spellBuilderForm.attackType"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                  >
                    <option
                      v-for="option in SPELL_ATTACK_OPTIONS"
                      :key="option.value"
                      :value="option.value"
                      class="bg-[#090909] text-[#f5e7bd]"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                </label>

                <label>
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Save Ability</span>
                  <select
                    v-model="spellBuilderForm.saveAbility"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                  >
                    <option
                      v-for="option in SPELL_SAVE_OPTIONS"
                      :key="option.value"
                      :value="option.value"
                      class="bg-[#090909] text-[#f5e7bd]"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                </label>

                <label>
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Damage / Healing</span>
                  <input
                    v-model="spellBuilderForm.damage"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    placeholder="8d6, 2d8, etc."
                  >
                </label>

                <label>
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Damage Type</span>
                  <select
                    v-model="spellBuilderForm.damageType"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                  >
                    <option
                      v-for="type in SPELL_DAMAGE_TYPES"
                      :key="type || 'none'"
                      :value="type"
                      class="bg-[#090909] text-[#f5e7bd]"
                    >
                      {{ type || 'None' }}
                    </option>
                  </select>
                </label>
              </div>

              <label class="mt-4 block">
                <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Class Lists / Tags</span>
                <input
                  v-model="spellBuilderForm.classes"
                  class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                  placeholder="Wizard, Cleric, Druid..."
                >
              </label>

              <label class="mt-4 block">
                <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Description</span>
                <textarea
                  v-model="spellBuilderForm.description"
                  rows="7"
                  class="eldra-input w-full rounded-none px-3 py-3 text-sm leading-6 text-white"
                  placeholder="What the spell does at the table..."
                />
              </label>

              <label class="mt-4 block">
                <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">At Higher Levels</span>
                <textarea
                  v-model="spellBuilderForm.higherLevel"
                  rows="3"
                  class="eldra-input w-full rounded-none px-3 py-3 text-sm leading-6 text-white"
                  placeholder="How the spell scales when cast with higher-level slots..."
                />
              </label>
            </div>

            <div
              v-if="homebrewType === 'item' && selectedHomebrewTemplate"
              data-homebrew-item-builder
              class="mt-5 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(8,17,27,0.42)] p-4"
            >
              <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                    Item Builder
                  </div>
                  <h3 class="mt-2 text-xl font-semibold text-white">
                    Item Mechanics
                  </h3>
                  <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
                    Build the structured item profile Eldra will use for sheets, granted actions, and eventual Foundry export.
                  </p>
                </div>

                <div class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(201,164,90,0.08)] px-3 py-2 text-xs leading-5 text-[#d8ceb8]">
                  {{ itemBuilderSummaryLine || 'No item mechanics yet' }}
                </div>
              </div>

              <div class="mt-5 grid gap-4 xl:grid-cols-3">
                <label>
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Item Name</span>
                  <input
                    v-model="itemBuilderForm.name"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    placeholder="Flamebrand Longsword, Lucky Boots..."
                  >
                </label>

                <label>
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Item Type</span>
                  <select
                    v-model="itemBuilderForm.itemType"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                  >
                    <option
                      v-for="type in ITEM_TYPE_OPTIONS"
                      :key="type.value"
                      :value="type.value"
                      class="bg-[#090909] text-[#f5e7bd]"
                    >
                      {{ type.label }}
                    </option>
                  </select>
                </label>

                <label>
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Rarity</span>
                  <select
                    v-model="itemBuilderForm.rarity"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                  >
                    <option
                      v-for="rarity in ITEM_RARITY_OPTIONS"
                      :key="rarity"
                      :value="rarity"
                      class="bg-[#090909] text-[#f5e7bd]"
                    >
                      {{ rarity }}
                    </option>
                  </select>
                </label>
              </div>

              <div class="mt-4 grid gap-4 xl:grid-cols-4">
                <label>
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Weight</span>
                  <input
                    v-model="itemBuilderForm.weight"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    placeholder="1"
                  >
                </label>

                <label>
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Value</span>
                  <input
                    v-model="itemBuilderForm.value"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    placeholder="5000 cp or raw value"
                  >
                </label>

                <label>
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Equip Slot</span>
                  <select
                    v-model="itemBuilderForm.equipSlot"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                  >
                    <option
                      v-for="slot in ITEM_EQUIP_SLOT_OPTIONS"
                      :key="slot.value"
                      :value="slot.value"
                      class="bg-[#090909] text-[#f5e7bd]"
                    >
                      {{ slot.label }}
                    </option>
                  </select>
                </label>

                <div class="grid gap-2">
                  <label class="inline-flex items-center gap-2 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.52)] px-3 py-2 text-sm text-[#d8ceb8]">
                    <input
                      v-model="itemBuilderForm.equippable"
                      type="checkbox"
                      class="accent-[#c9a45a]"
                    >
                    Equippable
                  </label>

                  <label class="inline-flex items-center gap-2 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.52)] px-3 py-2 text-sm text-[#d8ceb8]">
                    <input
                      v-model="itemBuilderForm.requiresAttunement"
                      type="checkbox"
                      class="accent-[#c9a45a]"
                    >
                    Requires Attunement
                  </label>
                </div>
              </div>

              <label
                v-if="itemBuilderForm.requiresAttunement"
                class="mt-4 block"
              >
                <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Attunement Text</span>
                <input
                  v-model="itemBuilderForm.attunementText"
                  class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                  placeholder="by a spellcaster, by a dwarf, etc."
                >
              </label>

              <div class="mt-5 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.40)] p-4">
                <label class="inline-flex items-center gap-2 text-sm font-semibold text-[#fff7df]">
                  <input
                    v-model="itemBuilderForm.weaponEnabled"
                    type="checkbox"
                    class="accent-[#c9a45a]"
                  >
                  Weapon Profile
                </label>

                <div
                  v-if="itemBuilderForm.weaponEnabled"
                  class="mt-4 grid gap-4 xl:grid-cols-4"
                >
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Kind</span>
                    <select
                      v-model="itemBuilderForm.weaponKind"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    >
                      <option value="melee" class="bg-[#090909] text-[#f5e7bd]">Melee</option>
                      <option value="ranged" class="bg-[#090909] text-[#f5e7bd]">Ranged</option>
                    </select>
                  </label>

                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Category</span>
                    <input
                      v-model="itemBuilderForm.weaponCategory"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="simple, martial..."
                    >
                  </label>

                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Damage</span>
                    <input
                      v-model="itemBuilderForm.weaponDamage"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="1d8"
                    >
                  </label>

                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Damage Type</span>
                    <select
                      v-model="itemBuilderForm.weaponDamageType"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    >
                      <option
                        v-for="type in ITEM_DAMAGE_TYPES"
                        :key="type || 'none'"
                        :value="type"
                        class="bg-[#090909] text-[#f5e7bd]"
                      >
                        {{ type || 'None' }}
                      </option>
                    </select>
                  </label>

                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Range</span>
                    <input
                      v-model="itemBuilderForm.weaponRange"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="5, 20/60, 120/360"
                    >
                  </label>

                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Properties</span>
                    <input
                      v-model="itemBuilderForm.weaponProperties"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="finesse, light, thrown"
                    >
                  </label>

                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Attack Bonus</span>
                    <input
                      v-model="itemBuilderForm.attackBonus"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="+1"
                    >
                  </label>

                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Damage Bonus</span>
                    <input
                      v-model="itemBuilderForm.damageBonus"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="+1"
                    >
                  </label>
                </div>
              </div>

              <div class="mt-5 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.40)] p-4">
                <label class="inline-flex items-center gap-2 text-sm font-semibold text-[#fff7df]">
                  <input
                    v-model="itemBuilderForm.armorEnabled"
                    type="checkbox"
                    class="accent-[#c9a45a]"
                  >
                  Armor / Shield Profile
                </label>

                <div
                  v-if="itemBuilderForm.armorEnabled"
                  class="mt-4 grid gap-4 xl:grid-cols-5"
                >
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">AC</span>
                    <input
                      v-model="itemBuilderForm.armorClass"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="16"
                    >
                  </label>

                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Armor Type</span>
                    <input
                      v-model="itemBuilderForm.armorType"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="armor, shield"
                    >
                  </label>

                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Dex Cap</span>
                    <input
                      v-model="itemBuilderForm.dexCap"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="2"
                    >
                  </label>

                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Strength Req.</span>
                    <input
                      v-model="itemBuilderForm.strength"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="13"
                    >
                  </label>

                  <label class="inline-flex items-center gap-2 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.52)] px-3 py-2 text-sm text-[#d8ceb8]">
                    <input
                      v-model="itemBuilderForm.stealthDisadvantage"
                      type="checkbox"
                      class="accent-[#c9a45a]"
                    >
                    Stealth Disadvantage
                  </label>
                </div>
              </div>

              <div class="mt-5 grid gap-4 xl:grid-cols-4">
                <label>
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">AC Bonus</span>
                  <input
                    v-model="itemBuilderForm.acBonus"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    placeholder="+1"
                  >
                </label>

                <label>
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Save Bonus</span>
                  <input
                    v-model="itemBuilderForm.saveBonus"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    placeholder="+1"
                  >
                </label>

                <label>
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Spell Attack Bonus</span>
                  <input
                    v-model="itemBuilderForm.spellAttackBonus"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    placeholder="+1"
                  >
                </label>

                <label>
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Spell Save DC Bonus</span>
                  <input
                    v-model="itemBuilderForm.spellSaveDcBonus"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    placeholder="+1"
                  >
                </label>
              </div>

              <div class="mt-5 rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(20,17,12,0.40)] p-4">
                <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                  Granted Action
                </div>

                <div class="mt-4 grid gap-4 xl:grid-cols-4">
                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Action Name</span>
                    <input
                      v-model="itemBuilderForm.grantedActionName"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="Poison the Blade"
                    >
                  </label>

                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Timing</span>
                    <select
                      v-model="itemBuilderForm.grantedActionTiming"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    >
                      <option
                        v-for="timing in ITEM_ACTION_TIMINGS"
                        :key="timing"
                        :value="timing"
                        class="bg-[#090909] text-[#f5e7bd]"
                      >
                        {{ timing }}
                      </option>
                    </select>
                  </label>

                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Uses</span>
                    <input
                      v-model="itemBuilderForm.grantedActionUses"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                      placeholder="1, 3, etc."
                    >
                  </label>

                  <label>
                    <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Recharge</span>
                    <select
                      v-model="itemBuilderForm.grantedActionRecharge"
                      class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                    >
                      <option
                        v-for="recharge in ITEM_RECHARGE_OPTIONS"
                        :key="recharge || 'none'"
                        :value="recharge"
                        class="bg-[#090909] text-[#f5e7bd]"
                      >
                        {{ recharge || 'None' }}
                      </option>
                    </select>
                  </label>
                </div>

                <label class="mt-4 block">
                  <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Action Detail</span>
                  <textarea
                    v-model="itemBuilderForm.grantedActionDetail"
                    rows="4"
                    class="eldra-input w-full rounded-none px-3 py-3 text-sm leading-6 text-white"
                    placeholder="Describe the action this item grants..."
                  />
                </label>
              </div>

              <label class="mt-5 block">
                <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Description</span>
                <textarea
                  v-model="itemBuilderForm.description"
                  rows="7"
                  class="eldra-input w-full rounded-none px-3 py-3 text-sm leading-6 text-white"
                  placeholder="What the item does at the table..."
                />
              </label>
            </div>

            <label class="mt-5 block">
              <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Draft Title</span>
              <input
                v-model="homebrewTitle"
                class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                :placeholder="selectedHomebrewTemplate ? defaultHomebrewTitle(selectedHomebrewTemplate) : 'Choose a template first...'"
              >
            </label>

            <div
              v-if="selectedHomebrewTemplate"
              data-homebrew-draft-review
              class="mt-5 rounded-none border border-[rgba(201,164,90,0.20)] bg-[rgba(8,17,27,0.42)] p-4"
            >
              <div class="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                    Draft Review
                  </div>
                  <h3 class="mt-2 text-xl font-semibold text-white">
                    Ready Check
                  </h3>
                  <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
                    Quick sanity pass before Eldra creates the structured draft.
                  </p>
                </div>

                <div class="flex flex-wrap gap-2">
                  <span class="rounded-none border border-red-400/20 bg-red-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-red-100">
                    {{ homebrewBlockingCheckCount }} blockers
                  </span>
                  <span class="rounded-none border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">
                    {{ homebrewWarningCheckCount }} warnings
                  </span>
                </div>
              </div>

              <div class="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                <div
                  v-for="row in homebrewReviewRows"
                  :key="`${row[0]}-${row[1]}`"
                  class="rounded-none border border-[rgba(201,164,90,0.12)] bg-[rgba(4,8,14,0.42)] p-3"
                >
                  <div class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                    {{ row[0] }}
                  </div>
                  <div class="mt-1 break-words text-sm font-semibold text-[#fff7df]">
                    {{ homebrewReviewValue(row[1]) }}
                  </div>
                </div>
              </div>

              <div class="mt-4 grid gap-2">
                <div
                  v-for="check in homebrewDraftChecks"
                  :key="`${check.status}-${check.label}`"
                  class="rounded-none border px-3 py-2 text-sm leading-6"
                  :class="homebrewCheckClass(check.status)"
                >
                  <span class="font-semibold">{{ check.label }}:</span>
                  <span class="ml-1">{{ check.detail }}</span>
                </div>
              </div>
            </div>

            <div
              v-if="homebrewError"
              class="mt-4 rounded-none border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100"
            >
              {{ homebrewError }}
            </div>

            <div
              v-if="homebrewSuccess"
              class="mt-4 rounded-none border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm leading-6 text-emerald-100"
            >
              {{ homebrewSuccess }}
            </div>

            <div class="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                class="eldra-button rounded-none px-4 py-3 text-sm font-semibold disabled:opacity-50"
                :disabled="homebrewCreating || !homebrewCanCreate"
                @click="createHomebrewDraft"
              >
                {{ homebrewCreating ? 'Creating Draft...' : 'Create Draft & Open Article' }}
              </button>

              <button
                v-if="homebrewCreatedEntity?.id"
                type="button"
                class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-4 py-3 text-sm font-semibold text-[#fff7df]"
                @click="router.push(`/worlds/${worldId}/entities/${homebrewCreatedEntity.id}`)"
              >
                Open Draft
              </button>
            </div>

            <div class="mt-5 rounded-none border border-[rgba(201,164,90,0.12)] bg-[rgba(4,8,14,0.40)] p-4 text-xs leading-6 text-[#9f9278]">
              V1 creates a real Eldra entity, marks it as homebrew, clones the template's mechanical core blocks, and opens the article for editing. The next pass adds type-specific mechanical forms.
            </div>
          </div>
        </div>
      </section>

      <section
        v-else-if="activePanel === 'party'"
        class="mt-6"
      >
        <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                Party / Cast
              </div>
              <h2 class="mt-2 text-2xl font-semibold text-white">
                Characters, NPCs, and Sheets
              </h2>
              <p class="mt-2 text-sm text-[#d8ceb8]">
                Fast access to articles, sheets, and context details.
              </p>
            </div>

            <input
              v-model="partySearch"
              class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white xl:w-[420px]"
              placeholder="Search party, NPCs, sheets..."
            >
          </div>

          <div
            v-if="partyPending"
            class="mt-5 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-6 text-sm text-[#9f9278]"
          >
            Loading cast...
          </div>

          <div
            v-else
            class="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3"
          >
            <article
              v-for="entity in filteredParty"
              :key="entityId(entity)"
              class="rounded-none border border-[rgba(201,164,90,0.18)] bg-[rgba(8,17,27,0.42)] p-4"
            >
              <div class="flex items-start gap-4">
                <button
                  type="button"
                  class="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] text-xl font-semibold text-[#d8ceb8]"
                  @click="openEntityContext(entity)"
                >
                  <img
                    v-if="entityImageUrl(entity)"
                    :src="entityImageUrl(entity)"
                    :alt="entityTitle(entity)"
                    class="h-full w-full object-cover object-top"
                  >
                  <span v-else>{{ initialsFor(entityTitle(entity)) }}</span>
                </button>

                <div class="min-w-0 flex-1">
                  <div class="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      class="min-w-0 text-left"
                      @click="openEntityContext(entity)"
                    >
                      <h3 class="truncate text-xl font-semibold text-white">
                        {{ entityTitle(entity) }}
                      </h3>
                      <div class="mt-1 text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                        {{ entityTypeLabel(entity) }}
                      </div>
                    </button>

                    <span class="shrink-0 rounded-none border border-[rgba(201,164,90,0.24)] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#d8ceb8]">
                      {{ entityTypeLabel(entity) }}
                    </span>
                  </div>

                  <p class="mt-3 line-clamp-3 text-sm leading-6 text-[#d8ceb8]">
                    {{ entitySummary(entity) || 'No summary yet.' }}
                  </p>

                  <div class="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(201,164,90,0.10)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
                      @click="openEntityContext(entity)"
                    >
                      Context
                    </button>

                    <button
                      type="button"
                      class="rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(20,17,12,0.72)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
                      @click="openArticle(entity)"
                    >
                      Article
                    </button>

                    <button
                      type="button"
                      class="rounded-none border border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.58)] px-3 py-2 text-xs font-semibold text-[#d8ceb8]"
                      @click="openSheet(entity)"
                    >
                      Sheet
                    </button>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section
        v-else-if="activePanel === 'grants'"
        class="mt-6 grid gap-6 xl:grid-cols-2"
      >
        <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
            Grant Item
          </div>
          <h2 class="mt-2 text-2xl font-semibold text-white">
            Send Gear
          </h2>
          <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
            Add a normalized item or quick custom row directly to a character sheet.
          </p>

          <div class="mt-5 grid gap-4">
            <label>
              <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Target</span>
              <select
                v-model="grantTargetEntityId"
                class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
              >
                <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose character...</option>
                <option
                  v-for="target in grantTargets"
                  :key="entityId(target)"
                  :value="entityId(target)"
                  class="bg-[#090909] text-[#f5e7bd]"
                >
                  {{ entityTitle(target) }} - {{ entityTypeLabel(target) }}
                </option>
              </select>
            </label>

            <label>
              <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Search Imported Items</span>
              <input
                v-model="itemSearch"
                class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                placeholder="Longsword, healing potion, wand..."
              >
            </label>

            <div
              v-if="itemSearchPending"
              class="rounded-none border border-dashed border-[rgba(201,164,90,0.18)] p-3 text-xs text-[#9f9278]"
            >
              Searching items...
            </div>

            <div
              v-if="itemResults.length"
              class="max-h-80 overflow-y-auto rounded-none border border-[rgba(201,164,90,0.18)]"
            >
              <button
                v-for="item in itemResults"
                :key="item.id"
                type="button"
                class="block w-full border-b border-[rgba(201,164,90,0.10)] bg-[rgba(8,17,27,0.58)] px-3 py-3 text-left last:border-b-0 hover:bg-[rgba(201,164,90,0.08)]"
                @click="selectItem(item)"
              >
                <span class="block text-sm font-semibold text-white">{{ item.title }}</span>
                <span class="mt-1 block text-xs text-[#9f9278]">{{ itemTypeLine(item) || 'Item' }}</span>
              </button>
            </div>

            <div
              v-if="selectedItem"
              class="rounded-none border border-emerald-300/20 bg-emerald-400/10 p-3 text-sm text-emerald-100"
            >
              Selected imported item: {{ selectedItem.title }}
            </div>

            <label>
              <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Custom Name</span>
              <input
                v-model="customItemName"
                class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                placeholder="Used if no imported item is selected"
              >
            </label>

            <div class="grid gap-4 md:grid-cols-[160px_minmax(0,1fr)]">
              <label>
                <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Quantity</span>
                <input
                  v-model="itemGrantQuantity"
                  inputmode="numeric"
                  class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                >
              </label>

              <label>
                <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Notes</span>
                <input
                  v-model="itemGrantNotes"
                  class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                >
              </label>
            </div>

            <button
              type="button"
              class="eldra-button rounded-none px-4 py-3 text-sm font-semibold disabled:opacity-50"
              :disabled="grantSaving || !grantTargetEntityId || (!selectedItem && !customItemName.trim())"
              @click="grantItem"
            >
              {{ grantSaving ? 'Granting...' : 'Grant Item' }}
            </button>
          </div>
        </div>

        <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
            Grant Currency
          </div>
          <h2 class="mt-2 text-2xl font-semibold text-white">
            Send Coin
          </h2>
          <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
            Adds to the existing currency row if the character already has one.
          </p>

          <div
            v-if="grantError"
            class="mt-5 rounded-none border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200"
          >
            {{ grantError }}
          </div>

          <div
            v-if="grantSuccess"
            class="mt-5 rounded-none border border-emerald-400/20 bg-emerald-400/10 p-3 text-sm text-emerald-100"
          >
            {{ grantSuccess }}
          </div>

          <div class="mt-5 grid gap-4">
            <label>
              <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Target</span>
              <select
                v-model="currencyTargetEntityId"
                class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
              >
                <option value="" class="bg-[#090909] text-[#f5e7bd]">Choose character...</option>
                <option
                  v-for="target in grantTargets"
                  :key="entityId(target)"
                  :value="entityId(target)"
                  class="bg-[#090909] text-[#f5e7bd]"
                >
                  {{ entityTitle(target) }} - {{ entityTypeLabel(target) }}
                </option>
              </select>
            </label>

            <div class="grid gap-4 md:grid-cols-2">
              <label>
                <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Currency</span>
                <select
                  v-model="currencyType"
                  class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                >
                  <option value="Gold" class="bg-[#090909] text-[#f5e7bd]">Gold</option>
                  <option value="Silver" class="bg-[#090909] text-[#f5e7bd]">Silver</option>
                  <option value="Copper" class="bg-[#090909] text-[#f5e7bd]">Copper</option>
                </select>
              </label>

              <label>
                <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Amount</span>
                <input
                  v-model="currencyAmount"
                  inputmode="numeric"
                  class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                >
              </label>
            </div>

            <label>
              <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Notes</span>
              <input
                v-model="currencyNotes"
                class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
              >
            </label>

            <button
              type="button"
              class="eldra-button rounded-none px-4 py-3 text-sm font-semibold disabled:opacity-50"
              :disabled="grantSaving || !currencyTargetEntityId || !currencyAmount"
              @click="grantCurrency"
            >
              {{ grantSaving ? 'Granting...' : 'Grant Currency' }}
            </button>
          </div>
        </div>
      </section>


      <section
        v-else-if="activePanel === 'setup'"
        class="mt-6 grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]"
      >
        <aside class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
            Page Setup
          </div>

          <h2 class="mt-2 text-2xl font-semibold text-white">
            Presentation Targets
          </h2>

          <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
            Choose a world page, then set its presentation mode and background from one cockpit.
          </p>

          <div class="mt-5 grid gap-2">
            <button
              v-for="section in pageSetupSections"
              :key="section.key"
              type="button"
              class="rounded-none border px-3 py-3 text-left transition"
              :class="selectedPageSetupKey === section.key
                ? 'border-[rgba(201,164,90,0.62)] bg-[rgba(201,164,90,0.16)] text-[#fff7df]'
                : 'border-[rgba(65,82,103,0.70)] bg-[rgba(8,17,27,0.42)] text-[#d8ceb8] hover:border-[rgba(201,164,90,0.34)] hover:text-[#fff7df]'"
              @click="selectedPageSetupKey = section.key"
            >
              <span class="block text-sm font-semibold">
                {{ section.title }}
              </span>

              <span class="mt-1 block text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                {{ section.key }}
              </span>
            </button>
          </div>
        </aside>

        <div class="grid gap-6">
          <section class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                  Selected Page
                </div>

                <h2 class="mt-2 text-2xl font-semibold text-white">
                  {{ selectedPageSetup.title }}
                </h2>

                <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
                  {{ selectedPageSetup.description }}
                </p>
              </div>

              <div class="rounded-none border border-[rgba(201,164,90,0.22)] bg-[rgba(201,164,90,0.08)] px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[#f5e7bd]">
                {{ selectedPageSetup.key }}
              </div>
            </div>
          </section>

          <WorldPagePresentationPanel
            isolated
            :world-id="worldId"
            :page-key="selectedPageSetup.key"
            :title="`${selectedPageSetup.title} Presentation`"
            :description="selectedPageSetup.description"
          />

          <section class="rounded-none border border-dashed border-[rgba(201,164,90,0.22)] bg-[rgba(8,17,27,0.34)] p-5">
            <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
              Coming Later
            </div>

            <div class="mt-3 grid gap-3 md:grid-cols-2">
              <div class="rounded-none border border-[rgba(201,164,90,0.12)] bg-[rgba(20,17,12,0.44)] p-3">
                <div class="text-sm font-semibold text-white">Page Visibility</div>
                <p class="mt-1 text-xs leading-5 text-[#9f9278]">
                  Player-visible, GM-only, hidden draft, and public presentation rules.
                </p>
              </div>

              <div class="rounded-none border border-[rgba(201,164,90,0.12)] bg-[rgba(20,17,12,0.44)] p-3">
                <div class="text-sm font-semibold text-white">Default View</div>
                <p class="mt-1 text-xs leading-5 text-[#9f9278]">
                  Card/list/grid defaults, pinned filters, and page-specific layout preferences.
                </p>
              </div>

              <div class="rounded-none border border-[rgba(201,164,90,0.12)] bg-[rgba(20,17,12,0.44)] p-3">
                <div class="text-sm font-semibold text-white">Section Toggles</div>
                <p class="mt-1 text-xs leading-5 text-[#9f9278]">
                  Show, hide, reorder, or rename world navigation sections.
                </p>
              </div>

              <div class="rounded-none border border-[rgba(201,164,90,0.12)] bg-[rgba(20,17,12,0.44)] p-3">
                <div class="text-sm font-semibold text-white">Theme Presets</div>
                <p class="mt-1 text-xs leading-5 text-[#9f9278]">
                  Named page themes and reusable background/presentation presets.
                </p>
              </div>
            </div>
          </section>
        </div>
      </section>

      <section
        v-else-if="activePanel === 'transfers'"
        class="mt-6"
      >
        <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                Transfers
              </div>
              <h2 class="mt-2 text-2xl font-semibold text-white">
                Recent Offers and Grants
              </h2>
            </div>

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
              @click="refreshTransfers"
            >
              Refresh
            </button>
          </div>

          <div
            v-if="transfersPending"
            class="mt-5 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-6 text-sm text-[#9f9278]"
          >
            Loading transfers...
          </div>

          <div
            v-else-if="!transfers.length"
            class="mt-5 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-6 text-sm text-[#9f9278]"
          >
            No transfer history yet.
          </div>

          <div
            v-else
            class="mt-5 overflow-hidden rounded-none border border-[rgba(201,164,90,0.18)]"
          >
            <div class="hidden grid-cols-[1.2fr_1fr_1fr_120px] gap-3 border-b border-[rgba(201,164,90,0.14)] bg-[rgba(8,17,27,0.60)] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9f9278] xl:grid">
              <div>Item</div>
              <div>From</div>
              <div>To</div>
              <div>Status</div>
            </div>

            <article
              v-for="transfer in transfers"
              :key="transfer.id"
              class="grid gap-3 border-b border-[rgba(201,164,90,0.10)] px-3 py-3 last:border-b-0 xl:grid-cols-[1.2fr_1fr_1fr_120px] xl:items-center"
            >
              <div>
                <div class="font-semibold text-white">{{ transfer.itemName }} x{{ transfer.quantity || 1 }}</div>
                <div
                  v-if="transfer.message"
                  class="mt-1 text-xs text-[#9f9278]"
                >
                  {{ transfer.message }}
                </div>
              </div>

              <button
                type="button"
                class="text-left text-sm text-[#d8ceb8] hover:text-[#fff7df]"
                @click="transfer.source && openEntityContext(transfer.source)"
              >
                {{ transfer.source?.title || 'Unknown' }}
              </button>

              <button
                type="button"
                class="text-left text-sm text-[#d8ceb8] hover:text-[#fff7df]"
                @click="transfer.target && openEntityContext(transfer.target)"
              >
                {{ transfer.target?.title || 'Unknown' }}
              </button>

              <span
                class="w-fit rounded-none border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]"
                :class="transferStatusClass(transfer.status)"
              >
                {{ transfer.status }}
              </span>
            </article>
          </div>
        </div>
      </section>

      <section
        v-else-if="activePanel === 'relationships'"
        class="mt-6"
      >
        <div class="eldra-ornate-panel eldra-frame-corners rounded-none border border-[rgba(201,164,90,0.24)] bg-[rgba(10,12,14,0.64)] p-5 backdrop-blur">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="text-xs uppercase tracking-[0.3em] text-[#9f9278]">
                Relationships
              </div>
              <h2 class="mt-2 text-2xl font-semibold text-white">
                World Relationship Feed
              </h2>
              <p class="mt-2 text-sm leading-6 text-[#d8ceb8]">
                Quick inspection. Editing still belongs on the full article page.
              </p>
            </div>

            <button
              type="button"
              class="rounded-none border border-[rgba(201,164,90,0.24)] px-3 py-2 text-xs font-semibold text-[#fff7df]"
              @click="refreshRelationships"
            >
              Refresh
            </button>
          </div>

          <div
            v-if="relationshipsPending"
            class="mt-5 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-6 text-sm text-[#9f9278]"
          >
            Loading relationships...
          </div>

          <div
            v-else-if="!relationships.length"
            class="mt-5 rounded-none border border-dashed border-[rgba(201,164,90,0.20)] p-6 text-sm text-[#9f9278]"
          >
            No relationships yet.
          </div>

          <div
            v-else
            class="mt-5 grid gap-3 md:grid-cols-2"
          >
            <article
              v-for="relationship in relationships"
              :key="relationship.id"
              class="rounded-none border border-[rgba(201,164,90,0.16)] bg-[rgba(8,17,27,0.42)] p-4"
            >
              <div class="text-[10px] uppercase tracking-[0.18em] text-[#9f9278]">
                {{ relationship.direction || 'relationship' }} / {{ relationshipTypeLabel(relationship) }}
              </div>

              <button
                type="button"
                class="mt-2 block text-left text-base font-semibold text-white hover:text-[#fff7df]"
                @click="relationshipOther(relationship) && openEntityContext(relationshipOther(relationship))"
              >
                {{ relationship.displayLabel || relationship.label || 'related to' }}
                <span class="text-[#9f9278]">-></span>
                {{ relationshipTitle(relationship) }}
              </button>

              <p
                v-if="relationship.summary"
                class="mt-2 text-sm leading-6 text-[#d8ceb8]"
              >
                {{ relationship.summary }}
              </p>
            </article>
          </div>
        </div>
      </section>
    </div>

    <WorldEntityContextDrawer
      :open="contextDrawerOpen"
      :entity="selectedContextEntity"
      :world-id="worldId"
      :mode="mode"
      read-more-label="Read More"
      @close="closeEntityContext"
      @read-more="openArticle"
      @open-mention="openEntityContext"
    />
  </div>
</template>
