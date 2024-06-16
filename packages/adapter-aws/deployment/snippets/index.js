// let serverHandler
//
// async function handler (e, c) {
//   if (!serverHandler) {
//     const module = await import('./build/handler.js')
//     serverHandler = module.handler
//   }
//   console.log('ok')
//   return await serverHandler(e, c)
// }
//
// module.exports = { handler }

import handler from './build/handler.js'

export { handler }
