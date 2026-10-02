# @genoacms/conformance

## 0.0.2

### Patch Changes

- [`f22136c`](https://github.com/GenoaCMS/genoacms/commit/f22136c2278df5010392fb95d99c55f709bd3418) Thanks [@Hejtmus](https://github.com/Hejtmus)! - The storage suite's read test awaits the object's stream and checks its content, instead of returning before the read; the read no longer races the next test's delete into an uncaught 404.
