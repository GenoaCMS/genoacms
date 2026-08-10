async function getProviders (providersConfig: Array<{ adapter: Promise<object> }>) {
  const providerPromises = []
  for (const provider of providersConfig) {
    providerPromises.push(provider.adapter)
  }
  return await Promise.all(providerPromises)
}

async function getProvider (providers: Array<{ adapter: Promise<object> }>, providerName: string) {
  const provider = providers.find(provider => provider.name === providerName)
  if (!provider) throw new Error('provider/not-found')
  return await provider.adapter
}

async function callProvidersFunction (providers: Array<object>, functionName: string, args: Array<any>) {
  const results = []
  for (const provider of providers) {
    results.push(provider[functionName](...args))
  }
  const settled = await Promise.allSettled(results)
  return settled.filter(result => result.status === 'fulfilled').map(result => result.value)
}

function isAnyTrue (bools: Array<boolean>) {
  return bools.some(bool => bool === true)
}

export {
  getProviders,
  getProvider,
  callProvidersFunction,
  isAnyTrue
}
