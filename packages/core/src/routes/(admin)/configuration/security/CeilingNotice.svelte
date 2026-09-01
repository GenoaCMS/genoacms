<script lang="ts">
  /**
   * What changing a ceiling does not do.
   *
   * Without this an administrator lowering a ceiling would reasonably believe every component on
   * every page had just come under it. A ceiling is compiled into a component when it is published
   * and covered by that publication's signature, so it cannot be changed from here afterwards.
   */
</script>

<aside class="rounded border border-amber-400 bg-amber-50 dark:bg-amber-950 p-4 text-sm space-y-2">
  <p class="font-semibold">Changes apply only to newly published components.</p>
  <p>
    Components are compiled and signed with the limits active at publication time. Existing
    components keep their current limits until they are re-published.
  </p>
</aside>
