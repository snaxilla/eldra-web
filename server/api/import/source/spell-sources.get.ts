import { readJsonFile, uniqueSortedSources } from '../../../utils/import-source'

const SPELLS_DIR = '/opt/eldra/datasets/5etools-src/data/spells'
const SPELL_FILES = [
  'spells-aag.json',
  'spells-ai.json',
  'spells-aitfr-avt.json',
  'spells-bmt.json',
  'spells-efa.json',
  'spells-egw.json',
  'spells-frhof.json',
  'spells-ftd.json',
  'spells-ggr.json',
  'spells-idrotf.json',
  'spells-llk.json',
  'spells-phb.json',
  'spells-sato.json',
  'spells-scc.json',
  'spells-tce.json',
  'spells-xge.json',
  'spells-xphb.json'
]

export default defineEventHandler(async () => {
  const allSpells: any[] = []

  for (const file of SPELL_FILES) {
    try {
      const json = await readJsonFile(`${SPELLS_DIR}/${file}`)
      const spells = Array.isArray(json?.spell) ? json.spell : []
      allSpells.push(...spells)
    } catch {}
  }

  const sources = uniqueSortedSources(allSpells.map((item) => item?.source)).map((source) => ({
    source
  }))

  return {
    ok: true,
    count: sources.length,
    sources
  }
})
