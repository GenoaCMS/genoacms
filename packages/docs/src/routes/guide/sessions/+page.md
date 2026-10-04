---
title: Identity and sessions
---

Who a user *is* comes from your [authentication provider](/guide/config/services). What they may
*do* comes from [roles and permissions](/guide/authorization), which GenoaCMS decides itself. This
page is about the join between the two: how a sign-in becomes a session, and what that session
carries.

## A user is a subject, never an email address

Every authorization decision is made against a **subject** — the stable identifier your
authentication provider issues. Email addresses are display metadata: they change hands, they get
reassigned, and a permission that rested on one would move with it.

So the key in `authorization.assignments` is a subject, the key in `users.json` is a subject, and the
email beside it is there to render a name on screen.

## Signing in across providers

A config may name several [authentication providers](/guide/config/services#Authentication). At
sign-in GenoaCMS tries them **one at a time, in the order of their keys**:

- a provider that recognizes the email and password returns an identity, and the trial stops;
- a provider that does not know the user, or finds the password wrong, passes to the next;
- a provider that knows the user and refuses them — a disabled account, a second factor GenoaCMS cannot ask for — stops the trial;
- a provider that fails — unreachable, throttled, misconfigured — is logged, and passes to the next.

An identity is admitted only if the authorization data knows its subject. A user sees one of three
messages, and never which provider answered or why:

| Message | When |
| :--- | :--- |
| invalid credentials | every provider refused, or the authorization data does not know the identity |
| too many attempts | no provider decided, and at least one was throttled |
| sign-in unavailable | no provider decided, and at least one failed; or none is configured |

Each refusal and each failure is logged with the provider's key and the reason. No log line holds
the email or the password.

## Two tokens, one cookie

A session is made of two things with very different lifetimes:

| | lifetime | what it is for |
| :--- | :--- | :--- |
| **Access token** | `accessTokenMinutes`, 15 by default | Proves who you are on each request. A signed JWT carrying `sub`, `iat`, `exp` and `jti` |
| **Refresh token** | `refreshTokenDays`, 14 by default | Obtains the next access token. Stored as a hash, never in readable form |

Both travel in **one cookie**, not two. Some hosting layers forward exactly one: Firebase Hosting
and Google Cloud CDN pass `__session` through and strip everything else, which would leave renewal
permanently broken there. One cookie means one code path rather than a deployment-specific one — on
those platforms, set `authentication.cookieName` to `__session`.

The cookie is `httpOnly`, `sameSite=lax`, and `secure` in production. It is scoped to the whole site
rather than to a refresh endpoint, because GenoaCMS renders on the server: any page request may be
the one that needs to renew.

:::note[The access token carries identity, not authority]
It says who you are. It does not say what you may do — grants are resolved per request from the
authorization data, so a role changed now takes effect within `grantCacheSeconds` rather than when
the token happens to expire.
:::

## Refreshing, and what happens if a token is stolen

Refresh tokens are **single-use**. Each refresh mints a new one and invalidates the one presented,
so a token that is used twice is evidence: either it was replayed, or a copy exists somewhere it
should not.

Tokens issued from one sign-in form a **family**, kept as its own signed object under
`.genoacms/security/sessions/`. Presenting an already-used token revokes the whole family — every
session descended from that sign-in — rather than the single token, because there is no way to tell
the thief's copy from yours.

:::caution[One deliberate exception]
The token immediately superseded stays acceptable for a few seconds. Without that window, a page
issuing several requests at once would refresh on the first and revoke itself on the second. The
window is short and applies only to the *previous* token, so a replay outside it is still detected.
:::

Signing out deletes the family, which is why it takes effect everywhere that sign-in reached.

## Every refresh asks the provider again

The session remembers which provider admitted it. Each time it refreshes, before a new access token
is issued, GenoaCMS asks **that** provider whether the subject still exists and may still sign in:

- the provider answers with the identity: the session continues, and the new token carries the email the provider returned, so an address changed there reaches the session at the next refresh;
- the provider no longer knows the subject, or it is disabled there: the session is revoked and the cookie cleared, and the user signs in again;
- the provider fails: the refresh fails, and the session is left as it is, to try again on the next request.

A session whose provider has been removed from the config ends at its next refresh. Deleting or
disabling a user in the identity platform therefore signs them out within `accessTokenMinutes`,
without touching GenoaCMS.

## Revocation is bounded, not instant

Two clocks decide how long a change takes to bite:

- **Removing a role or an assignment** takes effect within `grantCacheSeconds` (30 by default),
  because resolved grants are cached per subject for that long.
- **Revoking a session** stops refreshes immediately, but an access token already issued stays valid
  until it expires — at most `accessTokenMinutes`.

Both are set in `genoa.config` and then live in the signed security policy document; see
[configuration tiers](/guide/config/structure).

## When authorization data cannot be read

If `users.json` or `roles.json` is missing, or fails its signature check, GenoaCMS does not fall
back to letting people in. Sign-in resolves to **no grants at all** for everyone except the
principals `genoa.config` declares, which are resolved without reading storage.

That is the same state a brand-new instance is in, and it is deliberate: the way back in is a
declaration you control, not a gap in the checks.
