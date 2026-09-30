import { createServer } from 'node:http'

const { NODE_ENV, PORT, ADDRESS_HEADER, XFF_DEPTH, ORIGIN, PROTOCOL_HEADER, HOST_HEADER } = process.env
const env = { NODE_ENV, PORT, ADDRESS_HEADER, XFF_DEPTH, ORIGIN, PROTOCOL_HEADER, HOST_HEADER }

createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ env, headers: request.headers }))
}).listen(Number(PORT))
