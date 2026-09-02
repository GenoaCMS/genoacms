/**
 * The one stanza that lets this package's tests compile a component.
 *
 * The SDK reads no configuration and never will — a consumer embeds it in an application that has
 * no `genoa.config` and no CMS. This exists for the **attack demonstration**, which compiles a
 * hostile component with the real language adapter rather than hand-writing an artifact and hoping
 * it resembles one. The adapter resolves its own settings through `getProvider`, so a configuration
 * has to exist somewhere for that call to answer.
 *
 * `target` is absent, so what is compiled is what the default emits.
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
