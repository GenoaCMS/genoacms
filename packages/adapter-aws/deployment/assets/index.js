import { handler as kitHandler } from './handler.js'
import awsServerlessExpress from 'aws-serverless-express'

const server = awsServerlessExpress.createServer(kitHandler)

export function handler (event, context) {
  awsServerlessExpress.proxy(server, event, context)
}
