<script lang="ts">
    export let route: string
    export let name: string
    export let icon: string
</script>

<a href={route} class="block py-4 transition-all hover:scale-105 hover:shadow-lg border m-2">
    <div class="flex items-center">
        <i class="bi bi-{icon} text-2xl h-[2rem] mx-3"/>
        {name}
    </div>
</a>
