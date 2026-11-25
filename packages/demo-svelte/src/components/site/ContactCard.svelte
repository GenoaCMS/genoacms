<script lang="ts">
  import { ui } from '@genoacms/demo-support/ui'

  const { heading, lines, email, phone }: { heading: string, lines: string, email: string, phone: string } = $props()
</script>

<article class={ui.contact}>
  <h3 class={ui.contactHeading}>{heading}</h3>
  {#if lines !== ''}<p class={ui.contactLines}>{lines}</p>{/if}
  {#if email !== ''}<a class={ui.contactLink} href="mailto:{email}">{email}</a>{/if}
  {#if phone !== ''}<a class={ui.contactLink} href="tel:{phone.replaceAll(' ', '')}">{phone}</a>{/if}
</article>
