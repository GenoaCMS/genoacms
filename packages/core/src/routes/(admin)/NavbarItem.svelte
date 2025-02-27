<script lang="ts">
    import { Button } from 'flowbite-svelte'
    import { page } from '$app/state'

    interface Page {
        route: string
        name: string
        icon: string
    }
    const { route, name, icon }: Page = $props()
    const isActive = $derived(page.url.pathname.startsWith(route))
</script>

<Button href={route} outline color={'light'}
  class="block py-4 transition-all hover:scale-105 hover:shadow-lg m-2">
    <div class="flex items-center {isActive ? 'text-warning' : ''}">
        <i class="bi bi-{icon} text-2xl h-[2rem] mx-3"/>
        {name}
    </div>
</Button>
