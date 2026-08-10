interface Credentials {
    email: string,
    password: string
}
type credentialsArray = Array<Credentials>

export type {
    Credentials,
    credentialsArray
}
