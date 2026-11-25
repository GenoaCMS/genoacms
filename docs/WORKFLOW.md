---
type: workflow
version: 5.0.0
---

# Spec Workflow

A development workflow for projects built mostly by coding agents. **People review
specifications. Agents write code. Tests connect the two.**

This file is the canonical definition. A project keeps a verbatim copy at `docs/WORKFLOW.md`, and
that copy governs the project. The tools in `docs/tools/` enforce what can be checked mechanically
(§9).

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT** and **MAY** are to be interpreted as
described in RFC 2119 and RFC 8174 when, and only when, they appear in capitals.

## 1. Principles

1. **The pipeline is one-directional.** Every change in behavior goes reality → architecture
   documents → RFCs → code. It is never reversed or skipped. A change that alters no behavior goes
   straight to code (§8.1).
2. **Reproducibility.** The Specification parts of a project's architecture documents MUST be enough
   for a competent agent or human, **with no access to the code**, to rebuild the system
   functionally. Everything observable from outside a component belongs there: contracts and the
   types that cross them, data formats and persisted layouts, protocols and the external APIs used,
   error codes and messages, security invariants, configuration surfaces and defaults, and the
   reasons behind non-obvious choices. Internal structure that does not change behavior does not.
3. **Review the specification, verify with tests.** The author does not need to read code. The
   author reviews the Specification diff and the RFC's description of what each test asserts.
   Every link between that text and the code is checked either mechanically or by an agent that did
   not write the code (§6.3).
4. **Architecture documents hold the current state. RFCs are history.** An RFC is a planned change.
   Once implemented and audited, it is frozen, and every behavior-relevant detail it introduced lives
   in a Specification.
5. **Discovery rule.** When implementation meets a reality the documents did not foresee, the agent
   stops. The architecture document and the RFC are corrected first. The agent never writes an ad-hoc
   workaround.
6. **Drift audits.** Periodically, and before a component is changed, an agent compares the code
   against its Specification and records every mismatch as a finding. Neither side is silently
   corrected toward the other: each mismatch is the author's decision.

## 2. Roles

| Part | Owner | Agents |
| :-- | :-- | :-- |
| Architecture document, **Design** | the author: decisions, rationale | challenge assumptions, find gaps and edge cases, check against reality, draft for review |
| Architecture document, **Specification** | the author reviews | write and maintain |
| RFC | collaborative; the author reviews its test descriptions | elaborate in full technical detail under the author's guidance |
| Tests | — | written from the Specification and the RFC, SHOULD be by an agent that has not seen the implementation (§8.2) |
| Code | — | implement RFCs exactly as written |
| Falsification and scenario audits | — | an agent that did not write the code, before the RFC is implemented (§6.3, §8.2) |

An agent that needs a decision of the author asks the author and waits for the answer. It does not
write the question into a document, and does not commit it. The answer goes into the document with
the change it belongs to. An `Open questions` row (§5.3) records only a question the author chooses
to leave open.

## 3. Repository layout

```
docs/
  README.md                  index: the system, placement and testing diagrams, documents, ID prefixes, coverage, glossary, workflow version
  MAP.md                     generated views of the use cases, statements and scenarios (§5.7), optional
  WORKFLOW.md                verbatim copy of this file
  templates/                 skeletons for every document type, and worked examples
  tools/check-docs.mjs       the documentation checker
  tools/check-results.mjs    the test results checker
  tools/check-release.mjs    the release checker
  tools/record.mjs           writes the verification record
  tools/review.mjs           writes the review page, and records the author's review (§5.6)
  tools/map.mjs              writes MAP.md (§5.7)
  architecture/
    <subject>.md             a subject small enough for one file
    <subject>/README.md      or a directory: an index document …
    <subject>/<component>.md … and one document per component
  rfcs/
    README.md                the list of RFCs, in implementation order
    NNNN-<slug>.md           one RFC per file
```

A repository that holds several projects, such as the packages of a monorepo, MAY keep each
project's documents apart, in `docs/<project>/architecture/` and `docs/<project>/rfcs/`, beside the
shared `README.md`, `WORKFLOW.md`, `templates/` and `tools/`. Each RFC directory has its own
`README.md`, the list of its RFCs. RFC numbers are one sequence across every RFC directory, so
`RFC-NNNN` names one RFC in the whole repository. Prefixes and statement codes are unique across the
repository too.

`docs/` is at the repository root. The documentation checker runs from the repository root with
`node docs/tools/check-docs.mjs docs`, before every commit that touches `docs/`, and in CI. The
results checker runs in CI after the tests (§9).

## 4. Front matter

Every document starts with front matter: `---` lines around `key: value` pairs. Lists are written
`[a, b]`; an item containing a comma is quoted, `["a, b", c]`. Unknown keys are errors.

| `type` | Keys |
| :-- | :-- |
| `docs-index` | `workflow`: the version of this file that the project follows; `levels`: the test levels of the project, such as `[unit, integration, e2e]` (§6.2); `sources`: the directories, from the repository root, whose files are checked for references (§6.4); `audit-from`: the number of the first RFC whose `audit` is required (§8.2); `scenario-levels`, required: the levels whose statements scenarios name, `[]` for none (§5.4); `prefix`: the ID prefix of the flows across documents under `## Flows` (§5.4) |
| `architecture` | `title`; `prefix`: the ID prefix, unique in the project; `codes`: statement codes, unique in the project; `verified`: the commit at which the *current* text was last checked against the code; `conforms`: `false` only for a document written before the project adopted the workflow; `reviewed`: the commit at which the author last reviewed the document (§5.6) |
| `architecture-index` | the same keys as `architecture`. The directory's documents share its `prefix` and its register. |
| `rfc-index` | none: the list of the RFCs in its directory, `rfcs/README.md` |
| `map` | none: `MAP.md`, written by `map.mjs` (§5.7) |
| `rfc` | `number`; `title`; `status`: `draft`, `auditing`, `implemented` or `withdrawn` (§8.2); `commits`: the implementing commits, required when `auditing` or `implemented`; `audit`: the Verification entries that record its falsification audits, required when `implemented` (§8.2); `depends`: RFC numbers; `architecture`: the documents it changes; `commit-subject`: the commit message subject; `sections`: `legacy` only for an RFC written before the project adopted the workflow; `changes`: the kind of each statement change it makes, `[SEC-4 breaking, SEC-2 editorial]` (§11.3) |

