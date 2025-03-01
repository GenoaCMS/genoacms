<script lang="ts">
  import Portal from '$lib/components/Portal.svelte'

  type Props = {
    opener: MouseEvent | null
  }
  const { opener = $bindable(null) }: Props = $props()
  let isOpen = $state(false)
  let style: string = $state('')
  let screenWidth: number = $state(0)
  let menuWidth: number = $state(0)
  let isOpening = $state(false)
  let closeTimer

  function open (event: MouseEvent | null) {
    if (!event) return
    event.preventDefault()
    clearTimeout(closeTimer)
    isOpening = true
    isOpen = true
    if (event.x + menuWidth > screenWidth) {
      style = `right: ${0}; top: ${event.y}px`
    } else {
      style = `left: ${event.x}px; top: ${event.y}px`
    }
    closeTimer = setTimeout(allowClosing, 100)
  }
  function close () {
    requestAnimationFrame(() => {
      if (isOpening) return
      isOpen = false
    })
  }
  function allowClosing () {
    isOpening = false
  }

  $effect(() => open(opener))
</script>

<svelte:window bind:innerWidth={screenWidth} onresize={close}/>
<svelte:body onclick={close} oncontextmenu={close}/>

{#if isOpen}
    <Portal>
        <div bind:clientWidth={menuWidth} class="absolute min-w-[8rem] w-auto bg-light dark:bg-dark shadow-lg border border-b-0 flex flex-col z-10"
             {style}>
            <div class="text-nowrap">
                <slot/>
            </div>
        </div>
    </Portal>
{/if}
