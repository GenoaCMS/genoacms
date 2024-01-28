<script lang="ts">
  import Portal from '$lib/components/Portal.svelte'

  export let opener: MouseEvent | null = null
  let isOpen = false
  let style: string
  let screenWidth: number
  let menuWidth: number

  const open = (event: MouseEvent | null) => {
    if (event) {
      isOpen = true
      if (event.x + menuWidth > screenWidth) {
        style = `right: ${0}; top: ${event.y}px`
      } else {
        style = `left: ${event.x}px; top: ${event.y}px`
      }
    }
  }
  const close = () => {
    requestAnimationFrame(() => {
      isOpen = false
    })
  }

  $: open(opener)
</script>

<svelte:window bind:innerWidth={screenWidth} on:resize={close}/>
<svelte:body on:click={close} on:contextmenu|preventDefault={close}/>

{#if isOpen}
    <Portal>
        <div bind:clientWidth={menuWidth} class="absolute min-w-[8rem] w-auto bg-light shadow-lg border border-b-0 flex flex-col"
             {style}>
            <div class="text-nowrap">
                <slot/>
            </div>
        </div>
    </Portal>
{/if}
