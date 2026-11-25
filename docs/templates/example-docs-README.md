---
type: docs-index
workflow: <version>
levels: [unit, integration, e2e]
audit-from: 1
scenario-levels: [e2e]
---

# Ringlog documentation

<!-- A worked example of the index of a project that nothing deploys: Ringlog, a small C library (WORKFLOW §5.4). Not a skeleton. -->

Ringlog is a C library that keeps a log in a fixed block of memory, overwriting its oldest entries.

## System

```mermaid
flowchart LR
  program[Calling program] -->|ringlog.h| ring[Ring buffer]
  ring --> memory[(A block the caller gives it)]
  click ring "architecture/ring.md"
```

## Placement

Ringlog is linked into the caller's process, as `libringlog.a` or `libringlog.so`. It owns nothing:
the caller gives it the memory it works in, and it opens no file and starts no thread.

## Documents

| Document | Prefix | Codes | Subject | Conforms |
| :-- | :-- | :-- | :-- | :-- |
| [`architecture/ring.md`](architecture/ring.md) | R | RING | the ring buffer | yes |
| [`rfcs/`](rfcs/README.md) | — | — | implementation specifications, in implementation order | — |

## Testing and release

```mermaid
flowchart LR
  push[Push to main or pull request] --> matrix
  subgraph matrix [Each of gcc and clang, on x86-64 and arm64]
    build[Build] --> unit[unit: in the test process, with sanitizers]
    build --> integration[integration: linked into a test program]
    build --> e2e[e2e: the example programs, their output compared]
  end
  matrix --> fuzz[Fuzzing, for ten minutes]
  fuzz --> record[verification.json]
  record -->|releasable| release[Release the sources and headers]
```
