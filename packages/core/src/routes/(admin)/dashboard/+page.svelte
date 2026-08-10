<script lang="ts">
  import { activityTracker } from '$lib/script/activity/client'
  import { Button, DarkMode } from '$lib/components/ui/index'
  import ActivityRecord from './ActivityRecord.svelte'
  import Grid from '$lib/components/Grid.svelte'
  import Logout from '$lib/components/Logout.svelte'

  const { data } = $props()
</script>

<div class="p-9 border-b border-tertiary-200 w-full flex flex-wrap">
  <div>
    <h1 class="text-xl md:text-2xl m-2">
      Welcome {data.user.email}
    </h1>
  </div>
  <div class="ms-auto w-full md:w-auto flex items-center">
    <div class="block md:hidden me-2">
      <DarkMode />
    </div>
    <Button preset="outlined" href="https://genoacms.github.io/docs" target="_blank" class="w-full">
      Read the docs
    </Button>
    <div class="block md:hidden ms-2">
      <Logout />
    </div>
  </div>
</div>
<div class="p-9">
  <h2 class="text-2xl">
    Recent activity
  </h2>
  <Grid>
    {#each activityTracker.records as record}
      <ActivityRecord {record} />
    {/each}
  </Grid>
</div>
