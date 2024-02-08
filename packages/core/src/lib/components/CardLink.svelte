<script lang="ts">
    export let icon: string
    export let text: string
    export let href: string
</script>

<a {href} on:contextmenu|preventDefault|stopPropagation {...$$restProps}>
    <div class="border border-dark border-opacity-30 aspect-square flex flex-col">
        <div class="flex-grow flex justify-center items-center">
<!--            <i class="bi bi-{icon}"></i>-->
            <img src={icon} alt="" class="w-2/5">
        </div>
        <div class="text-center border-t border-t-dark text-xl border-opacity-30 p-1 text-nowrap whitespace-nowrap truncate">
            {text}
        </div>
    </div>
</a>
