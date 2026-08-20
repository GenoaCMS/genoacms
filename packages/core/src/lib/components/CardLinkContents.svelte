<script lang="ts">
  type Props = {
    icon: string,
    text: string,
    color?: string,
    noscale?: boolean
  }
  const { icon, text, color, noscale }: Props = $props()
</script>

<div class="card bg-surface-50-950 border border-surface-200-800
  aspect-square flex flex-col transition-all hover:shadow-lg hover:border-primary-500/50" class:hover:scale-105={!noscale} >
    <div class="flex-grow flex justify-center items-center {color ? `text-${color}` : 'text-surface-950-50'}">
        <i class="bi bi-{icon} text-6xl"></i>
    </div>
    <div class="text-center border-t border-surface-200-800 text-lg p-2 truncate font-medium text-surface-950-50">
        {text}
    </div>
</div>
