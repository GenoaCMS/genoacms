/**
 * A successfully authenticated principal.
 *
 * `subject` is the only value that may participate in an authorization decision;
 * `email` is presentation metadata. Email addresses are mutable and reassignable,
 * so binding permissions to them would let a recycled address inherit the
 * permissions of its previous holder.
 */
interface Identity {
  subject: string
  email: string
}

/**
 * Why a provider refused a sign-in (AUTHN-2).
 *
 * `credentials` covers an unknown email and a wrong password alike, and is the reason whenever the
 * provider cannot tell. The other two are reported only once the password is known to be right.
 */
type RejectionReason = 'credentials' | 'disabled' | 'second-factor-required'

/** A refused sign-in. Core shows the user one message for every reason, and logs the reason. */
interface Rejection {
  readonly rejected: RejectionReason
}

export type {
  Identity,
  Rejection,
  RejectionReason
}
