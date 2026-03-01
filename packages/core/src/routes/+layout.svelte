<script lang="ts">
  import type { Snippet } from 'svelte'
  import '../app.css'
  import 'bootstrap-icons/font/bootstrap-icons.css'
  import { toaster } from '$lib/script/alert.svelte'
  import { Toast } from '@skeletonlabs/skeleton-svelte'
  import PendingAlert from '$lib/components/PendingAlert.svelte'
  import ConfirmAlert from '$lib/components/ConfirmAlert.svelte'

  interface Props {
    children?: Snippet;
  }
  const { children }: Props = $props()
</script>

{@render children?.()}

<PendingAlert />
<ConfirmAlert />

<Toast.Group {toaster}>
  {#snippet children(toast)}
    <Toast {toast}>
      <Toast.Message>
        <Toast.Title>{toast.title}</Toast.Title>
        <Toast.Description>{toast.description}</Toast.Description>
      </Toast.Message>
      <Toast.CloseTrigger />
    </Toast>
  {/snippet}
</Toast.Group>

<div
  class="text-amber-600
  text-amber-500
  text-cyan-500
  text-cyan-600
  text-green-500
  text-blue-500
  text-lime-500
  text-sky-500"
  hidden
></div>
