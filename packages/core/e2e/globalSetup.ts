import { buildCore } from './server'
import { enabled } from './bucket'

/** Builds core once for every end-to-end file, which run one after another against its instance. */
export default function setup (): void {
  if (enabled) buildCore()
}