A document in a directory (`architecture/<subject>/<component>.md`) takes `prefix` from its index
and declares only `title`, `codes` and `verified`.

## 5. Architecture documents

### 5.1 Structure

A conforming architecture document has exactly one `#` title and two `##` parts, in this order:
`## Design` and `## Specification`.

**Design** has `###` sections. The required ones appear in this order, and other sections MAY stand
between them:

| Document type | Required Design sections |
| :-- | :-- |
| `architecture` | `Role`, `Decisions`, `Findings`, `History`, `Verification` |
| `architecture-index` | `Overview`, `Documents`, `Decisions`, `History`, `Register` |

A required section with nothing to say contains `None.` A component that actors use directly MAY add
`Use cases` and `Scenarios` after `Role` (§5.4).

**Specification** has `###` groups of `####` statements (§6). An index document without shared
statements contains `None.`

An architecture document holds no critique. A design decision states its trade-off in its
*Why:* and *Cost:* lines (§5.3). The critique of a change lives in its RFC (§8.1). A change to an
architecture document without an RFC, such as a new decision, finding or open question, is presented
to the author with its critique (**Pros**, **Cons & trade-offs**, **Blindspots & missed edge
cases**) in the review, not in the document.

### 5.2 Markers

| Marker | Meaning |
| :-- | :-- |
| none | current: implemented and true at the `verified` commit |
| **New** | decided, not yet implemented. Names its RFC, or says `no RFC yet`. Removed when the RFC lands. |
| *History.* | a previous state, kept short: what it was, why it changed, and when |

Facts are labeled by how they are known: by experiment (a spike, with its date and setup), from
external documentation (named), or not yet verified.

### 5.3 Design entries

- **Author decisions** (`U`) are rows of the Decisions table: `| GU1 | … | … |`.
- **Design decisions** (`D`) are paragraphs that start with `**GD1. Title.**`, followed by `*Why:*` and `*Cost:*`.
- **Findings** (`F`) are rows of the Findings table: `| GF1 | finding | state |`. A fixed finding keeps its row, marked *History.*
- **Verifications** (`S`) start with `**GS1, …**`, as a paragraph or a list item, or are rows of a table: `| GS1a | … |`. A falsification audit (§6.3) is recorded as one.
- **Open questions** (`Q`) are rows of an `Open questions` table: `| GQ1 | question | recommendation |`.
- **Use cases** (`J`, for journeys) are rows of a `Use cases` table: `| GJ1 | use case | actors | statements |`. A **scenario** of a use case is a sub-item, a paragraph that starts with `**GJ1a. Title.**`, followed by its sequence diagram (§5.4).

### 5.4 Diagrams

Diagrams are the way into the documents. A reader starts at the system, goes down to a component,
then to one of its scenarios, and only then reads the statements that scenario names. Diagrams are
Mermaid, in `mermaid` fenced blocks, in `docs/README.md`, in the Design part of architecture
documents, and in RFCs. They are diffed and edited like the text around them.
[`templates/example-architecture.md`](templates/example-architecture.md) shows every kind in one
conforming document.

**A diagram is never normative.** It shows what the Specification states and the Design decides, and
adds no requirement. The Specification holds no diagram. When a diagram and a statement disagree, the
statement holds and the diagram is corrected. When a diagram and the code disagree, it is drift
(principle 6).

| Kind | Mermaid | Where | Drawn |
| :-- | :-- | :-- | :-- |
| System | `flowchart`, a `subgraph` per boundary (C4-style) | `## System` of `docs/README.md`; the `Overview` of each architecture index | always |
| Placement | `flowchart`, a `subgraph` per boundary and per instance | `## Placement` of `docs/README.md` | always; a sentence when there is nothing to draw |
| Testing and release | `flowchart` | `## Testing and release` of `docs/README.md`, small, and the document it links | always; a sentence when that says it all |
| Component | `flowchart`; `classDiagram`, `erDiagram` or `stateDiagram-v2` where relations, a data model or states matter | the component's `Role` | when its parts or dependencies are worth seeing |
| Use case | `flowchart` | `### Use cases` | when actors use the component directly |
| Sequence | `sequenceDiagram` | `### Scenarios`, after the scenario's paragraph | for each scenario, unless it is one request and its response |

A diagram stays at the level of its document. The system diagram shows the components and the
external systems, and, in a repository of several projects, one `subgraph` per project. A
component's diagram shows its parts and what it depends on, not its functions. A diagram of more
than about 15 nodes is split by its boundaries into diagrams that link each other. A detail that
only some readers need stands behind a node that links it, not on the diagram every reader opens.

**Map links.** The diagrams that link documents are the map of the documents. A node
that stands for a documented component links its document with `click`, the path relative to the
diagram's document:

```
click auth "architecture/sign-in.md"
```

Every architecture document outside a directory, and every index, is reached from `docs/README.md`
by following `click` links: directly, or through the documents they link. Only a node a flowchart draws
links, on the diagrams of the map: `## System`, `## Placement` and `## Testing and release` of
`docs/README.md`, the `Overview` of an index and the `Role` of a document. `docs/MAP.md` and the RFCs
are not on the way. A small project links them all from its system diagram. A larger one links groups, and the document of each
group links what is under it, so that no diagram outgrows its level. An `Overview` links every
document of its directory. Two documents that a scenario joins, by naming statements of both, are
joined by an edge on each diagram that maps them: directly, through a `subgraph` around either node,
or through the nodes that lead to them. A component drawn but not documented has no link.

**Placement.** `## Placement` in `docs/README.md` answers: where does each artifact run, and what
does it own there? An artifact is anything the project builds and hands on: a service, a program,
a library, an image. A boundary is what it runs within: a cloud project, a server, a user's machine,
a board, the process of the program that links it. A boundary is a `subgraph`, and so is each
instance of an artifact inside it, named with what it is built from and holding what that instance
alone owns: a database, a bucket, a data directory. What several instances share stands outside them,
with an edge from each that uses it. A project that others run draws the shape it asks of them, and,
apart, whatever it runs itself. A project with nothing to draw says so in a sentence: *Linked into the
caller's process; owns nothing.*

