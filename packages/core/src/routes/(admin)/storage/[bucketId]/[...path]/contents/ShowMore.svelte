<script lang="ts">
  import { Button } from '#lib/components/ui/index.js'

  type Props = {
    onclick: () => Promise<void>
  }
  const { onclick }: Props = $props()
  let isLoading = $state(false)

  async function showMore () {
    isLoading = true
    try {
      await onclick()
    } finally {
      isLoading = false
    }
  }
</script>

<!-- BRW-15 -->
<div class="flex justify-center p-4">
  <Button preset="tonal" onclick={showMore} disabled={isLoading}>Show more</Button>
</div>
