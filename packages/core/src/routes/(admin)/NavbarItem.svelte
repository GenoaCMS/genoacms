<script lang="ts">
    import { Button, } from '$lib/components/ui/index'
    import { page } from '$app/state'

    interface Page {
      route: string
      name: string
      icon: string
    }
    const { route, name, icon }: Page = $props()
    const isActive = $derived(page.url.pathname.startsWith(route))
</script>

<Button
  preset={isActive ? 'filled' : 'outlined'}
  class="w-full flex items-center justify-start gap-3 py-3 px-4 transition-all {isActive ? 'shadow-xs' : 'hover:bg-surface-200-800/30'}"
  href={route}
>
  <i class="bi bi-{icon} text-xl"></i>
  <span class="font-medium text-sm">{name}</span>
</Button>
