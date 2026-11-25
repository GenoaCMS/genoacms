<script lang="ts">
  import { initialsOf } from '@genoacms/demo-support/site'

  const { name, role, photo, talk }: { name: string, role: string, photo: string, talk: string } = $props()
</script>

<article class="site-speaker">
  {#if photo === ''}
    <div class="site-speaker__photo" aria-hidden="true">{initialsOf(name)}</div>
  {:else}
    <img class="site-speaker__photo" src={photo} alt={name} loading="lazy" />
  {/if}
  <div>
    <h3 class="site-speaker__name">{name}</h3>
    <p class="site-speaker__role">{role}</p>
  </div>
  {#if talk !== ''}<p class="site-speaker__talk">{talk}</p>{/if}
</article>
