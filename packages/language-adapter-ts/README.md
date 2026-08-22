# `@genoacms/language-adapter-ts`

The TypeScript implementation of GenoaCMS's `LanguageAdapter`: it reads a component's source to
learn what values the component accepts, and compiles that source into something a consumer can run.

It is registered in `genoa.config` like any other adapter, and a component records the language it
is written in, so the CMS resolves this adapter from the component rather than from a global
setting.

## What it does, and does not

`analyse` derives **attributes** — nothing else. It does not know a component's identity, the order
its attributes are displayed in, or its editing history; those belong to the CMS. Merging what comes
back into a stored entry, and preserving each attribute's uid so that pages keep working, happens
there.

Attribute types are read from the component function's **parameter type annotations**. The analyzer
reads a parameter's *resolved* type text, which is why component sources declare those types as
generic interfaces: a `type` alias resolves to its right-hand side and is no longer recognisable.

## It is the reference implementation of an unvalidated interface

The `LanguageAdapter` contract has exactly one implementation — this one. An interface with one
implementation has never met a language whose semantics differ, so expect the contract to move when
a second one is attempted, and read this package as the worked example rather than as proof the
abstraction holds.

Adding a language is not a shim: an adapter is a complete static analyser for that language — a
parser, the safety ruleset, and a compiler.
