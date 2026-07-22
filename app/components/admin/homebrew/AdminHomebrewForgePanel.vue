<script setup lang="ts">
import AdminHomebrewTypePicker from '~/components/admin/homebrew/AdminHomebrewTypePicker.vue'
import AdminHomebrewTemplatePicker from '~/components/admin/homebrew/AdminHomebrewTemplatePicker.vue'
import AdminHomebrewSpellBuilder from '~/components/admin/homebrew/AdminHomebrewSpellBuilder.vue'
import AdminHomebrewItemBuilder from '~/components/admin/homebrew/AdminHomebrewItemBuilder.vue'
import AdminHomebrewDraftReview from '~/components/admin/homebrew/AdminHomebrewDraftReview.vue'
import AdminHomebrewEnemyBuilder from '~/components/admin/homebrew/AdminHomebrewEnemyBuilder.vue'

const props = defineProps<{
  worldId: string | number
}>()

const router = useRouter()
const worldId = computed(() => String(props.worldId || ''))

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


const ENEMY_SIZE_OPTIONS = [
  { value: 'T', label: 'Tiny' },
  { value: 'S', label: 'Small' },
  { value: 'M', label: 'Medium' },
  { value: 'L', label: 'Large' },
  { value: 'H', label: 'Huge' },
  { value: 'G', label: 'Gargantuan' }
]

const ENEMY_TYPE_OPTIONS = [
  'aberration',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'elemental',
  'fey',
  'fiend',
  'giant',
  'humanoid',
  'monstrosity',
  'ooze',
  'plant',
  'undead'
]

const ENEMY_ALIGNMENT_OPTIONS = [
  { value: '', label: 'Unaligned / Any' },
  { value: 'L / G', label: 'Lawful Good' },
  { value: 'N / G', label: 'Neutral Good' },
  { value: 'C / G', label: 'Chaotic Good' },
  { value: 'L / N', label: 'Lawful Neutral' },
  { value: 'N', label: 'Neutral' },
  { value: 'C / N', label: 'Chaotic Neutral' },
  { value: 'L / E', label: 'Lawful Evil' },
  { value: 'N / E', label: 'Neutral Evil' },
  { value: 'C / E', label: 'Chaotic Evil' }
]

const enemyBuilderForm = reactive({
  name: '',
  size: 'M',
  creatureType: 'humanoid',
  alignment: '',
  challengeRating: '',
  xp: '',
  armorClass: '',
  hitPoints: '',
  speed: '',
  str: '10',
  dex: '10',
  con: '10',
  int: '10',
  wis: '10',
  cha: '10',
  savingThrows: '',
  skills: '',
  senses: '',
  languages: '',
  vulnerabilities: '',
  resistances: '',
  immunities: '',
  conditionImmunities: '',
  description: '',
  traits: '',
  actions: '',
  bonusActions: '',
  reactions: '',
  legendaryActions: ''
})

function enemyBuilderText(value: any) {
  return String(value ?? '').trim()
}

function enemySizeLabel(value: any) {
  const key = String(value || '').toUpperCase()
  return ENEMY_SIZE_OPTIONS.find((option) => option.value === key)?.label || key || 'Size'
}

function enemyAbilityValue(value: any, fallback = '10') {
  const text = enemyBuilderText(value)
  if (!text) return fallback

  const parsed = Number(text)
  return Number.isFinite(parsed) ? String(Math.floor(parsed)) : fallback
}

