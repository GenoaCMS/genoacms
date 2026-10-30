import { defineEnvVars } from '@sveltejs/kit/env'

export const variables = defineEnvVars({
  GENOACMS_BUCKET: { schema: (value) => value },
  GENOACMS_CREDENTIALS: { schema: (value) => value }
})
