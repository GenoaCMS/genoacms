/**
 * The width of the column an inline selection checkbox sits in.
 *
 * Shared by the checkbox and by any header that has to line its columns up with the rows beneath —
 * two places that must agree, and would silently drift by a few pixels if each named its own width.
 */
const SELECTION_GUTTER = 'w-10'

/** Where a column pinned beside the gutter starts, so it stays clear of the checkbox while the row scrolls sideways. */
const AFTER_SELECTION_GUTTER = 'start-10'

export { SELECTION_GUTTER, AFTER_SELECTION_GUTTER }
