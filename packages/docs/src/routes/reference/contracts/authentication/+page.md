---
title: Authentication contract
---

Authentication answers *"who are you?"*. It is a delegable question, so it is served by adapters;
*"what may you do?"* is not, and has none — see [adapters](/guide/adapters).

## Identity and rejection

@include ../../../../../../contracts/src/authentication/types.d.ts

`subject` is a stable, provider-issued identifier, and the **only** value that takes part in an
authorization decision. `email` is shown to the user and carried in the session: addresses change
hands, and a recycled address must not inherit its previous holder's permissions.

## Adapter

@include ../../../../../../contracts/src/authentication/adapter.d.ts

- `authenticate` returns the `Identity` the credentials belong to, or a `Rejection`. `credentials` covers an unknown email and a wrong password alike, and is the reason whenever the adapter cannot tell. `disabled` and `second-factor-required` are reported only when the password is known to be right.
- `getIdentity` returns the `Identity` of a subject that exists and could sign in now, with its current email, and `null` for one that is unknown, deleted or disabled. GenoaCMS calls it on every session refresh.
- An adapter that **cannot decide** — its service failed, refused to answer, or is misconfigured — throws an `Error` whose message starts with `authentication/`, such as `authentication/provider-failed: …`. A throttled service throws `authentication/throttled…`. A failure is never reported as a `Rejection`, or as `null`.

How GenoaCMS combines several providers is under [identity and sessions](/guide/sessions).

@include ../../../../../../contracts/src/authentication/index.d.ts

`runAuthenticationConformance` in `@genoacms/conformance` checks an adapter against this contract.
