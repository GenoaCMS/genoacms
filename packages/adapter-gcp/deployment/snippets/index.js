import { handler } from './build/handler.js'

function genoacms (req, res) {
  handler(req, res, undefined)
}

export { genoacms }

