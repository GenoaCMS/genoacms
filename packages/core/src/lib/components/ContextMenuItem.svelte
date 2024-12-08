<script lang="ts">
  type Props = {
    onclick: () => void
  }
  const { onclick, ...restProps }: Props = $props()
</script>

<button {onclick} class="w-full border-b p-2" {...restProps}>
    <slot/>
</button>
