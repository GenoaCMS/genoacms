/** The letters a speaker without a photo is shown by. */
const initialsOf = (name: string): string =>
  name.split(/\s+/).filter(word => word !== '').map(word => word[0]).join('').slice(0, 2).toUpperCase()

/** A `text` value written one item per line, as the items. */
const linesOf = (text: string): string[] =>
  text.split('\n').map(line => line.trim()).filter(line => line !== '')

/** The column count a grid is laid out with, kept to what the layout supports. */
const columnsOf = (columns: number): number =>
  Math.min(4, Math.max(1, Math.round(Number.isFinite(columns) ? columns : 3)))

/** The CSS image of the first of a storageResource value's URLs, or '' when it has none. */
const cssImageOf = (urls: readonly string[] | undefined): string => {
  const first = urls?.find(url => url !== '')
  return first === undefined ? '' : `url(${JSON.stringify(first)})`
}

/** How many slides a carousel shows at once, kept to what the layout supports. */
const perViewOf = (perView: number): number =>
  Math.min(3, Math.max(1, Math.round(Number.isFinite(perView) ? perView : 1)))

/** Turns a carousel's track by one view: `1` forward, `-1` back. */
const turnCarousel = (track: HTMLElement | null | undefined, direction: 1 | -1): void => {
  track?.scrollBy({ left: direction * track.clientWidth, behavior: 'smooth' })
}

export { initialsOf, linesOf, columnsOf, perViewOf, cssImageOf, turnCarousel }
