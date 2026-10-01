const { NODE_ENV, PORT, ADDRESS_HEADER, ORIGIN, PROTOCOL_HEADER, HOST_HEADER } = process.env
const env = { NODE_ENV, PORT, ADDRESS_HEADER, ORIGIN, PROTOCOL_HEADER, HOST_HEADER }

export function handler (request, response) {
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ env, headers: request.headers }))
}
