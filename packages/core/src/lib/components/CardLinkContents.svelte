<script lang="ts">
  export let icon: string
  export let text: string
</script>

<div class="border border-dark border-opacity-30 aspect-square flex flex-col">
    <div class="flex-grow flex justify-center items-center">
        <i class="bi bi-{icon} text-6xl"/>
    </div>
    <div class="text-center border-t border-t-dark text-xl border-opacity-30 p-1 text-nowrap whitespace-nowrap truncate">
        {text}
    </div>
</div>
