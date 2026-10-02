# @genoacms/cli

## 0.1.0

### Minor Changes

- [#14](https://github.com/GenoaCMS/genoacms/pull/14) [`69f955d`](https://github.com/GenoaCMS/genoacms/commit/69f955d367d23b45a1beae7fb9442264e4ba2d42) Thanks [@Hejtmus](https://github.com/Hejtmus)! - Help, version and guidance (RFC-0028): `-h`/`--help` and `<command> --help` print the usage, `-v`/`--version` the version, `-c` and `-m` are short for `--config` and `--mode`, and `--mode` takes `dev` and `prod`. An unknown command, or no command outside a terminal, fails with the usage instead of opening the menu. A production `build` or `deploy` refused for a development-only adapter names the config it loaded and how to name the production one. An empty `--config` is refused, a failed deploy step says so instead of `Canceled`, and Vite no longer inherits the shell's `GENOA_*` variables. `init`'s AWS suite scaffolds `@genoacms/adapter-aws/secrets`, and `roles` lists the declared roles for an assignment.
