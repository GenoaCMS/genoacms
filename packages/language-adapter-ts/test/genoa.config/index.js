/**
 * The smallest instance configuration that registers this adapter.
 *
 * `getProvider` reads `genoa.config` from the working directory, so the adapter's own tests need a
 * configuration to be resolved against. This is not a running CMS — nothing here has a bucket, a
 * database or a key — it is the one stanza that says this adapter is installed.
 *
 * `target` is deliberately absent, so what the tests exercise is the default.
 *
 * The `adapter` import a real configuration carries is omitted. `getProvider` matches on
 * `adapterPath` and never awaits the import, and importing this adapter from the configuration this
 * adapter is reading would be a cycle through a module that top-level awaits.
 */

const config = {
  languages: {
    providers: [
      {
        adapterPath: '@genoacms/language-adapter-ts'
      }
    ]
  }
}

export default config
