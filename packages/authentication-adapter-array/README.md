# `@genoacms/authentication-adapter-array`

The GenoaCMS `authentication` service from a fixed list of users. The list is one JSON value, held
as a secret.

It suits an instance with a few administrators that rarely change. The passwords are stored and
compared **as plaintext**, and the list is read once per server process, so for anything more use
an identity provider, such as `@genoacms/adapter-gcp/authentication/identity-platform`.

## Configuration

```ts
import { defineConfig, authenticationProvider, secret } from '@genoacms/config'
import type {} from '@genoacms/authentication-adapter-array'   // registers the adapter's option types; erased at runtime

export default defineConfig({
  authentication: {
    cookieName: '__session',
    providers: {
      array: authenticationProvider('@genoacms/authentication-adapter-array', {
        credentials: secret('GENOACMS_ADMIN_CREDENTIALS')
      })
    }
  },
  // … the other services …
})
```

| Option | Type | Meaning |
| :-- | :-- | :-- |
| `credentials` | `secret()`, `env()` or `inline()`, holding a JSON array | The users. Required. |

A bare array is refused when the config loads, because it would be written into the build. Use
`secret()` to read it from the configured secrets store, `env()` to read it from an environment
variable, or `inline()` only where writing it into the build is acceptable, such as a test.

The secret holds one line of JSON:

```json
[{ "subject": "admin-1", "email": "admin@example.com", "password": "a long random password" }]
```

| Field | Meaning |
| :-- | :-- |
| `subject` | The user's stable identifier. Sessions and role assignments refer to it, so keep it when the email changes. Required. |
| `email` | What the user signs in with. Not checked: an entry without one can never sign in. |
| `password` | The password, as plaintext. Required. |

The list is checked when the provider is first constructed, at the CMS's first use of
authentication. An entry without a `subject` fails with
`authentication/missing-subject: at index <indexes>`, one without a string `password` with
`authentication/missing-password: at index <indexes>`, and a value that is not an array with
`authentication/missing-credentials`.

## Behavior

- **Sign-in** finds the entry with the given email and accepts it when the password matches. A
  wrong email and a wrong password give the same answer, `credentials`.
- **Session refresh** looks the user up by `subject`. The list is read once, when the server process
  first uses authentication, so a change to the secret, removing a user included, takes effect only
  after every running instance restarts or is redeployed. From then on, a removed user's sessions end
  at their next refresh.
- **Roles** are assigned in the config's `authorization.assignments`, keyed by subject; the adapter
  knows nothing of them.

With `@genoacms/adapter-secrets-env` in development, put the line in `.genoacms/secrets.env` as
`GENOACMS_ADMIN_CREDENTIALS=<json>`; `genoa init` writes a config that reads it from there.
