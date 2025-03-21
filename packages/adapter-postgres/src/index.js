import { getProvider } from '@genoacms/cloudabstraction'
import postgres from 'postgres'

const ADAPTER_NAME = '@genoacms/adapter-postgres'
const provider = getProvider('database', ADAPTER_NAME)
const sql = postgres({
  idle_timeout: 20,
  ...provider.config
})
console.log(provider)

async function testConnection() {
  const test = await sql`SELECT * FROM Test`
  console.log(test, test[0].name)
  return
}

testConnection()
