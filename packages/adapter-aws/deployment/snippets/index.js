let serverHandler

async function handler (e, c) {
  if (!serverHandler) {
    const module = await import('./build/server/serverless.js')
    serverHandler = module.handler
  }
  console.log('ok')
  return await serverHandler(e, c)
}

module.exports = { handler }
