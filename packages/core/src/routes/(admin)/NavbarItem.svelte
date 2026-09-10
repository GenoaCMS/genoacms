<script lang="ts">
  import { Navigation } from '@skeletonlabs/skeleton-svelte'
  import { page } from '$app/state'

  interface Props {
    route: string
    name: string
    icon: string
  }

  const { route, name, icon }: Props = $props()
  const isActive = $derived(page.url.pathname.startsWith(route))
</script>

<Navigation.TriggerAnchor
  href={route}
  title={name}
  aria-label={name}
  class={isActive ? 'preset-filled-primary-500 hover:preset-filled-primary-500' : ''}
>
  <i class="bi bi-{icon} text-xl"></i>
  <Navigation.TriggerText>{name}</Navigation.TriggerText>
</Navigation.TriggerAnchor>

