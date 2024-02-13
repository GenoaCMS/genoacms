const createPage = (name: string) => {
  return {
    name,
    components: [],
    lastModified: new Date().toISOString()
  }
}

export {
  createPage
}
