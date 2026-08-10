<script lang="ts">
    import type { Snippet } from 'svelte'

    interface Props {
      class?: string;
      children?: Snippet;
      [key: string]: any;
    }

    const { class: className = '', children, ...rest }: Props = $props()
</script>

<label class="label {className}" {...rest}>
    <span class="label-text">
        {@render children?.()}
    </span>
</label>
