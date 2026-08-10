import { command } from '$app/server'
import { validator } from '@exodus/schemasafe'
import { componentEntryCreationSchema } from '$lib/script/components/componentEntry/component/schemas'
import { createComponentEntry } from '$lib/script/components/componentEntry/component.server'
import type { ComponentEntryCreation } from '$lib/script/components/componentEntry/component/types'

const validate = validator(componentEntryCreationSchema)

export const createComponent = command('unchecked', async (data: any) => {
    const isValid = validate(data)
    if (!isValid) return { status: 'fail', text: 'Invalid data' }

    const componentEntry = await createComponentEntry(data)
    return { status: 'success', text: 'Component created', uid: componentEntry.uid }
})
