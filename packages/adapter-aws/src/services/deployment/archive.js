import { cwd } from 'process'
import archiver from 'archiver'
import { createWriteStream } from 'fs'
import { basename, join } from 'path'

/**
  * @param {string} source
  * @param {string[]} injectPaths
  * @param {string} out
  * @returns {Promise<void>}
  */
async function createZip (source, injectPaths, out) {
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
    archive.directory(sourcePath, '')
    for (const path of injectPaths) {
      archive.file(path, { name: basename(path) })
    }
    archive.finalize()
  })
}

export { createZip }
