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

export const useThemeStyles = () => {
  const theme = useThemeState()

  const pageStyle = computed(() => ({
    backgroundColor: theme.value.pageBg,
    backgroundImage: theme.value.pageBgImage
      ? `linear-gradient(rgba(2,6,23,0.72), rgba(2,6,23,0.72)), url("${theme.value.pageBgImage}")`
      : 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed'
  }))

  const panelStyle = computed(() => ({
    backgroundColor: theme.value.panelBg,
    backgroundImage: theme.value.panelBgImage
      ? `linear-gradient(rgba(2,6,23,0.52), rgba(2,6,23,0.52)), url("${theme.value.panelBgImage}")`
      : 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat'
  }))

  const softPanelStyle = computed(() => ({
    backgroundColor: theme.value.panelBg,
    backgroundImage: theme.value.panelBgImage
      ? `linear-gradient(rgba(2,6,23,0.68), rgba(2,6,23,0.68)), url("${theme.value.panelBgImage}")`
      : 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat'
  }))

  return {
    theme,
    pageStyle,
    panelStyle,
    softPanelStyle
  }
}
