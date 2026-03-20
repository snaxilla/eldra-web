export function useEntityTypeUi() {
  const iconMap: Record<string, string> = {
    spell: 'i-lucide-wand-sparkles',
    item: 'i-lucide-swords',
    background: 'i-lucide-scroll',
    feat: 'i-lucide-badge-plus',
    species: 'i-lucide-user',
    class: 'i-lucide-shield',
    subclass: 'i-lucide-shield-plus',
    monster: 'i-lucide-drama',
    article: 'i-lucide-file-text',
    character: 'i-lucide-user-round'
  }

  const labelMap: Record<string, string> = {
    spell: 'Spell',
    item: 'Item',
    background: 'Background',
    feat: 'Feat',
    species: 'Species',
    class: 'Class',
    subclass: 'Subclass',
    monster: 'Monster',
    article: 'Article',
    character: 'Character'
  }

  function iconFor(type?: string) {
    return iconMap[type || ''] || 'i-lucide-box'
  }

  function labelFor(type?: string) {
    return labelMap[type || ''] || (type ? type[0].toUpperCase() + type.slice(1) : 'Unknown')
  }

  return {
    iconFor,
    labelFor
  }
}
