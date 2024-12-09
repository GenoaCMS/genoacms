import { handler } from './node_modules/@genoacms/core/build/index.js'

function genoacms (req, res) {
  handler(req, res, undefined)
}

export { genoacms }

