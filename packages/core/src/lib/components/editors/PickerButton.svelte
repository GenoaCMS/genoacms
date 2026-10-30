<script lang="ts">
  import { Button } from '#lib/components/ui/index.js'

  interface Props {
    href: string
    label: string
    icon: string
    onclear?: () => void
  }
  const { href, label, icon, onclear }: Props = $props()
</script>

<div class="flex items-center gap-2">
  <Button {href} target="_blank" rel="noopener"
    class="flex-1 border border-dashed border-surface-300-700 text-surface-700-300 hover:preset-tonal-primary hover:border-primary-500">
    <i class="bi {icon}"></i>
    <span>{label}</span>
    <i class="bi bi-box-arrow-up-right text-xs opacity-60" aria-hidden="true"></i>
  </Button>
  {#if onclear}
    <button type="button" onclick={onclear} class="btn preset-tonal hover:preset-tonal-error">
      Clear all
    </button>
  {/if}
</div>
