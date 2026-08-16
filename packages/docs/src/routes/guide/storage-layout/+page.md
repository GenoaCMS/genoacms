---
title: What GenoaCMS stores
---

GenoaCMS keeps its own state in the **default bucket**, under a single `.genoacms/` prefix. This
page describes what appears there, so that an operator inspecting the bucket can tell expected
files from unexpected ones.

```
.genoacms/
├── keys/
│   └── public.json            registry of signing keys
├── security/
│   ├── policy.json            security settings
│   ├── roles.json             what each role may do
│   ├── users.json             who holds which roles
│   └── rejected/              documents that failed verification
└── components/                component definitions and revisions
```

:::caution[The default bucket should be private]
Everything above is internal state. `defaultBucket` should have no public read access — see the
[storage service](/guide/config/services).
:::

## Created at first start

An instance creates all of these the first time it starts, before serving anything. **Every one of
them is signed**, so there is no window in which GenoaCMS reads its own configuration or
authorization data without verifying it.

If the bucket is empty after a first run, the instance could not reach it or the secret store — the
startup log says which. GenoaCMS still starts in that state, deliberately, so the seed administrator
can sign in and repair it.

## The documents

### `keys/public.json`

The registry of signing keys: which key is current, and every key whose signatures still verify. It
is signed by the **root trust anchor**, and it is the one document a consumer SDK fetches — from the
root public key it has embedded plus this file, everything else follows.

Superseded keys stay listed, so rotating does not invalidate what earlier keys signed. Revoked keys
stay listed too, marked as revoked, so that a revocation is a published fact rather than an absence
someone has to notice.

### `security/policy.json`

Security settings an administrator can change at runtime — currently the subordinate key rotation
interval. Signed by the root, because it governs the signing keys themselves.

Its initial values come from the `security` stanza of `genoa.config`. Editing that stanza afterwards
does not change a running instance; this document is the live value.

### `security/roles.json` and `security/users.json`

What each role may do, and which roles each user holds. Signed by the current subordinate key.

Both are created **empty**. A new instance therefore grants nobody anything, and the seed
administrator — resolved from `genoa.config` alone, never from these files — signs in to build the
first roles.

### `security/rejected/`

**This directory only exists if something went wrong.** When a document fails verification, GenoaCMS
copies it here with a timestamp before replacing it, so the evidence survives:

```
.genoacms/security/rejected/roles-1755950000000.json
```

A file appearing here means the corresponding document could not be verified — because it was
edited outside GenoaCMS, corrupted, or signed by a key that has since been revoked. The instance
replaces it with an empty signed one and continues, which returns it to seed-administrator-only
until roles are rebuilt. The startup log names both paths.

:::note[Worth investigating, not deleting]
A rejected document is the only record of what was written. Read it before removing it — it is the
difference between "storage corrupted a file" and "someone edited our permissions".
:::

## After a key rotation

Subordinate keys rotate on an interval, so over time `keys/public.json` lists more keys than it
started with. That is expected. Documents signed by an earlier key keep verifying, because the key
remains listed.

Rotating the **root** is different and is never automatic — see
[the CLI](/guide/cli).
