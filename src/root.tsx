// @refresh reload
import {
	createEffect,
	createSignal,
	ErrorBoundary,
	lazy,
	on,
	onMount,
	Show,
} from "solid-js";
import { Router, useNavigate, useRoutes } from "@solidjs/router";
import { Clipboard } from "@capacitor/clipboard";
import NavBar from "./components/NavBar";
import { UserProvider, useUserContext } from "./contexts/User";
import "./root.css";
import Login from "./login";
import { HeaderProvider, useHeaderContext } from "./components/Header";
import { DeviceProvider } from "./contexts/Device";
import { StorageProvider, useStorage } from "./contexts/Storage";
import NotificationPopup from "./components/NotificationPopup";
import { BiSolidCopyAlt } from "solid-icons/bi";
import { LogsProvider, useLogsContext } from "./contexts/LogsContext";
import { withSentryRouterRouting } from "@sentry/solid/solidrouter";
import ConsentPopup from "./components/ConsentPopup";
import BackgroundLogo from "./components/BackgroundLogo";
import { ImSpinner } from "solid-icons/im";
import { withSentryErrorBoundary } from "@sentry/solid";
import GroupAccessRequestPopup from "./components/GroupAccessRequestPopup";
import FlyweightChatManager from "./components/FlyweightChatManager";

const routes = [
	{
		path: "/devices",
		children: [
			{ path: "/", component: lazy(() => import("./routes/devices/index")) },
			{
				path: "/:id/*",
				component: lazy(() => import("./routes/devices/[...id]")),
			},
		],
	},
	{
		path: "/storage",
		children: [
			{ path: "/", component: lazy(() => import("./routes/storage")) },
			{
				path: "/recordings",
				component: lazy(() => import("./routes/storage/recordings")),
			},
		],
	},
	{
		path: "/manual",
		children: [{ path: "/", component: lazy(() => import("./routes/manual")) }],
	},
	{
		path: "/settings",
		children: [
			{ path: "/", component: lazy(() => import("./routes/settings")) },
			{
				path: "/user",
				component: lazy(() => import("./routes/settings/user")),
			},
		],
	},
];

function LoadingScreen() {
	return (
		<div class="fixed inset-0 z-50 flex h-full w-full flex-col items-center justify-center bg-gray-200">
			<BackgroundLogo />
			<div class="mt-8 flex flex-col items-center space-y-4">
				<ImSpinner size={32} class="animate-spin text-blue-500" />
				<span class="text-lg font-medium text-gray-700">
					Loading Sidekick...
				</span>
			</div>
		</div>
	);
}

const AppRoutes = () => {
	const log = useLogsContext();
	const navigate = useNavigate();
	const context = useUserContext();
	const headerContext = useHeaderContext();
	const Routes = useRoutes(routes);

	onMount(() => {
		log.logEvent("app_load");
		navigate("/devices", { replace: true });
	});

	createEffect(
		on(context.data, (user) => {
			if (user) {
				console.info("login", {
					user_id: user.id,
				});
			}
		}),
	);

	// Improved loading state check
	const isLoading = () => {
		return (
			context.data.loading ||
			context.skippedLogin.loading ||
			typeof context.data() === "undefined"
		);
	};

	// Show loading screen until we have definitive data
	return (
		<Show when={!isLoading()} fallback={<LoadingScreen />}>
			<Show
				when={context?.data() || context?.skippedLogin()}
				fallback={<Login />}
			>
				{headerContext?.HeaderElement()}
				<Routes />
				<NavBar />
			</Show>
		</Show>
	);
};
const writeToClipboard = async (err: unknown) => {
	await Clipboard.write({
		string: JSON.stringify(err),
	});
};
export default function Root() {
	const SentryRouter = withSentryRouterRouting(Router);
	const SentryErrorBoundary = withSentryErrorBoundary(ErrorBoundary);

	return (
		<main class="h-full min-h-screen bg-gray-200">
			<SentryRouter>
				<SentryErrorBoundary
					fallback={(err) => {
						console.trace(err);
						return (
							<div class="z-20 flex h-full w-screen flex-col items-center justify-center bg-white">
								<h1 class="text-2xl font-bold">Something went wrong</h1>
								<p class="text-lg">Please refresh the page</p>
								<p class="flex items-center text-center text-lg">
									Error:
									{err.message ?? "Couldn't get error message"}
								</p>
								<div class="flex items-center">
									<button
										class="flex items-center rounded-lg px-4 py-1 text-gray-700 shadow-md"
										onClick={() => writeToClipboard(err)}
									>
										<span>Copy</span>
										<BiSolidCopyAlt size={18} class="ml-1" />
									</button>
									<button
										class="flex items-center rounded-lg px-4 py-1 text-gray-700 shadow-md"
										onClick={() => window.location.reload()}
									>
										Reload
									</button>
								</div>
							</div>
						);
					}}
				>
					<HeaderProvider>
						<LogsProvider>
							<UserProvider>
								<StorageProvider>
									<DeviceProvider>
										<AppRoutes />
										<NotificationPopup />
										<ConsentPopup />
										<GroupAccessRequestPopup />
										<FlyweightChatManager />
									</DeviceProvider>
								</StorageProvider>
							</UserProvider>
						</LogsProvider>
					</HeaderProvider>
				</SentryErrorBoundary>
			</SentryRouter>
		</main>
	);
}
