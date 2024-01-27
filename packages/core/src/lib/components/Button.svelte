<script lang="ts">
  let classes = ''
  export { classes as class }
</script>

<button class="p-1 border bg-light {classes}" on:click {...$$restProps}>
    <slot/>
</button>
