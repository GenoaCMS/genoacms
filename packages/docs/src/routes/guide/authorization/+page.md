---
title: Roles and permissions
---

GenoaCMS decides what a signed-in user may do from **roles**. A role is a named set of grants; a user
holds roles; a grant names a permission and the resource it applies to.

Authorization is **not a service**: there is no provider to register and no adapter behind it. It is a
core module of GenoaCMS, and its data lives in your own bucket. Only *who your users are* is
delegated — to the [authentication service](/guide/config/services), because *"who are you?"* is a
standardised question in a way that *"what may you do here?"* is not.

## Permissions

Twenty-three, in four domains. Permission names are fixed: you compose roles from them, you cannot
invent one.

| Permission | Scope |
| :--- | :--- |
| `storage:bucket:read` | a bucket |
| `storage:bucket:write` | a bucket |
| `storage:bucket:delete` | a bucket |
| `db:collection:read` | a collection |
| `db:collection:write` | a collection |
| `db:collection:delete` | a collection |
| `db:collection:schema` | a collection |
| `components:prebuilt:read` | instance |
| `components:prebuilt:register` | instance |
| `components:prebuilt:modify` | instance |
| `components:dynamic:view_code` | instance |
| `components:dynamic:edit` | instance |
| `components:dynamic:commit` | instance |
| `pages:read` | instance |
| `pages:content_edit` | instance |
| `pages:structure_edit` | instance |
| `pages:publish` | instance |
| `pages:delete` | instance |
| `config:users:manage` | instance |
| `config:roles:manage` | instance |
| `config:keys:manage` | instance |
| `config:security:manage` | instance |
| `config:adapters:manage` | instance |

A few are worth reading twice:

- **`pages:content_edit` and `pages:structure_edit` are different jobs.** Editing the text in a
  component is content; adding, removing or rearranging components is structure. A copywriter needs
  the first and not the second.
- **A move is a write, not a delete.** Renaming or relocating an object needs `storage:bucket:write`.
  `storage:bucket:delete` is only for destroying things.
- **Removing a prebuilt component needs `components:prebuilt:register`**, not `modify`. Removal is
  the inverse of registration, so a role meant to adjust a component's attributes cannot destroy one
  that pages depend on.

:::caution[`config:roles:manage` is full authority]
Whoever can administer roles can create a role holding every permission and assign it to themselves.
No barrier against that is attempted, because a partial one would be worse than an honest statement:
grant this permission as narrowly as you would grant `components:dynamic:commit`.
:::

## Scopes

Instance-scoped permissions apply everywhere. Bucket- and collection-scoped permissions name **which
one**:

```ts
// read the media bucket, and only that one
{ permission: 'storage:bucket:read', resource: { scope: 'bucket', id: 'media' } }

// read every collection
{ permission: 'db:collection:read', resource: '*' }
```

The scope is part of the match, not decoration: a grant on the `media` *bucket* does not match a
`media` *collection*.

## Declaring roles in `genoa.config`

Roles and assignments declared in configuration are **authoritative**. A new instance needs at least
one assignment, or nobody can administer it:

```ts
security: {
  roles: {
    Administrator: [{ permission: '*', resource: '*' }],
    Copywriter: [
      { permission: 'pages:read', resource: '*' },
      { permission: 'pages:content_edit', resource: '*' }
    ]
  },
  assignments: {
    'a1b2c3d4-...': ['Administrator']
  }
}
```

The key in `assignments` is the **subject** — the provider-issued identifier your authentication
provider returns, never an email address. Email addresses change hands; a subject is the stable
identity a permission decision can rest on.

What configuration declares cannot be changed from inside the CMS:

- Editing or deleting a declared role or assignment is **refused**, not quietly undone later.
- Deleting a declaration **removes it from the instance**, and revokes the access it granted. It does
  not leave an editable copy behind.
- Runtime administration is still free to create roles and assignments configuration does not name.

Set `lockRoles: true` to disable runtime administration altogether.

:::note[This is also the way back in]
Declarations are resolved **without reading the bucket**. If your authorization documents are
missing, or fail their signature check, the administrators named in `genoa.config` can still sign in
and repair the instance — and nobody else can.
:::

## What happens when something is wrong

GenoaCMS fails closed. Every one of these grants nothing:

| Situation | Result |
| :--- | :--- |
| A user holds no roles | Signed in, denied everything |
| A role names a permission that no longer exists | That grant matches nothing; the rest of the role still applies |
| A user names a role that no longer exists | That role contributes nothing; the rest still apply |
| `roles.json` or `users.json` fails verification | Quarantined and replaced with an empty one; only declared administrators can act |
| The bucket is unreachable | No stored authority resolves; only declared administrators can act |

There is no setting that relaxes this, and no state in which an unreadable manifest results in more
access rather than less.

A rejected document is copied to `.genoacms/security/rejected/` before being replaced — see
[what GenoaCMS stores](/guide/storage-layout). Read it before deleting it: it is the difference
between a corrupted file and someone editing your permissions.

## Where enforcement happens

Every permission is checked in the **service layer**, next to the operation it protects — not in the
page that calls it. Hiding a button is presentation; the denial underneath it is the control. An
interface that forgets to hide something is untidy, not insecure.

Grants are resolved per request and cached briefly, so removing a role takes effect within
`grantCacheSeconds` rather than when the user's session ends.
