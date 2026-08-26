<script lang="ts">
  import { resolve } from '$app/paths'

  /**
   * What the page editor says when no component can be composed yet.
   *
   * **R3** means an empty picker is now an ordinary state rather than a fault: a component that has
   * been registered but never published cannot be put on a page. An empty list on its own reads as
   * a broken screen, and an author looking at one has no way to tell whether the CMS has lost their
   * components or is refusing them for a reason.
   *
   * So the state is stated, and it names the act that resolves it. The link goes to the registrar,
   * which is the single publication surface for both kinds — the same place the author registered
   * the component, so the route from the obstacle to the fix is one click and no searching.
   *
   * It does not list which components are unpublished. Doing so would put a second catalog in front
   * of an author who is trying to build a page, and the registrar already shows every component's
   * publication status beside its name — which is the place that answers "which one" properly.
   */
</script>

<div class="text-center p-5 space-y-2">
  <i class="bi bi-box-seam text-4xl opacity-60"></i>
  <p>No component has been published yet.</p>
  <p class="text-sm opacity-70">
    A page is built against a component's published description, so a component has to be published
    before it can be placed on one.
  </p>
  <a class="link" href={resolve('/components/registrar')}>
    Publish a component in the registrar
  </a>
</div>
