const extractProperties = (properties) => {
  const array = []
  for (const key in properties) {
    array.push({
      name: key,
      ...properties[key]
    })
  }
  return array
}

export {
  extractProperties
}
