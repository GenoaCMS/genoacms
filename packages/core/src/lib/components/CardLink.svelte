<script lang="ts">
    export let icon: string
    export let text: string
    export let href: string
</script>

<a {href}>
    <div class="border border-dark aspect-square flex flex-col">
        <div class="flex-grow flex justify-center items-center">
<!--            <i class="bi bi-{icon}"></i>-->
            <img src={icon} alt="" class="w-2/5">
        </div>
        <div class="text-center border-t text-3xl">
            {text}
        </div>
    </div>
</a>
