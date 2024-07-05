import esbuild from 'esbuild'
import { configPath, configBundlePath } from './paths'

const buildConfig = {
  entryPoints: [configPath],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: configBundlePath,
  external: [
    'fs', 'path', 'os', 'http', 'https', 'url', 'stream', 'crypto', 'buffer'
  ],
  loader: {
    '.json': 'json'
  },
  treeShaking: true
}

/**
  * @returns {Promise<void>}
  */
async function build () {
  try {
    await esbuild.build(buildConfig)
  } catch (e) {
    console.error('Building config failed: ', e)
    process.exit(1)
  }
}

export default build
