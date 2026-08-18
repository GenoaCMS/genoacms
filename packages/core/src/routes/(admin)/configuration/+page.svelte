<script lang="ts">
  import TopPanel from '$lib/components/TopPanel.svelte'
  import CardLink from '$lib/components/CardLink.svelte'
</script>

<div class="h-full flex flex-col">
    <TopPanel>
        <h1 class="text-2xl">
            Configuration
        </h1>
    </TopPanel>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-10 h-full content-center sm:p-5">
        <div class="aspect-square m-auto md:m-0 md:ms-auto w-2/3 sm:1/2 md:w-full 2xl:w-1/2">
            <CardLink href="/configuration/iam" icon="person-badge" text="Roles and access" />
        </div>
    </div>

</div>
