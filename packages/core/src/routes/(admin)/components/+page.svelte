<script lang="ts">
  import TopPanel from '#lib/components/TopPanel.svelte'
  import CardLink from '#lib/components/CardLink.svelte'
</script>

<div class="h-full flex flex-col">
    <TopPanel>
        <h1 class="text-2xl">
            Components
        </h1>
    </TopPanel>

    <div class="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-10 p-4 md:p-5 md:h-full content-start md:content-center">
        <!-- In the order the work is done: a component is registered, then coded, then built into
             a page. -->
        <div class="aspect-square m-auto md:m-0 md:ms-auto w-full 2xl:w-1/2">
            <CardLink href="/components/registrar" icon="boxes" text="Component registrar" />
        </div>
        <div class="aspect-square m-auto w-full 2xl:w-1/2">
            <CardLink href="/components/editor" icon="code-square" text="Component editor" />
        </div>
        <div class="aspect-square m-auto md:m-0 md:me-auto w-full 2xl:w-1/2">
            <CardLink href="/components/pages" icon="grid-1x2" text="Build pages" />
        </div>
    </div>

</div>
