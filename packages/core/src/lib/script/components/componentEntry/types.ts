import { Checkbox, Input, NumberInput } from 'flowbite-svelte'
import type { AttributeType } from '$lib/script/components/componentEntry/component/types'

interface InputConfig<T extends AttributeType> {
  label: string,
  formControl: typeof Checkbox | typeof Input | typeof NumberInput,
  props: {
    name: T,
    required: boolean,
    disabled: boolean
  },
  value: unknown
}

export type {
  InputConfig
}
