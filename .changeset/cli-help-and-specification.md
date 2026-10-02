---
'@genoacms/cli': minor
---

Help, version and guidance (RFC-0028): `-h`/`--help` and `<command> --help` print the usage, `-v`/`--version` the version, `-c` and `-m` are short for `--config` and `--mode`, and `--mode` takes `dev` and `prod`. An unknown command, or no command outside a terminal, fails with the usage instead of opening the menu. A production `build` or `deploy` refused for a development-only adapter names the config it loaded and how to name the production one. `init`'s AWS suite scaffolds `@genoacms/adapter-aws/secrets`, and `roles` lists the declared roles for an assignment.
