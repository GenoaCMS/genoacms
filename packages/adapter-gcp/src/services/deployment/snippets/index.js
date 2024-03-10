import { HttpFunction } from '@google-cloud/functions-framework'
import { handler } from './build/handler.js'

const svelteKitApp = new HttpFunction(handler)

export {
  svelteKitApp
}
