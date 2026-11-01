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
  grid h-full before:content-[''] before:col-start-1 before:row-start-1 before:self-start before:aspect-square
  transition-all hover:shadow-lg hover:border-primary-500/50" class:hover:scale-105={!noscale} >
    <div class="col-start-1 row-start-1 flex flex-col">
        <div class="flex-grow min-h-[4.5rem] flex justify-center items-center {color ? `text-${color}` : 'text-surface-950-50'}">
            <i class="bi bi-{icon} text-6xl" aria-hidden="true"></i>
        </div>
        <div class="text-center border-t border-surface-200-800 text-base sm:text-lg p-2 [overflow-wrap:anywhere] font-medium text-surface-950-50">
            {text}
        </div>
    </div>
</div>
