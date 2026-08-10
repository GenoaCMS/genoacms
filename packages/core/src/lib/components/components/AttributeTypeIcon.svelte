<script lang="ts">
  import type { AttributeType } from '$lib/script/components/componentEntry/component/types'
  import { getAttributeTypeIcon } from './utils'

  interface Props {
    type: AttributeType
  }
  const { type }: Props = $props()
  const icon = $derived(getAttributeTypeIcon(type))
</script>

<i class="bi bi-{icon.icon} text-{icon.color} text-2xl m-auto"></i>
