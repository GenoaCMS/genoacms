<script lang="ts">
  import { navigating } from '$app/state'
</script>

{#if navigating.to}
  <div class="navigation-progress fixed inset-x-0 top-0 z-[200] h-1 overflow-hidden" role="progressbar" aria-label="Loading">
    <div class="navigation-progress-bar h-full w-1/3 bg-primary-500"></div>
  </div>
{/if}

<style>
  .navigation-progress {
    animation: appear 0s linear 150ms both;
  }

  .navigation-progress-bar {
    animation: sweep 1.2s ease-in-out infinite;
  }

  @keyframes appear {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes sweep {
    from { transform: translateX(-100%); }
    to { transform: translateX(300%); }
  }

  @media (prefers-reduced-motion: reduce) {
    .navigation-progress-bar {
      animation: none;
      width: 100%;
    }
  }
</style>