**Testing and release.** `## Testing and release` in `docs/README.md` answers: what does each test level run
against, and what stops a release? It is a sentence or a small diagram, for a reader who wants that
answer and no more. It names each level of `levels` (§6.2) with what the level runs against: nothing
outside its process, an emulator, a development server, a live environment, a target board. A level
or a part that no run checks is said to be. A project whose runs fit there keeps them there. Otherwise
it links the architecture document that shows them: what starts each run, its steps, and the
environments it uses. [`templates/example-docs-README.md`](templates/example-docs-README.md) shows
both sections for a library.

**Use cases.** A use case is a goal an actor reaches through the system, named from the actor's view
as a verb and an object: *Sign in*, *Recover password*. An actor is a role or an external system,
never a component of the system. A component has use cases when users or external systems cross its
boundary. A library used only inside the system has none. Use cases that span the components of a
directory belong in its index. Use cases whose components share no index are **flows**: they
belong under `## Flows` in `docs/README.md`, with their scenarios, and take the `prefix` that
`docs/README.md` declares. Each is a row of the `Use cases` table (§5.3), which MAY add
columns, such as the configurations that offer a use case when not all of them do. In the use-case
diagram, actors stand outside a `subgraph`, the system boundary, and each use case is a stadium node
whose node ID is its ID: `AJ1([Sign in])`. `---` joins an actor to a use case, and `-. includes .->`
and `-. extends .->` relate use cases.

**Scenarios.** A scenario is one way a use case runs, as the actor tells the ways apart: it succeeds,
the password is wrong. It is a sub-item of its use case (`AJ1a`), a paragraph followed by its
sequence diagram. Its participants are the actor, the components of the system diagram, and the
external systems. `alt`, `opt`, `loop` and `par` show the variations within it. An outcome the actor
tells apart is a scenario of its own. A step that a statement makes observable names the statement,
`A-->>W: 401 invalid_credentials (AUTH-2)`. A sequence diagram is not a test specification: the
statements it names are. Scenarios plan the end-to-end tests, and a step whose result an actor sees,
but which no statement covers, is a gap in the Specification, filled before its test is written.

**Traceability.** The chain actor → use case → scenario → statements → tests is a chain of IDs, each
stated once:
- A use case names statements in its row. A scenario names them in its paragraph and in its
  diagrams, up to the next entry or heading. Prose elsewhere links nothing. A use case also has the
  statements of its scenarios, so a use case with scenarios leaves its own `Statements` empty.
- A test carries the IDs of the statements it checks (§6.2). A test that walks a scenario also carries
  the scenario's ID, with a statement the scenario names at the test's level: `it('AJ1a, AUTH-1, AUTH-3: signs in and keeps the session', …)`. One test MAY walk
  several scenarios. A test never carries the ID of a use case: a use case has the coverage of its
  scenarios.
- `docs/README.md` names in `scenario-levels` the levels that run the system as its users meet it,
  usually `[e2e]`, or `[]` when none does. Every current statement verified at one of them is named by
  a scenario, so that everything a user can observe is in a picture.

A use case or scenario is **verified** when every current statement it names is verified, and
**new** when it names no current statement but a new one. Verified says that each statement has its
evidence, possibly from separate tests, and not that anything ran the journey. A scenario is
**covered** at a level when a passing test of that level carries its ID and the ID of a current
statement it names at that level, and no failing test of that level carries its ID. A scenario
**requires** each level of `scenario-levels` at which it names a current statement that names test
files. A scenario uncovered at a level it requires stops a release (§9, §11). The verification record
lists each (§11.2). Covered is a claim that the checker can read from a title and a report's label,
no more. Whether a test checks a statement well is for the falsification audit, and whether it walks
the scenario it names is for the scenario audit (§6.3).

**Changes.** An RFC that changes the system's structure or a scenario shows the target diagram in
its Specification, with what changes marked. In a flowchart, the changed nodes take a class:

```
classDef new stroke:#1a7f37,stroke-width:3px
classDef changed stroke:#9a6700,stroke-width:3px
classDef removed stroke:#cf222e,stroke-dasharray:5 5
class AJ3 new
```

In a sequence diagram, the changed steps stand in a `rect`: `rect rgba(26,127,55,0.15)` for new,
`rect rgba(154,103,0,0.15)` for changed, and `rect rgba(207,34,46,0.15)` for removed.

**Checks.** A `## Placement` or `## Testing and release` that is missing or empty is a warning. The documentation checker reads a `mermaid` block for the structure Mermaid needs, not
its full grammar: a known diagram type, a flowchart direction, `subgraph`, `alt`, `opt`, `loop`,
`par`, `critical`, `break`, `rect` and `box` closed by `end`, `else`, `and` and `option` inside their
blocks, and the braces of class, entity and state diagrams. Every ID and statement a diagram names
resolves (§7), and every `click` target exists. A document missing from its map, and two documents
a scenario joins with no edge between them on the map, are warnings. To see a diagram, render it:
GitHub renders it in place, and a project MAY render every diagram in CI with the Mermaid CLI.

### 5.5 Terms

`docs/README.md` SHOULD keep a `## Glossary` table, `| **Term** | meaning |`, of the words its
statements give a precise meaning. A term is defined once. A statement uses a term only in its
defined meaning, and a new meaning is a new term, not a new sense of an old one. Two statements that
say the same with different words are a finding.

### 5.6 Review

The author reviews a document's Specification and Design, and records the review in its front
matter: `reviewed: 9b8d33b`, a commit in the history of `HEAD`. `reviewed` is the author's, as
`verified` is the code's: an agent never sets it. The author sets it to `HEAD` with
`node docs/tools/review.mjs docs --approve <document> …`, which refuses a document with changes that
are not committed.

