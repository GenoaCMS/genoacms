---
title: Adding a language
---

Components written in the CMS are authored in some language, checked against that language's safety
rules, and compiled into something a consumer can run. All three are language-specific, and none of
them is a cloud service — so they plug in through a **`LanguageAdapter`** rather than through
`@genoacms/cloudabstraction`.

An adapter is registered in `genoa.config` like any other, and a component records which language it
is written in, so the CMS resolves the adapter **from the component** rather than from a global
setting. Two languages can coexist in one instance.

:::caution[A designed extension point, not a validated one]
**Exactly one implementation exists** — `@genoacms/language-adapter-ts`. An interface with one
implementation has never met a language whose semantics differ, and such interfaces are routinely
wrong in ways that surface only when the second is attempted.

Treat this as a design to be tested by the next implementer rather than a settled contract, and
expect it to move when it meets a language without structural typing, or without a text-based
compilation target.
:::

## What an author writes, and what the adapter does

An author writes a component's **body**. Everything around it — the entry function, its parameters,
their types and their order — is emitted from the component's header, which is authored in the
registrar.

So an adapter is handed two things and assembles them itself:

```ts
interface SourceRequest {
  body: string           // what the author wrote. Not a whole module.
  shape: ComponentShape  // the parameters, in the order a consumer calls them
}

interface ComponentShape {
  attributes: ComponentHeaderAttributes
  attributeOrder: AttributeReference[]
}
```

**The order is the contract.** A consumer calls a component positionally, so an adapter that emitted
parameters in any other order would produce a component that runs and is wrong — every value landing
in the wrong parameter, with nothing failing to say so.

## The four methods

```ts
interface LanguageAdapter {
  readonly language: string
  readonly platforms: readonly ExecutablePlatform[]

  analyze: (request: AnalysisRequest) => Promise<AnalysisResult> | AnalysisResult
  emitSignature: (shape: ComponentShape) => Promise<SignaturePreview> | SignaturePreview
  compileBundle: (request: CompilationRequest) => Promise<CompilationResult> | CompilationResult
}
```

### `analyze`

Checks what the author wrote against the language's safety rules. Runs when a component is
published, behind a human action, and **must not reach the network or the file system** — everything
it needs is in the request.

```ts
interface AnalysisResult {
  diagnostics: Diagnostic[]
}
```

A `fatal` diagnostic stops the publication; a `warning` is reported and does not.

:::caution[`analyze` does not report what a component accepts]
An earlier contract had it **derive** a component's attributes by reading the source. That is gone. A
component's shape is authored in the registrar — identically for a component whose code lives in the
consuming application and one written here — so there is nothing to discover, and an adapter
reporting attributes would be reporting back what it had just been handed.

What went with it was a live hazard, not merely redundant work: re-derivation produced fresh
attributes on every publication, which had to be rematched to the stored ones **by parameter name**
to preserve each attribute's uid. A page node holds that uid, so a match that failed detached every
page using the attribute — silently.
:::

### `emitSignature`

Writes out the declaration a body will be wrapped in, so an author can read it.

The editor shows a body and nothing else. Without this, an author writes against parameters that
nothing on screen names, inferring the list from the registrar and guessing how each attribute's name
became an identifier.

It comes from the adapter rather than the CMS for the same reason assembly does: the syntax, the type
each attribute becomes, and the name each is given are facts about the target language. **A preview
the CMS composed would be a second implementation of the emitter**, free to drift from the one that
actually compiles — exactly the defect emitting the signature exists to remove.

It must produce exactly what `analyze` and `compileBundle` assemble around, or it is a lie an author
writes code against.

### `compileBundle`

Assembles the body into an entry function and compiles it for one platform.

```ts
interface CompilationResult {
  executableCode?: string   // absent when compilation failed
  diagnostics: Diagnostic[]
}
```

Called only after an analysis with no fatal diagnostic. **Producing no `executableCode` is a failure
and must carry a diagnostic saying why** — an empty result with nothing to explain it reads as
"nothing to do", and would publish an empty artifact.

The compiled bundle's entry point is a **default export**, which is what the SDK calls.

## Diagnostics are in the author's coordinates

```ts
interface Diagnostic {
  severity: 'fatal' | 'warning'
  rule: string      // stable identifier, so it can be cited and suppressed
  message: string   // what is wrong, in the author's terms
  line?: number     // 1-based, as editors count and people read
  column?: number
}
```

An adapter emits a prologue of its own choosing, so a fault the author sees on line 3 of their body
is somewhere else entirely in what was compiled. **The adapter is the only thing that knows the
difference**, so it maps positions back before returning — and drops anything falling inside its own
prologue, which is code the author did not write and cannot fix.

The CMS never sees the assembled source and never computes a position in it.

`line` and `column` are optional in the type and not in practice: a diagnostic an author cannot
locate is a refusal without a reason, and the commit it blocks is then a guess.

## Registering one

```js
// genoa.config
languageAdapters: {
  typescript: {
    module: '@genoacms/language-adapter-ts',
    import: import('@genoacms/language-adapter-ts')
  }
}
```

The same shape every other adapter uses: a module path, and a dynamic import of it. The import is a
promise because the config declares it with `import(...)` rather than loading it, so nothing is
pulled in until something asks for that language.

## How much work this is

Adding a language is **not a shim**. An adapter emits that language's syntax for a component's
parameters, applies a safety ruleset to the result, and compiles it — a parser, the rules, and a
compiler.

That is a different order of work from porting the **verifier**, which contains no analysis at all
and is what
[the verification specification](/reference/sdk/documents/) describes. A second-language *consumer*
is a weekend; a second-language *adapter* is not.
