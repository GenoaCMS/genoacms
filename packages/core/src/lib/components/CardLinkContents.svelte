<script lang="ts">
  type Props = {
    icon: string,
    text: string,
    noscale?: boolean
  }
  const { icon, text, noscale }: Props = $props()
</script>

<div class="border border-dark/30 dark:border-light
  aspect-square flex flex-col transition-all hover:shadow-lg" class:hover:scale-105={!noscale} >
    <div class="flex-grow flex justify-center items-center">
        <i class="bi bi-{icon} text-6xl"></i>
    </div>
    <div class="text-center border-t border-t-dark/30 dark:border-light text-xl border-opacity-30
    p-1 text-nowrap whitespace-nowrap truncate">
        {text}
    </div>
</div>
