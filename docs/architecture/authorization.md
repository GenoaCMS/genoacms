---
type: architecture
title: Authorization in core
prefix: Z
codes: [ROL]
verified: 82c42e6c
---

# Authorization in core

## Design

### Role

How people with `config:roles:manage` compose roles in core: the roles screen at
`/configuration/iam` and its grant editor, which turns what an administrator switches on into the
grants a role stores.

```
/configuration (index card, gated) ─▶ /configuration/iam
                                        New role ─▶ dialog: name + grant editor ─▶ ?/createRole
                                        Edit     ─▶ dialog: grant editor ───────▶ ?/updateRole
                                        Delete   ─▶ confirmation ───────────────▶ ?/deleteRole
grant editor: rows ──(ROL-3)──▶ hidden field `grants` (JSON of Grant[])
```

Out of scope, and not yet specified: the grant model itself (permissions, resource selectors,
field selectors, the wildcard), how grants resolve into a principal's `AuthContext`, the
authorization manifests and their signatures, declared (Tier 1) against stored (Tier 2) roles,
accounts, agents and role assignment on the same screen, and the security policy. Today only the
code and `packages/core/src/lib/script/authorization/README.md` describe them.

### Decisions

| # | Decision | Where |
| :-- | :-- | :-- |
| ZU1 | 2026-11-01: this document starts with the roles screen only, so that the browser tests that check it carry statement IDs (RFC-0045). The rest of authorization is specified later, in its own RFCs. | ROL-1 to ROL-5 |

**ZD1. A grant row holds one permission over a set of resources (ROL-2, ROL-3).** A stored grant
carries one permission over one resource. The editor shows a row per permission, with a switch per
resource, and writes one grant per resource switched on.
*Why:* "this role may read these three buckets" is one decision. Three rows would repeat the
permission and have to be kept in step by hand.
*Cost:* a role opened for editing is regrouped into rows by permission and scope, so the order of
its stored grants is not kept.

**ZD2. A fresh row grants nothing until something is chosen (ROL-3).** It starts with no
permission, on named resources, with none switched on, and a collection switched on starts with no
fields.
*Why:* the wildcard and "every field" are the widest grants the editor can express. Defaulting to
them would make the widest grant the one reached by leaving a control alone.
*Cost:* an incomplete row is dropped silently from what is submitted.

**ZD3. A dialog's contents are mounted only while it is open (ROL-5).** The editor seeds its rows
from the role's stored grants each time its dialog opens.
*Why:* seeding once, at mount, kept showing the grants the editor was built with after a save had
reloaded the page data, so reopening looked unchanged until a refresh.
*Cost:* edits in a dialog closed without saving are lost.

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| ZF1 | *History.* **Every switch of the grant editor was inert.** Skeleton's `Switch` renders its visible parts as decoration and a visually hidden input as the control; without `Switch.HiddenInput` the switch renders, type-checks and passes every unit test, and cannot be clicked. Found by the Playwright suite in 2026-08. | fixed |
| ZF2 | *History.* **Reopening a role after a save showed the grants from before it (ZD3).** Found by the Playwright suite in 2026-08. | fixed |

### History

*History.* The roles screen and its grant editor date from 2026-08. Until 2026-11-01 only the code,
`authorization/README.md` and `packages/core/tests/grantEditor.spec.ts`, a Playwright suite that
ran nowhere (`build.md` F32), described them. RFC-0045 wrote ROL-1 to ROL-5 from the code and moved
that suite to `packages/core/e2e/`.

### Verification

- **`unit`.** The conversion between rows and grants (ROL-3) in
  `packages/core/src/routes/(admin)/configuration/iam/grantRows.test.ts`, the categories (ROL-2) in
  `grantCategories.test.ts`.
- **`e2e`.** `packages/core/e2e/configuration.test.ts` serves core built with `genoa.config/e2e.ts` and
  drives the screen in Chromium as an administrator. Most tests read the hidden `grants` field and
  submit nothing. The ones that save create a role of their own, named with the run's suffix, in the
  run's instance, which the run removes. The e2e config declares one bucket, so the case of several
  named resources in one row is checked on collections.

## Specification

### The roles screen

