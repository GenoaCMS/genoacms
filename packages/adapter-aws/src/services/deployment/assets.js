import { promisify } from 'util'
import { exec as execCb } from 'child_process'

const exec = promisify(execCb)

/**
  * @param {string} assetsPath - The path to the assets folder
  * @returns {Promise<void>}
  */
async function installAssetsDependencies (assetsPath) {
  await exec(`cd ${assetsPath} && npm i`)
}

export {
  installAssetsDependencies
}