A review covers the document's **items**: each statement, without its `Test:` and `State:` lines,
which record the code's progress; each Design entry, with its paragraphs and diagrams up to the next
entry or heading; and the rest of each section, its prose and diagrams, named by its heading. The
front matter and the register are not items. An item **changed since the review** differs from the
item at `reviewed`, whitespace aside, or was added or removed since. The checker warns about each
document with changed items, and names them. The verification record counts the documents reviewed
and lists the others (§11.2). A document that was never reviewed is unreviewed. Neither blocks a
release.

`node docs/tools/review.mjs docs [--since <commit>] [--out review.md]` writes the review page: for
each document with changed items, in the order of the system diagram, the items as word diffs
(`<del>` and `<ins>`), its diagrams of changed items and of scenarios that name a changed
statement with the changes marked as in an RFC (§5.4), and the RFCs that name its changed statements.
The system diagram heads the page, with the changed documents marked. What changed in `## Placement`
and `## Testing and release` of `docs/README.md` since `--since` or the last tag follows it, as a word
diff of the prose and the diagrams before and now. These sections have no `reviewed` and no approval,
and with neither `--since` nor a tag they are not shown. The last tag may be another package's, which
hides what changed before it, so a repository with many packages passes `--since`. A document without
`reviewed` is compared with `--since`, or else with the last tag, or else shown whole. The page is
Markdown, for a pull request, a CI job summary or an editor; it is not kept in `docs/`.

### 5.7 The map

`node docs/tools/map.mjs docs` writes `docs/MAP.md`, views derived from the documents: the use cases
of each actor across the system, each statement with the use cases and scenarios that name it, each
statement below the levels that apply to it, against every level of the project (§6.1), and the
documents that the scenarios join. A project MAY commit it. When `docs/MAP.md` exists, the
checker reports it as an error unless it is what `map.mjs` would write, so it is regenerated with
every change it shows.

## 6. Specification statements and their tests

### 6.1 Statements

```
#### SEC-4 · Absence is only NOT_FOUND

`getSecret` returns `undefined` when, and only when, the call fails with gRPC `NOT_FOUND` (5).
Every other failure propagates unchanged.

- Test: `packages/secrets/src/runtime.test.ts`, `e2e/secrets.e2e.ts`
- Level: unit, e2e
```

- The heading is `#### <CODE>-<n> · <short title>`. `CODE` is one of the document's `codes`.
- **The text is normative.** Plain present tense means MUST. Capitalized **SHOULD** and **MAY** mark weaker requirements.
- **`- Test:`** is required, in one of these forms (§6.2):
  - `` - Test: `path/a.test.ts`, `path/b.test.ts` ``: the files whose tests check the statement;
  - `` - Test: `path/a.test.ts` (unverified: the retry delay) ``: partly checked, naming the part that is not;
  - `- Test: unverified`, optionally followed by ` (reason)`;
  - `- Test: none yet`, only for a **New** statement.
- **`- Level:`** is required, except for a removed statement. It lists the test levels at which the statement MUST be verified, from the project's `levels`, separated by commas (§6.2). The author decides them when reviewing the statement. A level that applies but cannot be met yet is **wanted**, with the reason: `- Level: unit (wanted e2e: no run reaches the target yet)`. A wanted level is not required and stops no release. It stays on the line, so lowering a level does not lose it, and moves into the list when its test exists.
- **`- State:`** is present only for a statement that is not current: `new (RFC-NNNN)`, `new (no RFC yet)`, or `removed (RFC-NNNN)`. A removed statement keeps its block, with its title struck through: `#### ~~SEC-9 · …~~`.
- **Numbers are never reused.** Gaps are allowed.
- **The boundary test:** *would a different but correct implementation have to match this?* If yes, it is a statement. If not, like a file path or an internal helper name, it belongs only in an RFC.
- **Code and pseudo-code** MAY express a statement, or a Design entry, more precisely than prose, in a fenced block. A block in the language of the code, such as a signature, a type, a data format or an example call, is normative as written. A block tagged `pseudo` is normative only for the behavior it makes observable. Its structure, names and steps are not normative, so a different implementation with the same observable behavior conforms.

  ````
  #### SEC-5 · Reads retry only transient failures

  ```pseudo
  for attempt in 1..3:
    result = call()
    if result is not UNAVAILABLE: return result
    wait 100 ms × 2^(attempt − 1)
  return result
  ```

  - Test: `packages/secrets/src/runtime.test.ts`
  - Level: unit
  ````

### 6.2 Tests

- A test that checks a statement carries the statement's ID in its title as the report names it, for example `it('SEC-4: reads a missing secret as undefined', …)`. A test that checks several statements carries each ID. A test that walks a scenario also carries the scenario's ID (§5.4). Where a test's name must be an identifier, as in C, and so has no spaces, the ID is written with an underscore: `test_SEC_4_reads_a_missing_secret`.
- `- Test:` names the files that hold those tests, by path from the repository root. The documentation checker confirms that each file exists and contains the ID. A new statement keeps `none yet` until its RFC's code is committed, even when its tests are written first.
- **A statement is tested at the boundary it describes.** A mock of what the statement is about proves nothing about it. The level follows from the statement:
  - a statement about the contract of a function or module: a **unit** test through its public interface;
  - a statement about components working together, or about storage, a network or a file system: an **integration** test with the real collaborators;
  - a statement about the system as its users meet it, such as a CLI, an HTTP API, a deployment or a UI flow: an **end-to-end** test against a running system;
  - a statement about an external service: a **contract** test against the real service, or `unverified`.

  Listing several levels verifies a statement from several sides. A unit test covers its edge cases cheaply, and an end-to-end test shows that it holds in the running system.
- `docs/README.md` declares the project's `levels`, lowercase names such as `[unit, integration, e2e, contract]`. A project MAY add its own, such as `conformance`.
- Each test run writes a JUnit XML report labeled with its level: `unit=reports/unit.xml`. The results checker confirms that every current statement that names test files has, for each of its levels, a passing test carrying its ID in a report of that level, no failing test anywhere, and no test marked as expected to fail, which passes by failing, unless it cites a Finding that names the statement (§8.2). It also confirms that every statement ID in a test title is defined and not removed.
- A run MAY **defer** a level that it cannot run, such as a contract test that needs credentials a pull request does not have. A missing test of a deferred level is a warning, and the verification record of that run is not releasable (§11.2).

