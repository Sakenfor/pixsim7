import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const process: any;

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const adminPort = Number(env.VITE_ADMIN_PORT || 8002);
	return {
		plugins: [sveltekit()],
		server: {
			port: adminPort,
			host: '0.0.0.0'
		}
	};
});
