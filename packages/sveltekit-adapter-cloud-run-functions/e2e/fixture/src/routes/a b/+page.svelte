<script>
	import { building } from '$app/environment';
</script>

<h1>{building ? 'prerendered' : 'server-rendered'} a b</h1>