### 6.3 Trust

The author reads the Specification and the RFC. Every link from that text to running code is checked
by something other than the agent that wrote the code:

| Link | Checked by |
| :-- | :-- |
| The statement says what the author wants | the author, reviewing the Specification diff |
| The test asserts what the statement says | the author, reviewing the RFC's description of each test (§8.1); a falsification audit |
| The test was not shaped to fit the code | tests written before the code, by an agent that has not seen it (§8.2) |
| The test exercises the statement at the boundary it describes | the author, declaring its `Level`; `check-results.mjs`, per level |
| The test walks the scenario whose ID it carries | a scenario audit; `check-results.mjs` confirms only that it also carries a statement of the scenario at that level |
| The test exists and carries the statement's ID | `check-docs.mjs` |
| The test passes | `check-results.mjs` |

**Falsification audit.** An agent that did not write the code is given a statement, its tests and
the code. It tries to change the code so that the code violates the statement while every test still
passes. A counterexample it finds is a Finding, stated in terms of behavior. The audit also reports
a statement too vague to falsify. Each audit is recorded as a Verification entry with its commit and
the statements it covered.

An audit MUST run for every statement an RFC adds or changes, before the RFC is implemented. Its
findings are fixed by amending that RFC (§8.2). An audit SHOULD also run during drift audits, and
their findings are fixed through a new RFC.

**Scenario audit.** An agent that did not write the code is given a scenario, the tests carrying its
ID and the code. It removes a step of the scenario from the code. A test that still passes is a
Finding. So is an outcome an `alt` of the scenario shows that no test reaches. An audit MUST run for
every scenario an RFC adds or changes, at the same point and recorded in the same way as the
falsification audit.

The remaining trust is in the auditor. It is reduced by running the audit in a separate session,
preferably on a different model. The author's occasional reading of code is a sample that shows how
far the auditor can be trusted. It is not a step of the workflow.

### 6.4 References from code

The code explains itself through names and small functions. The reason behind it lives in the
architecture document, which must hold it anyway (principle 2), not in a comment.

- A comment SHOULD consist only of references to IDs, for example `// SEC-4, GD5`. A reader
  follows them to the statement or the decision.
- A comment that explains is a missing name or a missing document entry. The fix is a better name, a
  smaller function, or a Design entry, which the comment then references.
- Comments that tools read, such as a license header, a type annotation or a linter directive, are
  not explanations.
- A doc comment on an exported API is exempt. Editors and generated references show it to the
  API's users, who do not read the architecture documents. It MAY explain, and MAY reference IDs.
- Every reference resolves. When `docs/README.md` lists `sources`, the documentation checker reads
  every file that git tracks under them, outside `docs/`, and skips binary files. Each token with a
  declared prefix or statement code, whether in a comment, a string or a test title, MUST be
  defined. A statement it names MUST NOT be removed. The check needs a git repository.

### 6.5 Testing techniques

Some statements hide their defects from tests written by example. For them, the tests SHOULD use:

| A statement that … | is tested by … | because … |
| :-- | :-- | :-- |
| holds for every input of a kind ("any name", "every request") | a **property-based** test, with generated inputs | edge cases come from the generator, not from what someone thought of |
| handles untrusted input, or is a security invariant | **fuzzing** | parsers and validators break on inputs nobody writes by hand |
| handles failures ("every other failure propagates") | **fault injection**: the dependency is made to fail | the failure path is where untested code hides |
| holds for several implementations of one contract | a **conformance suite**: one set of tests run against each implementation | a new implementation cannot drop part of the contract unnoticed |
| describes an external service | a **contract test** against the real service, also run on a schedule | a mock records the assumption, not the service, and services change |

**Regression per finding.** A Finding that records a defect, once fixed, leaves a test carrying the ID
of the statement the defect violated. A defect that no statement covers first gets its statement,
through an RFC.

## 7. IDs

- Each architecture document or directory has a `prefix` of capital letters. IDs are the prefix, a category letter (`U`, `D`, `F`, `S`, `Q`, `J`) and a number, for example `GD4`. A lowercase letter MAY follow for sub-items, as in `GS1a`.
- An ID is defined exactly once. Its number is never reused, and it keeps its number when its text moves between files.
- A directory's index keeps a `### Register` table, `| ID | summary | state | document |`, listing every ID defined in the directory, without sub-items.
- Every mention of a prefixed ID, or of a statement such as `SEC-4`, anywhere in `docs/`, diagrams included, resolves to a definition.

## 8. RFCs

### 8.1 When an RFC is needed, and its content

A change that alters no Specification statement and no observable behavior skips the architecture
document and the RFC. Examples are a refactor, a dependency update, a build or tooling change, or a
performance change that no statement constrains. Such a change:
- is committed on its own and passes the checker, the build and the tests;
- updates `## Placement` and `## Testing and release` in the same commit, when it alters what they say;
- MUST NOT change what a test carrying a statement ID asserts;
- becomes an ordinary change, through the whole pipeline, as soon as it turns out to need a
  different behavior (discovery rule).

An agent that cannot tell whether a change is observable treats it as observable.

Any other change needs an RFC. An RFC is a **delta against a Specification**, from state X to state
Y, plus a **change plan**: files, steps, baselines and verification. It is written to be followed by
an agent less capable than its author: exact paths, signatures, data types, error codes, test titles
and commands.

Its `##` sections, in order: `Summary`, `Files`, `Specification`, `Non-goals`, `Tests`, `Steps`,
`Verification`, `Critique`.

- **Specification** gives the exact new text of each statement the RFC adds, changes or removes.
  The `changes` key classifies each change and removal (§11.3). An RFC that changes what an actor
  can do, or how a use case runs, also gives its new use case and scenario entries, with their
  diagrams (§5.4).
- **Tests** gives each test by file, level and exact title, the title carrying the statement IDs it checks and the scenario it walks.
  It gives the test's assertion as *given / when / then*, in terms of behavior. The author reviews
  these descriptions instead of the test code.
