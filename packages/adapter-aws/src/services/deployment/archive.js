import { cwd } from 'process'
import archiver from 'archiver'
import { createWriteStream } from 'fs'
import { join } from 'path'

/**
  * @param {string} source
  * @param {string} assets
  * @param {string[]} injectPaths
  * @param {string} out
  * @returns {Promise<void>}
  */
async function createZip (source, assets, ignorePaths, out) {
  await new Promise((resolve, reject) => {
    const sourcePath = join(cwd(), source)
    const output = createWriteStream(out)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => {
      resolve()
    })

    archive.on('error', (err) => {
      reject(err)
    })

    archive.pipe(output)
    archive.glob('**', { cwd: sourcePath, ignore: ignorePaths })
    archive.glob('**', { cwd: assets })
    archive.finalize()
  })
}

export { createZip }