function hydrateEnemyBuilderFromTemplate(template: any) {
  const core = template?.core || {}

  enemyBuilderForm.name = enemyBuilderText(core.name || template?.title || '')
  enemyBuilderForm.size = enemyBuilderText(core.size || 'M').split('/')[0].trim().toUpperCase() || 'M'
  enemyBuilderForm.creatureType = enemyBuilderText(core.creature_type || core.creatureType || 'humanoid')
  enemyBuilderForm.alignment = enemyBuilderText(core.alignment || '')
  enemyBuilderForm.challengeRating = enemyBuilderText(core.challenge_rating || core.challengeRating || '')
  enemyBuilderForm.xp = enemyBuilderText(core.xp || '')
  enemyBuilderForm.armorClass = enemyBuilderText(core.armor_class || core.armorClass || '')
  enemyBuilderForm.hitPoints = enemyBuilderText(core.hit_points || core.hitPoints || '')
  enemyBuilderForm.speed = enemyBuilderText(core.speed || '')
  enemyBuilderForm.str = enemyAbilityValue(core.str)
  enemyBuilderForm.dex = enemyAbilityValue(core.dex)
  enemyBuilderForm.con = enemyAbilityValue(core.con)
  enemyBuilderForm.int = enemyAbilityValue(core.int)
  enemyBuilderForm.wis = enemyAbilityValue(core.wis)
  enemyBuilderForm.cha = enemyAbilityValue(core.cha)
  enemyBuilderForm.savingThrows = enemyBuilderText(core.savingThrows || core.saving_throws || '')
  enemyBuilderForm.skills = enemyBuilderText(core.skills || '')
  enemyBuilderForm.senses = enemyBuilderText(core.senses || '')
  enemyBuilderForm.languages = enemyBuilderText(core.languages || '')
  enemyBuilderForm.vulnerabilities = enemyBuilderText(core.vulnerabilities || '')
  enemyBuilderForm.resistances = enemyBuilderText(core.resistances || '')
  enemyBuilderForm.immunities = enemyBuilderText(core.immunities || '')
  enemyBuilderForm.conditionImmunities = enemyBuilderText(core.conditionImmunities || core.condition_immunities || '')
  enemyBuilderForm.description = enemyBuilderText(core.description || template?.summary || '')
  enemyBuilderForm.traits = enemyBuilderText(core.traits || '')
  enemyBuilderForm.actions = enemyBuilderText(core.actions || '')
  enemyBuilderForm.bonusActions = enemyBuilderText(core.bonusActions || core.bonus_actions || '')
  enemyBuilderForm.reactions = enemyBuilderText(core.reactions || '')
  enemyBuilderForm.legendaryActions = enemyBuilderText(core.legendaryActions || core.legendary_actions || '')

  if (!homebrewTitle.value.trim()) {
    homebrewTitle.value = enemyBuilderForm.name
      ? `Homebrew: ${enemyBuilderForm.name}`
      : defaultHomebrewTitle(template)
  }
}

function resetEnemyBuilderForm() {
  enemyBuilderForm.name = ''
  enemyBuilderForm.size = 'M'
  enemyBuilderForm.creatureType = 'humanoid'
  enemyBuilderForm.alignment = ''
  enemyBuilderForm.challengeRating = ''
  enemyBuilderForm.xp = ''
  enemyBuilderForm.armorClass = ''
  enemyBuilderForm.hitPoints = ''
  enemyBuilderForm.speed = ''
  enemyBuilderForm.str = '10'
  enemyBuilderForm.dex = '10'
  enemyBuilderForm.con = '10'
  enemyBuilderForm.int = '10'
  enemyBuilderForm.wis = '10'
  enemyBuilderForm.cha = '10'
  enemyBuilderForm.savingThrows = ''
  enemyBuilderForm.skills = ''
  enemyBuilderForm.senses = ''
  enemyBuilderForm.languages = ''
  enemyBuilderForm.vulnerabilities = ''
  enemyBuilderForm.resistances = ''
  enemyBuilderForm.immunities = ''
  enemyBuilderForm.conditionImmunities = ''
  enemyBuilderForm.description = ''
  enemyBuilderForm.traits = ''
  enemyBuilderForm.actions = ''
  enemyBuilderForm.bonusActions = ''
  enemyBuilderForm.reactions = ''
  enemyBuilderForm.legendaryActions = ''
}

function enemyBuilderPayload() {
  return {
    name: enemyBuilderForm.name,
    size: enemyBuilderForm.size,
    creatureType: enemyBuilderForm.creatureType,
    alignment: enemyBuilderForm.alignment,
    challengeRating: enemyBuilderForm.challengeRating,
    xp: enemyBuilderForm.xp,
    armorClass: enemyBuilderForm.armorClass,
    hitPoints: enemyBuilderForm.hitPoints,
    speed: enemyBuilderForm.speed,
    str: enemyBuilderForm.str,
    dex: enemyBuilderForm.dex,
    con: enemyBuilderForm.con,
    int: enemyBuilderForm.int,
    wis: enemyBuilderForm.wis,
    cha: enemyBuilderForm.cha,
    savingThrows: enemyBuilderForm.savingThrows,
    skills: enemyBuilderForm.skills,
    senses: enemyBuilderForm.senses,
    languages: enemyBuilderForm.languages,
    vulnerabilities: enemyBuilderForm.vulnerabilities,
    resistances: enemyBuilderForm.resistances,
    immunities: enemyBuilderForm.immunities,
    conditionImmunities: enemyBuilderForm.conditionImmunities,
    description: enemyBuilderForm.description,
    traits: enemyBuilderForm.traits,
    actions: enemyBuilderForm.actions,
    bonusActions: enemyBuilderForm.bonusActions,
    reactions: enemyBuilderForm.reactions,
    legendaryActions: enemyBuilderForm.legendaryActions
  }
}

