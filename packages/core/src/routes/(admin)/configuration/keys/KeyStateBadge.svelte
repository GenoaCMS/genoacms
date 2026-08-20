<script lang="ts">
  import { stateBadge } from './keyPresentation'
  import type { KeyState } from '$lib/script/signing/keyAdministration'

  interface Props {
    state: KeyState
  }
  const { state }: Props = $props()

  const badge = $derived(stateBadge(state))
</script>

<span
  class="text-xs px-2 py-0.5 rounded border whitespace-nowrap {badge.classes}"
  title={badge.title}
>
  {badge.label}
</span>
