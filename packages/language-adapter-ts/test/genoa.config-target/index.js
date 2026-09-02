/**
 * The same instance as `test/genoa.config`, with a target chosen.
 *
 * Two fixtures rather than one, because the two branches worth asserting are "the instance said
 * nothing" and "the instance said something", and the adapter reads its settings once when it loads.
 */

const config = {
  languages: {
    providers: [
      {
        adapterPath: '@genoacms/language-adapter-ts',
        target: 'es2022'
      }
    ]
  }
}

export default config
