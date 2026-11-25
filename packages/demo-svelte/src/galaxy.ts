import * as THREE from 'three'
import { createGalaxyStage } from '@genoacms/demo-support/galaxy'

/** One galaxy per page: the galaxy section draws it, and dynamic components draw into it. */
const galaxy = createGalaxyStage()

/**
 * What this application grants the CMS's dynamic components, beside their own values.
 *
 * Every component on the page receives it, and their code was signed by the CMS rather than reviewed
 * here, so it holds a rendering library and the galaxy scene, and nothing that reaches the network,
 * storage or the rest of the page.
 */
const passthrough = { THREE, galaxy }

export { galaxy, passthrough }
