import { config } from '@genoacms/cloudabstraction'

console.log(config.storage)
const adapter = await config.storage.adapter
export default adapter
