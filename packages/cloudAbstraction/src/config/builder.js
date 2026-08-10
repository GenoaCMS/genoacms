import { rollup } from 'rollup'
import commonjs from '@rollup/plugin-commonjs'
import resolve from '@rollup/plugin-node-resolve'
import json from '@rollup/plugin-json'
import { configPath, configBundlePath } from './paths.js'

/**
  * @returns {Promise<void>}
  */
async function build () {
  const bundle = await rollup({
    input: configPath,
    plugins: [
      resolve({
        preferBuiltins: true,
        extensions: ['.mjs', '.js', '.json', '.node']
      }),
      commonjs(),
      json()
    ]
  })

  await bundle.generate({
    dir: configBundlePath,
    format: 'esm'
  })

  await bundle.write({
    dir: configBundlePath,
    format: 'esm'
  })
}

export default build
