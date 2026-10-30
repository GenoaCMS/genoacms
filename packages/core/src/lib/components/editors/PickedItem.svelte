<script lang="ts">
  import { Button } from '#lib/components/ui/index.js'

  interface Props {
    icon: string
    title: string
    subtitle?: string
    href?: string
    onremove: () => void
  }
  const { icon, title, subtitle = '', href, onremove }: Props = $props()
</script>

<div class="flex items-center gap-3 rounded-container border border-surface-200-800 bg-surface-50-950 ps-3 pe-1.5 py-1.5">
  <i class="bi {icon} text-lg text-surface-600-400 shrink-0"></i>
  <div class="flex-1 min-w-0 leading-tight">
    <div class="truncate text-sm font-medium" {title}>{title}</div>
    {#if subtitle}
      <div class="truncate text-xs text-surface-600-400">{subtitle}</div>
    {/if}
  </div>
  {#if href}
    <Button {href} target="_blank" rel="noopener" aria-label="Open {title}" title="Open in a new tab"
      class="btn-icon btn-icon-sm text-surface-600-400 hover:preset-tonal">
      <i class="bi bi-box-arrow-up-right"></i>
    </Button>
  {/if}
  <button type="button" onclick={onremove} aria-label="Remove {title}" title="Remove"
    class="btn-icon btn-icon-sm text-surface-600-400 hover:preset-tonal-error">
    <i class="bi bi-x-lg"></i>
  </button>
</div>
