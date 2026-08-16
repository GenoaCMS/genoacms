# `@genoacms/adapter-secrets-env`

The GenoaCMS `secrets` service, backed by a `.env` file.

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

```js
secrets: {
  providers: [
    {
      name: 'local',
      adapterPath: '@genoacms/adapter-secrets-env',
      adapter: import('@genoacms/adapter-secrets-env'),
      path: '.env'          // optional, relative to the working directory
    }
  ]
}
```

Only one secrets provider may be configured — see the service reference for why.

## Behaviour

- **Reads** take `process.env` first, falling back to the file. On load the adapter parses the file
  into `process.env` **without overriding variables that are already set**, so a real environment
  variable beats the file — the precedence dotenv uses, and what lets a deployment override a
  checked-out `.env`. The fallback matters because `process.env` is a snapshot taken at load: a key
  another process has written since would otherwise read as absent forever.
- **Writes** rewrite the file in place, preserving comments, ordering and unrelated entries. They are
  serialised internally, because each write is a read-modify-write of the whole file and two
  concurrent writes would otherwise drop one of the secrets.
- **Claims** (`setSecretIfAbsent`) are atomic across processes, guarded by an exclusive `.env.lock`
  file. The in-process write queue is not sufficient: two `genoacms` processes share the file but
  not the queue. If a process is killed mid-claim the lock file survives — delete it.
- **Keys** must match `[A-Za-z_][A-Za-z0-9_]*` — the portable subset every secret manager accepts.
  An invalid key throws rather than being normalised, since folding `a-b` and `a_b` into one name
  would silently merge two distinct secrets.

### Supported `.env` syntax

`KEY=value`, `export KEY=value`, single- and double-quoted values, `#` comments and blank lines
(both preserved when the file is rewritten).

**Values may not span multiple lines.** Nothing GenoaCMS stores needs them — keys and secrets are
base64 — and supporting them would make the line-oriented rewriting unsound.

## Keep the file out of version control

The repository's `.gitignore` already covers `.env` and `.env.*`. If you use a `path` outside those
patterns, add it yourself.
