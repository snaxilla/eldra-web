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
  const cleaned = hex.replace('#', '')
  const num = parseInt(cleaned, 16)
  const amt = Math.round(2.55 * percent)

  const r = (num >> 16) + amt
  const g = ((num >> 8) & 0x00ff) + amt
  const b = (num & 0x0000ff) + amt

  return (
    '#' +
    (
      0x1000000 +
      (r < 255 ? (r < 0 ? 0 : r) : 255) * 0x10000 +
      (g < 255 ? (g < 0 ? 0 : g) : 255) * 0x100 +
      (b < 255 ? (b < 0 ? 0 : b) : 255)
    )
      .toString(16)
      .slice(1)
  )
}

export const useThemeStyles = () => {
  const theme = useThemeState()

  const pageStyle = computed(() => ({
    backgroundColor: theme.value.pageBg,
    backgroundImage: theme.value.pageBgImage
      ? `linear-gradient(rgba(0,0,0,0.30), rgba(0,0,0,0.30)), url("${theme.value.pageBgImage}")`
      : 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed'
  }))

  const panelStyle = computed(() => ({
    backgroundColor: theme.value.panelBg,
    backgroundImage: theme.value.panelBgImage
      ? `linear-gradient(rgba(0,0,0,0.22), rgba(0,0,0,0.22)), url("${theme.value.panelBgImage}")`
      : 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat'
  }))

  const cardBg = computed(() => adjustColor(theme.value.panelBg, -10))
  const cardBorder = computed(() => adjustColor(theme.value.panelBg, 8))
  const hoverBg = computed(() => adjustColor(cardBg.value, 6))

  const cardStyle = computed(() => ({
    backgroundColor: cardBg.value,
    borderColor: cardBorder.value
  }))

  const softPanelStyle = computed(() => ({
    backgroundColor: adjustColor(theme.value.panelBg, -6),
    borderColor: adjustColor(theme.value.panelBg, 10)
  }))

  const hoverStyle = computed(() => ({
    backgroundColor: hoverBg.value
  }))

  return {
    theme,
    pageStyle,
    panelStyle,
    cardStyle,
    softPanelStyle,
    hoverStyle
  }
}
