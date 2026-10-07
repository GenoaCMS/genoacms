---
title: Configuration
---

GenoaCMS is configured in two places, and the difference between them matters more than the shape of
either. This page covers both, and where each setting belongs.

## The two tiers

**Tier 1 is `genoa.config`** — a JS file in your source repository, read at build and boot. It
declares adapters and credentials, and it may declare anything Tier 2 can.

**Tier 2 is a set of signed documents in your primary bucket**, changed at runtime through the CMS
by administrators who hold the governing permission.

| | Tier 1 — `genoa.config` | Tier 2 — signed documents |
| :--- | :--- | :--- |
| Lives in | your repository | `.genoacms/` in the primary bucket |
| Changed by | a deployment | an administrator, at runtime |
| Holds | adapters, credentials, `authorization`, `security` seeds | roles, accounts, security policy |
| Authority | **authoritative** | may add, may not override |

Three rules follow, and they are the whole model:

1. **Anything settable in Tier 2 is settable in Tier 1.** The tiers are not two vocabularies split
   by subject matter. Tier 2 exists so that what was *not* decided before deployment can still be
   administered afterwards.
2. **A Tier-1 declaration is immutable at runtime.** Where `genoa.config` declares something, the
   CMS refuses to change it — refuses at the moment of the attempt, rather than reverting it later.
   A refusal can be answered; a silent revert after the next deployment cannot.
3. **Authority is a floor, not a ceiling.** Tier 2 stays free to create what Tier 1 has not named.

:::note[Adapters are Tier 1 only]
There is no runtime vocabulary for adapters, buckets or credentials. Nothing in the bucket can
change where the CMS stores things or which provider it talks to.
:::

### Declarations, and seeds

Tier 1 holds two kinds of setting with opposite lifetimes, and they live in **two stanzas** so the
shape of the file says which is which:

- **`authorization`** — `roles`, `assignments`, `lockRoles` — is authority. It is re-read on every
  resolution, merged over stored state rather than written into it, and deleting a line *removes*
  what it granted.
- **`security`** — `accessTokenMinutes`, `refreshTokenDays`, `grantCacheSeconds`,
  `subordinateKeyRotationDays`, `maxFuel`, `maxDepth`, `maxAllocation`, `fetchOrigins` — supplies the
  values a new instance starts from. After first start
  the live values live in the signed security policy document, and editing `genoa.config` no longer
  moves them.

`lockRoles` sits with the declarations because it governs exactly them: whether what `authorization`
declares may be added to at runtime.

## What is *not* a service

GenoaCMS delegates cloud concerns to adapters: authentication, database, deployment, secrets and
storage. **Authorization is not among them.** It is a core module, its data lives in your own bucket,
and there is no provider to register or adapter to choose.

Only *"who are you?"* is delegated, because it is a standardized question with interchangeable
answers. *"What may you do here?"* is not: permissions are defined over GenoaCMS's own resources —
buckets, collections, components, pages — which no external system can enumerate or evaluate. See
[roles and permissions](/guide/authorization).

## One file per environment

A project keeps its configuration in one directory, `genoa.config/`:

```text
genoa.config/
├── development.ts     the config genoa dev finds on its own
├── production.ts      named on the command line, always
├── collections.ts     modules both configs import
├── authorization.ts
├── security.ts
└── languages.ts
```

`genoa init` writes exactly this layout. Each environment gets its own complete config rather than a
base with overrides, so what runs in production is what `production.ts` says, read top to bottom.

A project with a single config may use one root file, `genoa.config.ts`, instead of the directory.

### Which file is read

Without `--config`, GenoaCMS looks for, in order:

1. `genoa.config.ts`, `.mts`, `.js` or `.mjs` at the project root;
2. `genoa.config/development.ts`, `.mts`, `.js` or `.mjs`.

`genoa.config/index.*` is not looked up. **A production config is never found by default**: it is
always named, as in `genoa deploy --config genoa.config/production.ts`. A production build of the
development config fails on its development-only secrets store, and the CLI then says which file it
loaded and how to name the production one.

## Config is data

A config file default-exports a plain object. It may import anything that evaluates to data — shared
modules, JSON, constants — and is evaluated once, when the CLI or the dev server loads it.

Adapters are **named, never imported**. A provider entry says which adapter by its package specifier,
as a string, and GenoaCMS loads the adapter itself: an SDK-free descriptor while building, the runtime
only where it runs. The `import type {}` lines at the top of a config load nothing at runtime; they
register each adapter's option types, so a misspelled option is a type error in your editor.

`defineConfig` returns its argument unchanged. It exists so TypeScript can infer the provider names
and check every reference to them; see [providers](/guide/config/providers).

## A complete config

The self-hosted example, one of the [example configs](/guide/config/examples):

@include ../../../../../../core/genoa.config/self-hosted.ts

Every stanza is described under [services](/guide/config/services), and every `secret()` under
[secrets](/guide/config/secrets).

A new instance needs at least one assignment in `authorization`, or nobody can administer it. The key
is a **subject**, not an email address — see [identity and sessions](/guide/sessions).
