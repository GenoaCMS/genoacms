# Contributing to GenoaCMS

GenoaCMS is maintained by one person, [Filip Holčík](https://github.com/Hejtmus). Reviews and replies
can take a few days. Bug reports, questions and pull requests are welcome.

## Reporting a bug or asking a question

Open an [issue](https://github.com/GenoaCMS/genoacms/issues). Include the package and its version, your
adapters and config (without secrets), what you expected, and what happened.

Report security problems privately: see [`SECURITY.md`](SECURITY.md).

## Proposing a change

GenoaCMS follows the Spec Workflow, described in [`docs/WORKFLOW.md`](docs/WORKFLOW.md): people review
specifications, agents write code, and tests connect the two.

- **A change in behavior** starts with the architecture document in [`docs/architecture/`](docs/architecture/)
  and an RFC in [`docs/rfcs/`](docs/rfcs/), before any code. Open an issue first to agree on it.
- **A change that alters no statement and no observable behavior** (a refactor, a dependency update)
  goes straight to code.

## Pull requests

1. Install with `pnpm install`. Node `^20.19`, `^22.12` or `>=24` (CI uses the version in `.nvmrc`) and
   the pnpm version pinned in `package.json` are required.
2. Build and test the packages you changed with `pnpm --filter <package> run build` and
   `pnpm --filter <package> run test`. CI runs the tests by level: `node scripts/test-level.mjs unit`,
   `integration` and `conformance`. Run `pnpm docs:check` if you touched `docs/`.
   The end-to-end tests of `@genoacms/core` need Google Cloud credentials, so they fail on pull requests
   from forks. The maintainer runs them.
3. Describe a change to a published package with `pnpm changeset`, and commit the file with the change.
4. Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`.
   One logical change per commit.

## Writing a new adapter

An adapter implements a service contract from `@genoacms/contracts` and proves it with the suites in
`@genoacms/conformance`, which exist for storage, database and authentication. See [Adapters](https://genoacms.js.org/guide/adapters/) in the documentation.

## License

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE).
