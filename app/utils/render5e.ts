function decodeAttackTag(tagValue: string) {
  const parts = String(tagValue || '').split(',').map(s => s.trim()).filter(Boolean)

  const labels = parts.map((part) => {
    if (part === 'm') return 'Melee Attack:'
    if (part === 'r') return 'Ranged Attack:'
    if (part === 'mw') return 'Melee Weapon Attack:'
    if (part === 'rw') return 'Ranged Weapon Attack:'
    if (part === 'ms') return 'Melee Spell Attack:'
    if (part === 'rs') return 'Ranged Spell Attack:'
    return part.toUpperCase()
  })

  if (!labels.length) return 'Attack:'
  if (labels.length === 1) return labels[0]
  return labels.join(' or ')
}

function stripTag(tagName: string, inner: string) {
  const value = String(inner || '').trim()

  switch (tagName) {
    case 'hit':
      return value ? `${value.startsWith('+') || value.startsWith('-') ? value : `+${value}`}` : ''
    case 'damage':
      return value
    case 'condition':
    case 'skill':
    case 'sense':
    case 'item':
    case 'spell':
    case 'creature':
    case 'race':
    case 'class':
    case 'background':
    case 'status':
    case 'dc':
      return value.split('|')[0].trim()
    case 'atk':
    case 'atkr':
      return decodeAttackTag(value)
    case 'h':
      return 'Hit:'
    case 'recharge':
      return value ? `(Recharge ${value})` : '(Recharge)'
    case 'actTrigger':
      return 'Trigger:'
    case 'actResponse':
      return 'Response:'
    case 'actSave':
      return 'Save:'
    case 'actSaveSuccess':
      return 'Success:'
    case 'actSaveFail':
      return 'Failure:'
    case 'i':
    case 'b':
      return value
    case 'dice':
      return value
    case 'note':
      return value
    case 'filter':
      return value.split('|')[0].trim()
    case 'variantrule':
      return value.split('|')[0].trim()
    default:
      return value.split('|')[0].trim()
  }
}

export function render5eText(input: any) {
  let text = String(input ?? '')

  if (!text.trim()) return ''

  text = text.replace(/\{@([a-zA-Z]+)\s+([^}]+)\}/g, (_match, tagName, inner) => {
    return stripTag(String(tagName), String(inner))
  })

  text = text.replace(/\s+([.,;:!?])/g, '$1')
  text = text.replace(/\(\s+/g, '(')
  text = text.replace(/\s+\)/g, ')')
  text = text.replace(/\n{3,}/g, '\n\n')
  text = text.replace(/[ \t]{2,}/g, ' ')
  text = text.trim()

  return text
}
