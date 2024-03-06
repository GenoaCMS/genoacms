import { HttpFunction } from '@google-cloud/functions-framework'
import app from './build'

const svelteKitApp = HttpFunction(app.handler)

export {
  svelteKitApp
}
