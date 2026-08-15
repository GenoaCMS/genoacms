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

export type {
  Identity
}
