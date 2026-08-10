import { Checkbox, Input, NumberInput } from '$lib/components/ui/index'
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
