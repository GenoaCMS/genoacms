const ICONS_BY_EXTENSION: Record<string, string> = {
  png: 'bi-file-earmark-image',
  jpg: 'bi-file-earmark-image',
  jpeg: 'bi-file-earmark-image',
  gif: 'bi-file-earmark-image',
  webp: 'bi-file-earmark-image',
  avif: 'bi-file-earmark-image',
  svg: 'bi-file-earmark-image',
  pdf: 'bi-file-earmark-pdf',
  mp4: 'bi-file-earmark-play',
  webm: 'bi-file-earmark-play',
  mp3: 'bi-file-earmark-music',
  wav: 'bi-file-earmark-music',
  zip: 'bi-file-earmark-zip',
  txt: 'bi-file-earmark-text',
  md: 'bi-file-earmark-text',
  csv: 'bi-file-earmark-spreadsheet',
  xlsx: 'bi-file-earmark-spreadsheet',
  doc: 'bi-file-earmark-word',
  docx: 'bi-file-earmark-word'
}

const extensionOf = (name: string): string => name.split('.').pop()?.toLowerCase() ?? ''

const fileIcon = (name: string): string => ICONS_BY_EXTENSION[extensionOf(name)] ?? 'bi-file-earmark'

export { fileIcon }
