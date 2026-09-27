async function callProvidersFunction (providers: Array<object>, functionName: string, args: Array<any>) {
  const results = []
  for (const provider of providers) {
    results.push(provider[functionName](...args))
  }
  const settled = await Promise.allSettled(results)
  return settled.filter(result => result.status === 'fulfilled').map(result => result.value)
}

function firstNonNull<T> (values: Array<T | null>): T | null {
  return values.find(value => value !== null) ?? null
}

export {
  callProvidersFunction,
  firstNonNull
}
