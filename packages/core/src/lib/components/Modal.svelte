<script lang="ts">
  import { fade } from 'svelte/transition'

  export let isOpen = false
  const close = () => {
    isOpen = false
  }
  const handleKeypress = (event) => {
    if (event.key === 'Escape') {
      close()
    }
  }
</script>

<svelte:body on:keyup={handleKeypress}/>
{#if isOpen}
    <div class="fixed top-0 bottom-0 left-0 right-0 bg-dark/70 flex justify-center items-center text-dark" transition:fade|global={{ duration: 100 }}>
        <div class="bg-white min-w-[50%] min-h-[50%] max-h-full max-w-full flex-row overflow-y-auto"
             transition:fade|global={{ duration: 300 }}>
            <div class="flex">
                <div class="text-2xl text-center m-5 mx-auto">
                    <slot name="header"/>
                </div>
                <div class="flex justify-end">
                    <button on:click={close} class="text-5xl aspect-square flex items-center justify-center leading-none p-3">
                        &times;
                    </button>
                </div>
            </div>
            <slot/>
        </div>
    </div>
{/if}
