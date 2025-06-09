import { sentryVitePlugin } from "@sentry/vite-plugin";
import { defineConfig, loadEnv } from "vite";
import solid from "vite-plugin-solid";
import path from "path";

export default defineConfig(({ mode }) => {
	// Load env file based on `mode` in the current working directory.
	const env = loadEnv(mode, process.cwd(), '');
	
	return {
	resolve: {
		alias: {
			"~": path.resolve(__dirname, "src"),
		},
	},
	build: {
		target: "esnext",
		sourcemap: true,
	},
	plugins: [
		solid(),
		sentryVitePlugin({
			org: "sentry",
			project: "sidekick",
			url: "https://sentry.crittergames.co.nz/",
			authToken: env.SENTRY_AUTH_TOKEN,
		}),
	],
	};
});
