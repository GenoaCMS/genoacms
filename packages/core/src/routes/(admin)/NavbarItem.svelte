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

<Button preset="outlined" class="block py-4 px-4 lg:px-10 transition-all hover:scale-105 hover:shadow-lg m-2" href={route}>
    <div class="flex items-center {isActive ? 'text-warning-600' : ''}">
        <i class="bi bi-{icon} text-2xl h-[2rem] mx-3"></i>
        {name}
    </div>
</Button>
