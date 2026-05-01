import { readJsonFile, uniqueSortedSources } from '../../../utils/import-source'

const CLASS_DIR = '/opt/eldra/datasets/5etools-src/data/class'
const CLASS_FILES = [
  'class-artificer.json',
  'class-barbarian.json',
  'class-bard.json',
  'class-cleric.json',
  'class-druid.json',
  'class-fighter.json',
  'class-monk.json',
  'class-mystic.json',
  'class-paladin.json',
  'class-ranger.json',
  'class-rogue.json',
  'class-sidekick.json',
  'class-sorcerer.json',
  'class-warlock.json',
  'class-wizard.json'
]

export default defineEventHandler(async () => {
  const allClasses: any[] = []

  for (const file of CLASS_FILES) {
    try {
      const json = await readJsonFile(`${CLASS_DIR}/${file}`)
      const classes = Array.isArray(json?.class) ? json.class : []
      allClasses.push(...classes)
    } catch {}
  }

  const sources = uniqueSortedSources(allClasses.map((item) => item?.source)).map((source) => ({
    source
  }))

  return {
    ok: true,
    count: sources.length,
    sources
  }
})
