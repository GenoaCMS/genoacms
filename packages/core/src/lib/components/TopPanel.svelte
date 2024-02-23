<script lang="ts">
    export let hrefBack = '.'
</script>

<div class="sticky top-0 flex items-center bg-dark text-light p-3">
    <div class="flex-grow">
        <slot/>
    </div>
    <div class="flex h-full">
        <slot name="right"/>
    </div>
    <div class="aspect-square flex">
        <a href={hrefBack} on:click>
            <i class="bi bi-arrow-left-short text-5xl text-warning min-h-[2.5rem]"/>
        </a>
    </div>
</div>
