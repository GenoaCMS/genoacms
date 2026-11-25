<script lang="ts">
  const { heading, lines, email, phone }: { heading: string, lines: string, email: string, phone: string } = $props()
</script>

<article class="site-contact">
  <h3 class="site-contact__heading">{heading}</h3>
  {#if lines !== ''}<p class="site-contact__lines">{lines}</p>{/if}
  {#if email !== ''}<a class="site-contact__link" href="mailto:{email}">{email}</a>{/if}
  {#if phone !== ''}<a class="site-contact__link" href="tel:{phone.replaceAll(' ', '')}">{phone}</a>{/if}
</article>
