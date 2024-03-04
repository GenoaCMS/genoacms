import { config } from '@genoacms/cloudabstraction'
import { type Cookies } from '@sveltejs/kit'
import { CompactSign, jwtVerify } from 'jose'

const { cookieName, JWTSecret } = await config.authentication
const { loginWithEmailAndPassword } = await config.authentication.adapter
const { isEmailAdmins } = await config.authorization.adapter

const authenticateAndAuthorize = async (email: string, password: string): Promise<boolean> => {
  let areCredentialsValid = false
  try {
    areCredentialsValid = await loginWithEmailAndPassword(email, password)
  } catch (e) {
    return false
  }
  if (!areCredentialsValid) return false
  return isEmailAdmins(email)
}

const login = async (email: string, password: string, cookies: Cookies) => {
  const authResult = authenticateAndAuthorize(email, password)
  if (!authResult) return
  const payloadText = JSON.stringify({ email })
  const encoder = new TextEncoder()
  const token = await new CompactSign(encoder.encode(payloadText))
    .setProtectedHeader({ alg: 'HS256' })
    .sign(encoder.encode(JWTSecret))
  cookies.set(cookieName, token, { path: '/' })
}

const verifyAuthCookie = async (cookies: Cookies) => {
  const authCookie = cookies.get(cookieName)
  if (!authCookie) return false
  const result = await jwtVerify(authCookie, new TextEncoder().encode(JWTSecret))
  return result.payload
}

export {
  cookieName,
  login,
  verifyAuthCookie
}
