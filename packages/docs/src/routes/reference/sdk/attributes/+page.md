---
title: The attribute vocabulary
---

An **attribute** is one value a component accepts. This page is the vocabulary: what an attribute
declares, what a value may be, and which of it a consumer is expected to read.

It is a contract **between three packages** — a language adapter emits these shapes by reading a
component's source, the CMS validates, stores and signs them, and a client SDK reads them to render.
That is why it is defined once, in `@genoacms/internal`, rather than in any one of them.

## An attribute is a meta-schema

```ts
interface Attribute {
  uid: string        // stable identity, preserved across re-analysis
  name: string       // derived from the component's parameter name
  type: AttributeType
  schema: MetaSchema // everything about the value, in JSON Schema terms
}
```

Everything about the value lives **inside `schema`, and nothing beside it**. Earlier revisions
carried flat siblings — a `maxLength` next to `schema.maxLength`, a `maxComponents` next to
`maxItems` — which is two places for one fact.

:::caution[Inside a signed payload, two places for one fact is a correctness hazard]
The two can disagree, and the signature attests to both. There is then no way to say which one the
publisher meant.
:::

## An unset constraint is an absent key

Optional constraints are **omitted** when unset — never `null`, never `undefined`, never an empty
value.

Payloads are signed over their RFC 8785 canonical form, and `{"minimum":null}` and `{}` canonicalize
to different bytes. Two producers disagreeing about which to write make the same component sign two
ways, and neither signature is wrong.

## The types

| `type` | Value in a page's `data` | Schema |
| :--- | :--- | :--- |
| `boolean` | `boolean` | `BooleanMetaSchema` |
| `number` | `number` | `NumberMetaSchema` |
| `string` | `string` | `StringMetaSchema` |
| `text` | `string` | `StringMetaSchema` |
| `markdown` | `string` | `StringMetaSchema` |
| `richText` | `string` | `StringMetaSchema` |
| `link` | `string[]` | `LinksMetaSchema` |
| `storageResource` | `string[]` | `StorageResourcesMetaSchema` |
| `components` | `ReadablePageNode[]` | `ComponentsAttributeMetaSchema` |

`string`, `text`, `markdown` and `richText` share one schema and differ in how the CMS **edits**
them — a single line, a textarea, a markdown editor, a rich-text editor. To a consumer all four
arrive as a string, and what differs is what is inside it.

Every schema carries `title`, `description` and `required`.

### `title` is the name a page's data is keyed by

This is the field that matters most to a consumer, and it is easy to miss.

```js
node.data[publication.attributes[uid].schema.title]
```

Not `attribute.name`, which is the component's *parameter* name. `attributeNames(publication)`
resolves this for you, in parameter order, and `resolvePage` goes further and hands back the values
themselves already ordered.

### Numbers

```ts
interface NumberMetaSchema {
  type: 'number'
  title: string
  description: string
  minimum?: number
  maximum?: number
  multipleOf?: number
  decimalPlaces?: number
  required: boolean
  default?: number
}
```

`decimalPlaces` is a **non-standard keyword, kept deliberately**. It is not a duplicate of
`multipleOf`: that constrains the *value*, while this is display precision. A component may accept
any real number and still wish to render two decimals, so a step of `0.01` and a precision of `2` are
different statements that can legitimately disagree. Deriving one from the other would silently
change rendering for any component that set a step without a precision.

JSON Schema permits unknown keywords and JCS canonicalizes any JSON, so nothing downstream is harmed.

### Strings

```ts
interface StringMetaSchema {
  type: 'string'
  title: string
  description: string
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: string
  required: boolean
  default?: string
}
```

### Links

A link is either external or internal, and the discriminant is explicit:

```ts
type LinkAttributeValue =
  | { isExternal: true, url: string }
  | { isExternal: false, pageName: string }
```

Stated rather than inferred from which field is present, so a link with neither is malformed rather
than quietly external.

### Storage resources

```ts
interface StorageResourceValue {
  bucket: string
  name: string
}
```

Declared structurally rather than imported from `@genoacms/cloudabstraction`, which depends on this
package — importing back would be a cycle.

### Components

A slot. The value in a page's `data` is an **array of nested page nodes**, each with its own pin, and
the SDK resolves them depth first: a parent is handed its slot already rendered.

```ts
interface ComponentsAttributeMetaSchema {
  type: 'array'
  title: string
  description: string
  items: { type: 'string', enum?: string[] }
  default?: string[]
  minItems?: number
  maxItems?: number
  required: boolean
}
```

`items.enum`, when present, is the set of component names this slot accepts.

## What a consumer is expected to read, and what it is not

A consumer reads each attribute's **name** — and, if it wants to describe the component in its own
interface, `title` and `description`.

It is **not** expected to re-check constraints. `minLength`, `maximum`, `pattern` and the rest are
the CMS's validation vocabulary, enforced when a value is authored. A renderer receives values that
have already been resolved, and re-checking a constraint the CMS enforced would be a second opinion
nobody asked for — one that would reject a page for a rule that changed after it was published.

The SDK reflects this: `readPublication` reads attributes only far enough to find their names, and
passes over everything else.

## Attributes and renaming

`uid` is what survives a rename: re-analysing a component keeps the uid, so pages that already store
values under the old arrangement keep working.

The **name** is what a page's data is keyed by, which is why the CMS refuses to register two
attributes with the same name. `attributeNames` enforces the same rule at read time and refuses a
publication with a duplicate name, an attribute with no name, or an `attributeOrder` entry naming an
attribute that is not described.
