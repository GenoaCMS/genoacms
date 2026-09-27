# `@genoacms/adapter-secrets-env`

The GenoaCMS `secrets` service, backed by a file in `.env` syntax.

> ## ⚠ Development only
>
> This adapter keeps secrets **in plaintext in your project directory**. The file is written with
> owner-only permissions, but that is the whole of its protection: any process running as the same
> user can read it, it is trivially copied, and it offers no audit trail, no rotation support and no
> access control.
>
> It exists so that running GenoaCMS locally does not require a cloud account. **Do not use it in a
> deployment.** Use GCP Secret Manager, AWS Secrets Manager, Azure Key Vault or HashiCorp Vault —
> the service contract is the same, so only the configuration changes.

## Configuration

```ts
secrets: {
  providers: {
    local: secretsProvider('@genoacms/adapter-secrets-env', {})   // path defaults to .genoacms/secrets.env
  }
}
```

`path` is optional and relative to the project root. The default keeps the store out of the files
Vite watches, so a write does not restart the dev server under the request that made it.

Only one secrets provider may be configured — see the service reference for why.

## Behavior

- **Reads** consult, in order: this instance's own writes, then `process.env`, then the file, read
  fresh on every call. A real environment variable therefore beats the file, as with dotenv, but never
  hides a value this instance has written itself — which is what makes a key rotation take effect.
- **Writes** never touch `process.env`. They rewrite the file in place, preserving comments, ordering
  and unrelated entries, and are serialized internally: each write is a read-modify-write of the whole
  file, and two concurrent writes would otherwise drop one of the secrets.
- **Claims** (`setSecretIfAbsent`) are atomic across processes, guarded by an exclusive
  `<path>.lock` file. The in-process write queue is not sufficient: two `genoacms` processes share the
  file but not the queue. If a process is killed mid-claim the lock file survives — delete it.
- **Keys** must match `[A-Za-z_][A-Za-z0-9_]*` — the portable subset every secret manager accepts.
  An invalid key throws rather than being normalized, since folding `a-b` and `a_b` into one name
  would silently merge two distinct secrets.
- **Development only, enforced.** A production build refuses the adapter (`config/development-only`),
  and it throws when constructed without a project root, which is how it would meet a deployed
  artifact.

### Supported `.env` syntax

`KEY=value`, `export KEY=value`, single- and double-quoted values, `#` comments and blank lines
(both preserved when the file is rewritten).

**Values may not span multiple lines.** Nothing GenoaCMS stores needs them — keys and secrets are
base64 — and supporting them would make the line-oriented rewriting unsound.

## Keep the file out of version control

Add `.genoacms/` to your `.gitignore`; `genoa init` does it for you. If you set a `path` outside that
directory, ignore it yourself.
