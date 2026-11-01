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
  aria-label={name}
  class="flex-1 basis-0 min-w-0 px-0.5 {isActive ? 'text-primary-600-400' : 'text-surface-600-400'}"
>
  <i class="bi bi-{icon} text-2xl"></i>
  <Navigation.TriggerText class="max-w-full truncate tracking-tight">{name}</Navigation.TriggerText>
</Navigation.TriggerAnchor>