- **Critique** has the three paragraphs `**Pros**`, `**Cons & trade-offs**` and
  `**Blindspots & missed edge cases**`, as lists.

### 8.2 Lifecycle

1. **Draft.** The architecture document marks the target statements **New** with `State: new (RFC-NNNN)`, and the RFC specifies the change.
2. **Tests.** An agent session that has not seen the implementation SHOULD write the RFC's tests from the Specification and the RFC, before the code. They are marked as expected failures (for example `it.fails`), so the test suite still passes. `check-docs.mjs` allows the marker, and `check-results.mjs` does not for a current statement, so such a commit is not releasable. The one exception is a test that reproduces a Finding not marked *History.*, whose row names the statement, and that cites it just above: `// RXF11`. It stays marked until the Finding is fixed, when `it.fails` turns red, or for good when the author accepts it. Its statement is a known failure: it does not count as verified, the verification record lists it (§11.2), and a release may still happen.
3. **Implementation.** The agent follows the RFC. It removes the expected-failure markers and does not change what a test asserts. A contradiction with reality, including a test that turns out to be wrong, is corrected in the RFC, and in the architecture document if needed, **before** the code is committed (discovery rule). The architecture document then drops the markers, names the test files, and updates `verified`. The RFC gets `status: auditing` with `commits`.
4. **Audit.** An agent that did not write the code runs a falsification audit (§6.3) of every statement the RFC adds or changes, and a scenario audit of every scenario it adds or changes. Each counterexample is a Finding of the architecture document.
5. **Amendment.** An open finding of the audit is fixed in the same RFC, edited in place. Its Summary names the finding, and its Specification, `changes`, Tests, Steps and Critique change to cover the fix. The fix goes through steps 2 and 3 like the rest of the RFC: its tests are written first, its code is committed on its own, and its commits are added to `commits`. The statements it adds or changes are audited again (step 4).
6. **Implemented.** When no finding of the RFC's audits is open, or the author accepts each one that is, the RFC gets `status: implemented` and `audit`, the Verification entries of its audits. An accepted finding keeps its row, with its state saying it is accepted. From now on the RFC is **frozen**: its content is never edited again. A change of layout (§3) MAY
   move it, and then rewrites only its relative links and the paths that name moved documents, in its
   front matter and its text, so they resolve again. The move is committed on its own.
7. A later change is a new RFC that references the old one.

`audit` is required from the RFC that `docs/README.md` names in `audit-from` on. The RFCs before it
were frozen without one, and are not edited to add it.

### 8.3 Commits

Documents and code are committed separately, in this order: the architecture change, the RFC, the
tests when they are written first, the code, and then the architecture document's update to current.
An amendment (§8.2) repeats that order: the RFC and the findings, the tests, the code, and the
architecture document. The audit's Verification entry and its findings, and the RFC's `implemented`,
are documents commits. Each commit passes the checker, the build and the tests.

An agent commits, merges or pushes only with the author's approval of that commit. It prepares the
change and its message, and waits.

Commits reach the main branch unchanged, by a merge commit or a fast-forward. Squash merges and
rebase merges are forbidden, because they replace the hashes that `commits` and `verified` name. CI
checks out the full history.

## 9. The checkers

`check-docs.mjs` checks, and exits non-zero on any error:

1. front matter: types, required keys, enums, unique prefixes and codes, the workflow version against `docs/WORKFLOW.md`, `audit-from` an RFC number, `reviewed` in the history of `HEAD`, and, as a warning, `audit-from` not set;
2. structure: the `#` title, the `##` parts and required `###` sections in order;
3. statements: heading format, a code the document declares, no duplicates, the form of the `Test:` line, a `Level:` line naming declared levels, each named test file existing and containing the ID, valid `State:` values, `none yet` only for **New** statements;
4. IDs: defined once, every mention defined, diagrams included, registers complete and not stale; each use case and scenario names a statement and no removed one, and a scenario's use case is defined (§5.4);
5. RFCs: file name against `number`, required sections and critique paragraphs unless `sections: legacy`, each item of `changes` naming a defined statement and a kind, `commits` present and in the history of `HEAD` when `auditing` or `implemented`, each item of `audit` a defined Verification entry, `audit` present when `implemented` and numbered from `audit-from` on, every RFC listed in the `rfcs/README.md` of its directory, and, as a warning, an RFC number used twice;
6. links: every relative link and `click` target resolves to a file, and every `#anchor` to a heading;
7. references from code: when `sources` is set, every ID and statement named in a tracked source file is defined, and no named statement is removed (§6.4);
8. diagrams: each `mermaid` block declares a Mermaid diagram type and closes its blocks, and none stands in a Specification; `docs/README.md` has a `## System` diagram and each architecture index one in its `Overview`; every current statement at a level of `scenario-levels` is named by a scenario (§5.4);
9. terms: each term of the glossary is defined once (§5.5);
10. review: as a warning, the items of a document changed since its `reviewed` commit (§5.6);
11. map: as warnings, a document no chain of `click` links reaches from `docs/README.md`, a document missing from the `Overview` of its directory, and two documents joined by a scenario with no edge between them on a diagram that maps them; `docs/MAP.md`, when it exists, what `map.mjs` writes (§5.4, §5.7);
12. views: as warnings, `## Placement` or `## Testing and release` missing or empty in `docs/README.md`, and a level of `levels` that `## Testing and release` does not name (§5.4).

A document with `conforms: false` is checked only for front matter and links, and is reported as a
warning until it is restructured.

`check-results.mjs` runs as `node docs/tools/check-results.mjs docs <level>=<report.xml> … [--defer <level>]`
after the tests, with the JUnit XML reports they produced. It checks, and exits non-zero on any error:

1. every current statement that names test files has, for each of its levels, a passing test whose title carries its ID in a report of that level, no failing one, and none marked as expected to fail in those files, unless it cites a Finding that names the statement (§8.2). This is a search of the text and is best effort;
2. every statement ID in a test title is defined and not removed;
3. every scenario has, for each level it requires (§5.4), a passing test whose title carries its ID and a statement it names at that level, in a report of that level, and no failing one;
4. every scenario ID in a test title is defined, and no title carries the ID of a defined use case;
5. every report is labeled with a declared level.

