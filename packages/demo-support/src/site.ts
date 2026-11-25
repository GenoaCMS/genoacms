/** The letters a speaker without a photo is shown by. */
const initialsOf = (name: string): string =>
  name.split(/\s+/).filter(word => word !== '').map(word => word[0]).join('').slice(0, 2).toUpperCase()

/** A `text` value written one item per line, as the items. */
const linesOf = (text: string): string[] =>
  text.split('\n').map(line => line.trim()).filter(line => line !== '')

/** The column count a grid is laid out with, kept to what the layout supports. */
const columnsOf = (columns: number): number =>
  Math.min(4, Math.max(1, Math.round(Number.isFinite(columns) ? columns : 3)))

export { initialsOf, linesOf, columnsOf }
