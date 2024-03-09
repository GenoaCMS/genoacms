import { HttpFunction } from '@google-cloud/functions-framework'
import { handler } from './handler.js'

const svelteKitApp = HttpFunction(handler)

export {
  svelteKitApp
}