It warns about a test that carries the ID of an `unverified` statement, and about a title with a word
shaped like a use case ID that is not defined, such as `XJ45`. It treats a test whose `status` is
`notrun` as skipped, and reads no outcome from captured output. It ignores the statements of a
document with `conforms: false`.

`check-release.mjs` runs as `node docs/tools/check-release.mjs docs [--plan release.json]`. It finds
the packages to release (§11.4) and checks, for each, that its new version is high enough for the
statement changes since its baseline (§11.3). It also finds the edits since that baseline that shrink what a release proves, for the record (§11.2). With `--plan`, it writes those packages as JSON: name,
manifest, version, baseline, required kind, and the RFCs for the release notes.

`review.mjs` and `map.mjs` write the review page (§5.6) and `docs/MAP.md` (§5.7); they check nothing.

`record.mjs` runs as `node docs/tools/record.mjs docs --junit <level>=<report.xml> … [--defer <level>]
--build passed|failed [--out verification.json]`. It runs the other three checkers itself, reads the test counts from the
JUnit XML, writes the verification record (§11.2), and exits non-zero unless every check passed.


## 10. Adoption and updates

- **New or existing project:** `node <spec-workflow>/bin/init.mjs <project>` creates `docs/` with this file, the templates, the checkers, `docs/README.md` and `docs/rfcs/README.md`. It never overwrites a document.
- **Update:** `node <spec-workflow>/bin/init.mjs <project> --update` replaces only the vendored files (`WORKFLOW.md`, `templates/`, `tools/`) and sets `workflow` in `docs/README.md`.
- **Existing documents:** give each a front matter. A document not yet restructured gets `conforms: false`, and an old RFC gets `sections: legacy`.
- **From 1.x to 2.0:** remove the `## Critique` part of each architecture document, keeping any trade-off still relevant in its decision's *Cost:* line. Rewrite each `- Test:` line in the forms of §6.1, and add the statement IDs to the titles of the tests it names.
- **From 2.x to 3.0:** declare the project's `levels` in `docs/README.md`, give every statement that is not removed a `- Level:` line, and label each JUnit report with its level. Release impact is checked from the first release whose baseline follows 3.0.0 (§11.5).
- **From 3.0 to 3.1:** no document changes. Agents ask the author instead of writing questions into documents (§2), and commit only with the author's approval (§8.3).
- **From 3.1 to 3.2:** no document changes. A repository with several projects MAY split its documents per project (§3); moving a frozen RFC rewrites only its links and paths (§8.2).
- **From 3.2 to 3.3:** an RFC whose code is committed is `auditing` until its falsification audit finds nothing open; the audit's findings are fixed by amending the same RFC, and the RFC is then `implemented` with `audit` (§8.2). Set `audit-from` in `docs/README.md` to the number of the first RFC not yet implemented. An RFC implemented before it keeps its text. Until `audit-from` is set, the checker warns.
- **From 3.x to 4.0:** draw the system diagram under `## System` in `docs/README.md`, and one in the `Overview` of each architecture index. Move any `mermaid` block out of a Specification into the Design. Use cases (`J`) are a new category of IDs, so a token such as `GJ1` with a declared prefix is now an ID: rename a mention that means something else. Draw the scenarios of the components that users meet, then set `scenario-levels` in `docs/README.md`; until it is set, the checker warns, and from 5.0 reports an error (§5.4). Optionally, start a glossary (§5.5).
- **From 4.0 to 4.1:** no document changes. The checker warns until each document is on its map: add a `click` line for each documented node of the system diagram and of the `Overview` diagrams, and an edge for each pair of documents a scenario joins (§5.4). Optionally, review the documents and approve them (§5.6), commit `docs/MAP.md` (§5.7), and move flows across documents under `## Flows` (§5.4).
- **From 4.x to 5.0:** set `scenario-levels` in `docs/README.md`, `[]` when no level runs the system as users meet it. When `docs/MAP.md` is committed, regenerate it. Give the test that walks each scenario the scenario's ID in its title, beside a statement the scenario names at that level, and remove any use case ID from a title; until each scenario is covered at the levels it requires, `check-results.mjs` reports errors and no release is possible, so a project stays on its version until that is done (§5.4). To see what is left before adopting, run the new checker on the project as it stands: `node <spec-workflow>/tools/check-results.mjs docs <level>=<report.xml> …`. Add `## Placement` and `## Testing and release` to `docs/README.md`, each a diagram or a sentence; until then, the checker warns (§5.4). The system diagram no longer has to link every document: optionally, move detail down and link it through the documents it links (§5.4).
- **Versioning:** this file follows semantic versioning. A change that makes a conforming project fail a checker is a major version.

## 11. Integration and release

### 11.1 Integration

CI runs on every push to the main branch and on every pull request into it. A push to any other
branch runs nothing. CI runs, in order: the documentation checker, the build, the tests (writing
a JUnit XML report per level), and `record.mjs`, which runs the results and release checkers and writes the
verification record. CI keeps the record as an artifact of the run. A push to the main branch runs
every level. A pull request MAY defer the levels it cannot run (§6.2).

- CI checks out the full history.
- A pull request merges only when its checks passed on the exact result of the merge (required
  status checks, or a merge queue).
- A commit pushed straight to the main branch is checked after it lands. Its verification record
  still gates the release (§11.4), so a failed check stops the release, not the push.
- CI pins every third-party step to an immutable version, such as a commit hash, not a movable tag.
- Each CI job has only the permissions it needs.

### 11.2 The verification record

`verification.json` states what was verified at one commit:

