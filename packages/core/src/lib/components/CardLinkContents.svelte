<script lang="ts">
  type Props = {
    icon: string
    text: string
  }
  const { icon, text }: Props = $props()
</script>

<div class="border border-dark dark:border-light border-opacity-30
  aspect-square flex flex-col transition-all hover:scale-105 hover:shadow-lg">
    <div class="flex-grow flex justify-center items-center">
        <i class="bi bi-{icon} text-6xl"/>
    </div>
    <div class="text-center border-t border-t-dark dark:border-light text-xl border-opacity-30
    p-1 text-nowrap whitespace-nowrap truncate">
        {text}
    </div>
</div>