const enemyBuilderSummaryLine = computed(() => {
  if (homebrewType.value !== 'enemy') return ''

  return [
    enemySizeLabel(enemyBuilderForm.size),
    enemyBuilderForm.creatureType,
    enemyBuilderForm.challengeRating ? `CR ${enemyBuilderForm.challengeRating}` : '',
    enemyBuilderForm.armorClass ? `AC ${enemyBuilderForm.armorClass}` : '',
    enemyBuilderForm.hitPoints ? `HP ${enemyBuilderForm.hitPoints}` : ''
  ].filter(Boolean).join(' - ')
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

  if (homebrewType.value === 'enemy') {
    hydrateEnemyBuilderFromTemplate(template)
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


  if (homebrewType.value === 'enemy') {
    return homebrewTitle.value.trim() ||
      enemyBuilderForm.name.trim() ||
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


  if (homebrewType.value === 'enemy') {
    if (!homebrewHasText(enemyBuilderForm.name)) {
      push('error', 'Enemy Name Required', 'Set the enemy name before creating the draft.')
    }

    if (!homebrewHasText(enemyBuilderForm.challengeRating)) {
      push('warn', 'CR Empty', 'Combat export will eventually need challenge rating.')
    }

    if (!homebrewHasText(enemyBuilderForm.armorClass)) {
      push('warn', 'AC Empty', 'Combat export will eventually need armor class.')
    }

    if (!homebrewHasText(enemyBuilderForm.hitPoints)) {
      push('warn', 'HP Empty', 'Combat export will eventually need hit points.')
    }

    if (!homebrewHasText(enemyBuilderForm.actions)) {
      push('warn', 'Actions Empty', 'The enemy has no action text yet.')
    }

    if (!homebrewHasText(enemyBuilderForm.description)) {
      push('warn', 'Description Empty', 'The enemy can be created, but its article and overview will be thin.')
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
          : undefined,
        enemy: homebrewType.value === 'enemy'
          ? enemyBuilderPayload()
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
</script>

<template>
  <section
          class="mt-6 grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]"
        >
          <AdminHomebrewTypePicker
          v-model="homebrewType"
          :types="homebrewTypes"
        />
  
          <div class="grid gap-6">
            <AdminHomebrewTemplatePicker
            v-model:search="homebrewTemplateSearch"
            :type="selectedHomebrewType"
            :templates="homebrewTemplates"
            :filtered-templates="homebrewFilteredTemplates"
            :pending="homebrewTemplatesPending"
            :selected-template-id="homebrewSelectedTemplateId"
            @select="selectHomebrewTemplate"
          />
  
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
  
              <AdminHomebrewSpellBuilder
              v-if="homebrewType === 'spell' && selectedHomebrewTemplate"
              :form="spellBuilderForm"
              :summary-line="spellBuilderSummaryLine"
              :level-options="SPELL_LEVEL_OPTIONS"
              :school-options="SPELL_SCHOOL_OPTIONS"
              :attack-options="SPELL_ATTACK_OPTIONS"
              :save-options="SPELL_SAVE_OPTIONS"
              :damage-types="SPELL_DAMAGE_TYPES"
            />
  
              <AdminHomebrewItemBuilder
              v-if="homebrewType === 'item' && selectedHomebrewTemplate"
              :form="itemBuilderForm"
              :summary-line="itemBuilderSummaryLine"
              :type-options="ITEM_TYPE_OPTIONS"
              :rarity-options="ITEM_RARITY_OPTIONS"
              :equip-slot-options="ITEM_EQUIP_SLOT_OPTIONS"
              :damage-types="ITEM_DAMAGE_TYPES"
              :action-timings="ITEM_ACTION_TIMINGS"
              :recharge-options="ITEM_RECHARGE_OPTIONS"
            />

            <AdminHomebrewEnemyBuilder
              v-if="homebrewType === 'enemy' && selectedHomebrewTemplate"
              :form="enemyBuilderForm"
              :summary-line="enemyBuilderSummaryLine"
              :size-options="ENEMY_SIZE_OPTIONS"
              :type-options="ENEMY_TYPE_OPTIONS"
              :alignment-options="ENEMY_ALIGNMENT_OPTIONS"
            />

  
              <label class="mt-5 block">
                <span class="mb-2 block text-xs uppercase tracking-[0.2em] text-[#9f9278]">Draft Title</span>
                <input
                  v-model="homebrewTitle"
                  class="eldra-input w-full rounded-none px-3 py-3 text-sm text-white"
                  :placeholder="selectedHomebrewTemplate ? defaultHomebrewTitle(selectedHomebrewTemplate) : 'Choose a template first...'"
                >
              </label>
  
              <AdminHomebrewDraftReview
              v-if="selectedHomebrewTemplate"
              :review-rows="homebrewReviewRows"
              :checks="homebrewDraftChecks"
              :blocking-count="homebrewBlockingCheckCount"
              :warning-count="homebrewWarningCheckCount"
            />
  
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
</template>
