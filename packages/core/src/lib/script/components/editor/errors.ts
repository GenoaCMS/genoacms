class ComponentDiffError extends Error {
  constructor (public code: string, message: string) {
    super(message)
  }
}
class ComponentCodeError extends Error {
  constructor (public code: string, message: string) {
    super(message)
  }
}

export {
  ComponentDiffError,
  ComponentCodeError
}
