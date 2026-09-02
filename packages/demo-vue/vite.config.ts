import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
        import { artifactProxy } from '@genoacms/demo-support/server'

        /**
         * The same configuration in all four demos, differing only in the framework plugin.
         *
         * `artifactProxy` serves the instance's published documents to the browser out of its private
         * bucket. It verifies nothing — the browser does that — and it is shared rather than copied
         * because it carries the allowlist deciding what may leave the bucket, and four copies of a
         * guard is three that will drift.
         */
        export default defineConfig({
          plugins: [vue(), artifactProxy()],
          server: { port: 5183 }
        })
