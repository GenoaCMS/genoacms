<script lang="ts">
  import { initialsOf } from '@genoacms/demo-support/site'
  import { ui } from '@genoacms/demo-support/ui'

  const { name, role, photo, talk }: { name: string, role: string, photo: string, talk: string } = $props()
</script>

<article class={ui.speaker}>
  {#if photo === ''}
    <div class={ui.speakerPhoto} aria-hidden="true">{initialsOf(name)}</div>
  {:else}
    <img class={ui.speakerPhoto} src={photo} alt={name} loading="lazy" />
  {/if}
  <div>
    <h3 class={ui.speakerName}>{name}</h3>
    <p class={ui.speakerRole}>{role}</p>
  </div>
  {#if talk !== ''}<p class={ui.speakerTalk}>{talk}</p>{/if}
</article>
