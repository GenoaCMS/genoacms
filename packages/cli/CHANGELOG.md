# @genoacms/cli

## 0.1.0

### Minor Changes

- [#14](https://github.com/GenoaCMS/genoacms/pull/14) [`69f955d`](https://github.com/GenoaCMS/genoacms/commit/69f955d367d23b45a1beae7fb9442264e4ba2d42) Thanks [@Hejtmus](https://github.com/Hejtmus)! - Help, version and guidance (RFC-0028): `-h`/`--help` and `<command> --help` print the usage, `-v`/`--version` the version, `-c` and `-m` are short for `--config` and `--mode`, and `--mode` takes `dev` and `prod`. An unknown command, or no command outside a terminal, fails with the usage instead of opening the menu. A production `build` or `deploy` refused for a development-only adapter names the config it loaded and how to name the production one. An empty `--config` is refused, a failed deploy step says so instead of `Canceled`, and Vite no longer inherits the shell's `GENOA_*` variables. `init`'s AWS suite scaffolds `@genoacms/adapter-aws/secrets`, and `roles` lists the declared roles for an assignment.

### Patch Changes

- [`54b23b1`](https://github.com/GenoaCMS/genoacms/commit/54b23b170d2f39343283d9a29009686ef58fbcd2) Thanks [@Hejtmus](https://github.com/Hejtmus)! - The installed command is `genoa`, as the documentation says (RFC-0034). `bin` was a bare path, which npm and pnpm link as `cli`, so `npx genoa` failed after `npm install -D @genoacms/cli`.

- [#18](https://github.com/GenoaCMS/genoacms/pull/18) [`022de8b`](https://github.com/GenoaCMS/genoacms/commit/022de8b6100baca3d2b695a8d1b89baa3ad88d40) Thanks [@Hejtmus](https://github.com/Hejtmus)! - `init`'s `collections.ts` example declares `primaryKey: { key: 'id', schema: { type: 'string' } }`, the shape the database contract declares and the AWS and Postgres adapters read, instead of a bare `'id'`.

- Updated dependencies []:
  - @genoacms/config@0.0.2