```json
{
  "schema": 2,
  "workflow": "5.0.0",
  "commit": "<full commit hash>",
  "created": "2026-09-28T17:30:00.000Z",
  "checks": { "spec_check": "passed", "build": "passed", "tests": "passed", "test_traceability": "passed", "release_impact": "passed" },
  "statements": { "total": 41, "verified": 37, "unverified": ["DEP-3", "SEC-7"], "new": ["STO-9"], "without_scenario": [], "level_gaps": [{ "id": "DEP-3", "applied": ["unit"], "missing": ["e2e"] }], "known_failures": [{ "id": "SEC-7", "finding": "SF3" }] },
  "documents": { "total": 6, "reviewed": 5, "unreviewed": ["architecture/sign-in.md"] },
  "use_cases": { "total": 2, "verified": 1, "unverified": ["AJ2"], "new": ["AJ3"] },
  "scenarios": { "total": 3, "verified": 2, "unverified": ["AJ2a"], "new": ["AJ3a"], "uncovered": { "e2e": [] } },
  "scenario_levels": ["e2e"],
  "weakened": [{ "id": "DEP-3", "change": "level e2e lowered" }],
  "weakened_since": ["@genoacms/core@0.6.0"],
  "tests": {
    "total": 124, "passed": 124, "failed": 0, "skipped": 0, "carrying_ids": 98,
    "levels": { "unit": { "total": 101, "passed": 101, "failed": 0, "skipped": 0 }, "e2e": { "total": 23, "passed": 23, "failed": 0, "skipped": 0 } }
  },
  "deferred": [],
  "releasable": true,
  "packages": [{ "name": "@genoacms/core", "version": "0.7.0", "released": false }]
}
```

- A check is `passed` or `failed`. `tests` fails when a test failed, or when the reports hold no test.
- `statements.total` counts the current statements of conforming documents. `verified` counts those
  with a passing test carrying their ID and no failing one. `unverified` lists the rest. `new` lists
  the statements not yet implemented.
- `without_scenario` lists the current statements at a level of `scenario-levels` that no scenario
  names (§5.4).
- `level_gaps` lists the current statements with no passing test at a level that applies to them,
  required or wanted (§6.1): the levels `applied`, with one, and those `missing`.
- `known_failures` lists the statements with a test marked as expected to fail that cites its Finding
  (§8.2). They are in `unverified`.
- `weakened` lists, for the packages to release, what shrank since their baselines without changing a
  statement's text, so that no release impact shows it: `level <level> lowered`, `test files dropped`,
  `current again new`, `scenario removed`, and `<level> dropped` for `scenario-levels`. Each is allowed,
  and none stops a release. The record says it happened. `weakened_since` names the baselines compared:
  when it is empty, nothing was compared, and an empty `weakened` says nothing.
- `documents` counts the conforming architecture documents, and `reviewed` those reviewed with no
  item changed since (§5.6). `unreviewed` lists the others, by path from `docs/`.
- `use_cases` and `scenarios` count the current use cases and scenarios of conforming documents
  (§5.4). `unverified` lists those not verified, `new` those not implemented, and `uncovered` the
  scenarios not covered at a level they require, for each level of `scenario-levels`, which
  `scenario_levels` repeats so that a reader of the record sees when a project narrows it.
- `carrying_ids` counts the tests whose title carries at least one statement ID. `levels` counts the
  tests of each level.
- `deferred` lists the levels the run deferred. `releasable` is true when every check passed and no
  level was deferred.
- `packages` lists every publishable package (§11.4). `released` says whether its version has a tag.

### 11.3 Release impact

Every statement change has a kind, which sets the smallest version increase that may carry it:

| Kind | Meaning | At 1.0.0 or later | At 0.y.z, y ≥ 1 |
| :-- | :-- | :-- | :-- |
| `breaking` | a user relying on the old statement can fail | major | minor |
| `added` | a new current statement | minor | patch |
| `compatible` | changed or removed, and every user of the old statement still works | patch | patch |
| `editorial` | the wording changed, the meaning did not | patch | patch |

Two kinds of version are exempt, and need only be higher than the previous one:
- a prerelease version, such as `1.0.0-alpha.21`;
- a version whose baseline is `0.0.z`.

`^0.0.z` accepts no other version, and prereleases promise no stability.

- A statement is **added** when it is current now and was not current at the baseline. It is
  **changed** when its text, without its `Test:`, `State:` and `Level:` lines, differs from the baseline. It
  is **removed** when it is struck through or gone now, and was current at the baseline.
- The RFCs **since the baseline** are the auditing and implemented RFCs with a commit outside the
  history of the baseline tag. An RFC **names** a statement when its `changes` or its text mention the statement.
- A changed or removed statement MUST be classified in the `changes` of an RFC since the baseline.
  An added statement has the kind `added` unless one classifies it otherwise. An added statement
  that no RFC since the baseline names documents existing behavior, and has no impact.
- A change affects the packages of the RFCs since the baseline that name it. An RFC affects the
  packages that own the files in its `Files` table, and a file belongs to the package of the
  nearest version manifest above it (§11.4). An RFC whose files belong to no package affects every
  package.
- The **baseline** of a stable version is the highest stable version of the same package that has a
  release tag. A package without one has no baseline, and its first stable release is not checked.
- The required increase for a package is the largest kind among the changes that affect it.

### 11.4 Release

- A **version manifest** declares a package's name and version: `package.json`, `Cargo.toml`
  (`[package]`), or a `VERSION` file holding only the version, named after its directory. A package
  marked private (`"private": true`, `publish = false`) is not released.
- A package version is **released** when its release tag exists: `<name>@<version>`, or
  `v<version>` for a repository whose only package is at its root.
- A release runs on every push to the main branch. It releases every package whose manifest
  version has no release tag, and only when the verification record of that commit is `releasable`. It then creates the release tags. A push that changes no version releases nothing.
- A release tag is never moved or deleted. A bad release is followed by a new version.
- The verification record is attached to the release. The published packages and the record SHOULD
  carry signed build provenance, such as npm provenance or an artifact attestation.
- The release notes of a package are the titles and summaries of the RFCs since its
  baseline that affect it.

### 11.5 Adoption

Before the first release under the workflow, every version already published gets its release tag,
on the commit it was published from, or on the adopting commit when that commit is unknown. Only new
versions are then released. `check-release.mjs` lists the untagged versions.

Release impact is checked only against a baseline whose `docs/README.md` declares workflow 3.0.0 or
later. An earlier baseline is reported as a warning: its RFCs carry no `changes`.
