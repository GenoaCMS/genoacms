<script lang="ts">
    export let value = undefined
    let classes = ''
    export { classes as class }
</script>

<input class="p-1 bg-light border border-dark {classes}" bind:value {...$$restProps}/>