#### ROL-1 · The roles screen

`/configuration/iam` is titled `Roles and access`. The configuration index, `/configuration`,
shows a card `Roles and access` linking to it only to a principal holding `config:roles:manage`.
The screen lists each role as a card headed by its name. A role that can be administered has `Edit`
and `Delete`; one declared in the config, or any role while administration is locked, has neither
and is marked as declared. `New role` is offered to a holder of `config:roles:manage`.

- Test: `packages/core/e2e/configuration.test.ts`
- Level: e2e

#### ROL-2 · A grant row

A row chooses its permission in two steps: a category, as tabs, then a permission of that category
in a combobox with the placeholder `Select permission...`. The categories, in order, are
`Storage` (permissions starting `storage:`), `Database` (`db:`), `Content` (`pages:` and
`components:`, in the groups `Pages` and `Components`) and `Configuration` (`config:`). An option's
value is the permission; its label drops the leading segments every option of its group shares, and
reads `_` as a space. A row opens on the category of its permission, or on `Storage` when it has none.

A resource-scoped permission shows `Applies to`: a switch `Any <scope>` and, while it is off, one
switch per declared resource of the permission's scope, named by its id: the buckets of the config
for a bucket scope, its collections for a collection scope. For `db:collection:read` and
`db:collection:write`, each collection switched on shows its fields: a switch `Every field`, and
while it is off one switch per field of the collection's schema. An instance-scoped permission shows
no resource.

The editor holds a hidden form field `grants`, whose value is the JSON of the grants its rows
describe (ROL-3), and changes as the rows are edited.

- Test: `packages/core/e2e/configuration.test.ts`
- Level: e2e

#### ROL-3 · From rows to grants

A new row has no permission, `Any <scope>` off, no resource switched on, and no fields. The grants
of a set of rows are those of each row, in order:

```pseudo
grants(row):
  if row has no permission: return []
  if permission is instance-scoped: return [{ permission, resource: '*' }]
  if Any <scope> is on: return [{ permission, resource: '*' }]
  if no resource is on: return []
  if permission selects fields and some resource on has no field on and Every field off: return []
  for each resource on, in the order switched on:
    grant = { permission, resource: { scope: scope of permission, id: resource } }
    if permission selects fields and Every field is off for it: grant.fields = the fields on
    yield grant
```

Switching a collection on starts it with no field on and `Every field` off; switching it off drops
its fields. `Every field` on is recorded by the absence of `fields`.

Opening a role for editing turns its stored grants back into rows: grants sharing a permission and a
scope form one row, a grant over `*` forms a row of its own with `Any <scope>` on, and a role without
grants opens with one new row.

- Test: `packages/core/e2e/configuration.test.ts`
- Level: e2e

#### ROL-4 · Adding and removing rows

`Add grant` appends a new row. Each row's `Remove grant` removes it and its grants.

- Test: `packages/core/e2e/configuration.test.ts`
- Level: e2e

#### ROL-5 · Creating, editing and deleting a role

`New role` opens the dialog `New role`, with a name field and the grant editor seeded with one new
row; `Create` submits the form action `createRole` with the fields `name` and `grants`. A role's
`Edit` opens the dialog `Grants of <name>`, with the editor seeded from the role's stored grants
(ROL-3) each time it opens; `Save` submits `updateRole`. The dialog closes on success, and the page
data reloads. A dialog closed without submitting keeps nothing: reopening `New role` shows one new
row again. `Delete` asks `Delete the role "<name>". Anyone holding it loses what it granted.`; `Yes` submits
`deleteRole` with `name` and shows `Role deleted`, or `Role not deleted` with the reason, and `No`
submits nothing.

`createRole` and `updateRole` fail with 400 `{ reason: 'role/name-required' }` for a missing or
empty `name`, and with 400 `{ reason: 'role/grants-malformed' }` for a `grants` that is not a JSON
array of grants; `updateRole` replaces the role's grants with those submitted. `deleteRole` fails
with 400 `{ reason: 'role/name-required' }` for a missing `name`. A refusal by the authorization
service fails with 409 `{ reason }`.

- Test: `packages/core/e2e/configuration.test.ts`
- Level: e2e
