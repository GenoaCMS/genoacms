class ComponentDiffError extends Error {
  constructor (public code: string, message: string) {
    super(message)
  }
}

export {
  ComponentDiffError
}
