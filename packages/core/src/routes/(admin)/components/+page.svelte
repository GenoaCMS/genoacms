<script lang="ts">
  import TopPanel from '$lib/components/TopPanel.svelte'
  import CardLink from '$lib/components/CardLink.svelte'
</script>

<div class="h-full flex flex-col">
    <TopPanel>
        <h1 class="text-2xl">
            Components
        </h1>
    </TopPanel>

    <div class="flex-grow flex justify-around items-center">
        <div class="aspect-square w-1/4">
            <CardLink href="/components/pages" icon="grid-1x2" text="Build pages" />
        </div>
        <div class="aspect-square w-1/4">
            <CardLink href="/components/editor" icon="code-square" text="Component editor" />
        </div>
        <div class="aspect-square w-1/4">
            <CardLink href="/components/prebuilt" icon="boxes" text="Prebuilt components" />
        </div>
    </div>
<!--    <div class="flex-grow grid grid-cols-3 gap-40 px-40">-->
<!--        <div class="col-span-1 row-start-1 row-end-2">-->
<!--            <CardLink href="" icon="grid-1x2" text="Build pages" />-->
<!--        </div>-->
<!--        <div class="col-span-1 row-start-1 row-end-2">-->
<!--            <CardLink href="" icon="grid-1x2" text="Build pages" />-->
<!--        </div>-->
<!--        <div class="col-span-1 row-start-1 row-end-2">-->
<!--            <CardLink href="" icon="grid-1x2" text="Manage prebuilt components" />-->
<!--        </div>-->
<!--    </div>-->
</div>
