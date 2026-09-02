# `@genoacms/language-adapter-ts`

The TypeScript implementation of GenoaCMS's `LanguageAdapter`: it wraps a component's body in an
entry function emitted from the component's header, checks the result, and compiles it into
something a consumer can run.

It is registered in `genoa.config` like any other adapter, and a component records the language it
is written in, so the CMS resolves this adapter from the component rather than from a global
setting.

## What it does, and does not

It is handed the author's **body** and the component's **shape** — the parameters and the order a
consumer calls them in — and assembles the two itself. `assemble` is the one function behind all
three methods, so the signature an author reads, the source that is analyzed, and the source that is
compiled cannot drift apart.

`analyze` returns **diagnostics and nothing else**. It does not report what a component accepts: the
shape is authored in the registrar and passed in, so there is nothing to discover, and reporting
attributes would be reporting back what it had just been handed.

The diagnostics it returns today are those of assembly and compilation. The safety ruleset that will
fill this in arrives later; the seam exists so that it has somewhere to land.

:::note
An earlier version of this adapter **derived** attributes by reading parameter type annotations.
That is gone, and the removal fixed a live hazard rather than merely redundant work: re-derivation
produced fresh attributes on every publication, which had to be rematched to the stored ones by
parameter name to preserve each attribute's uid — and a page node holds that uid, so a match that
failed detached every page using the attribute, silently.
:::

## It is the reference implementation of an unvalidated interface

The `LanguageAdapter` contract has exactly one implementation — this one. An interface with one
implementation has never met a language whose semantics differ, so expect the contract to move when
a second one is attempted, and read this package as the worked example rather than as proof the
abstraction holds.

Adding a language is not a shim: an adapter is a complete static analyzer for that language — a
parser, the safety ruleset, and a compiler.
