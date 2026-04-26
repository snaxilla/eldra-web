import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true
})

export function renderMarkdown(input: string) {
  if (!input) return ''

  try {
    return md.render(input)
  } catch {
    return input
  }
}
