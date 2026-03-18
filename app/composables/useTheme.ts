export type EldraTheme = {
  key: string
  pageBg: string
  panelBg: string
  pageBgImage: string
  panelBgImage: string
}

export const useThemeState = () =>
  useState<EldraTheme>('eldra-theme', () => ({
    key: 'midnight',
    pageBg: '#020617',
    panelBg: '#0f172a',
    pageBgImage: '',
    panelBgImage: ''
  }))

function adjustColor(hex: string, percent: number) {
  const num = parseInt(hex.replace('#',''), 16)
  const amt = Math.round(2.55 * percent)
  const R = (num >> 16) + amt
  const G = ((num >> 8) & 0x00FF) + amt
  const B = (num & 0x0000FF) + amt

  return '#' + (
    0x1000000 +
    (R<255?R<0?0:R:255)*0x10000 +
    (G<255?G<0?0:G:255)*0x100 +
    (B<255?B<0?0:B:255)
  ).toString(16).slice(1)
}

export const useThemeStyles = () => {
  const theme = useThemeState()

  const pageStyle = computed(() => ({
    backgroundColor: theme.value.pageBg,
    backgroundImage: theme.value.pageBgImage
      ? `linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)), url("${theme.value.pageBgImage}")`
      : 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed'
  }))

  const panelStyle = computed(() => ({
    backgroundColor: theme.value.panelBg,
    backgroundImage: theme.value.panelBgImage
      ? `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url("${theme.value.panelBgImage}")`
      : 'none'
  }))

  // 🔥 THIS is the fix: derived card layer
  const cardBg = computed(() => adjustColor(theme.value.panelBg, -8))

  const cardStyle = computed(() => ({
    backgroundColor: cardBg.value,
    borderColor: adjustColor(theme.value.panelBg, 10)
  }))

  const hoverStyle = computed(() => ({
    backgroundColor: adjustColor(cardBg.value, 6)
  }))

  return {
    theme,
    pageStyle,
    panelStyle,
    cardStyle,
    hoverStyle
  }
}
