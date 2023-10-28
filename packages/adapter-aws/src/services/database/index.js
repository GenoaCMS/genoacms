import { GetItemCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import config from '../../config.js'
import 'dotenv/config'

const client = new DynamoDBClient({
  region: config.database.region,
  credentials: {
    accessKeyId: globalThis.process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: globalThis.process.env.AWS_SECRET_ACCESS_KEY
  }
})

const getItem = async (collection, id) => {
  let idWrapper
  switch (typeof id) {
    case 'string':
      idWrapper = { S: id }
      break
    case 'number':
      idWrapper = { N: id.toString() }
      break
    default:
      throw new Error('id must be a string or a number')
  }
  console.log(idWrapper)
  const command = new GetItemCommand({
    TableName: collection,
    // For more information about data types,
    // see https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.NamingRulesDataTypes.html#HowItWorks.DataTypes and
    // https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Programming.LowLevelAPI.html#Programming.LowLevelAPI.DataTypeDescriptors
    Key: {
      id: idWrapper
    }
  })

  const response = await client.send(command)
  console.log(response)
  return response
}

// getItem('test', 'tt')

export {
  getItem
}
