import { config } from '@genoacms/cloudabstraction'

console.log(config.database)
const adapter = await config.database.adapter
// const collection = config.collections[0]
// console.log(
//     collection,
//     await adapter.getCollection(collection)
// )
export default adapter
