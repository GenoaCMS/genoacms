<script>
	import { building } from '$app/env';
</script>

<h1>{building ? 'prerendered' : 'server-rendered'} a b</h1>
