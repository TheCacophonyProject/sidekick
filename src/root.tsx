// @refresh reload
import {
	createEffect,
	ErrorBoundary,
	lazy,
	Match,
	Show,
	Suspense,
} from "solid-js";
import { Router, useNavigate, useRoutes } from "@solidjs/router";
import { Clipboard } from "@capacitor/clipboard";
import NavBar from "./components/NavBar";
import { UserProvider, useUserContext } from "./contexts/User";
import "./root.css";
import Login from "./login";
import Header from "./components/Header";
import { DeviceProvider } from "./contexts/Device";
import { StorageProvider } from "./contexts/Storage";
import NotificationPopup from "./components/NotificationPopup";
import { BiSolidCopyAlt } from "solid-icons/bi";
import { FirebaseCrashlytics } from "@capacitor-community/firebase-crashlytics";
import BackgroundLogo from "./components/BackgroundLogo";

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
		<div class="flex items-center justify-center h-full w-full">
			<div class="flex flex-col items-center"></div>
		</div>
	);
}

const AppRoutes = () => {
	const navigate = useNavigate();
	createEffect(() => {
		navigate("/devices", { replace: true });
	});
	const context = useUserContext();
	const Routes = useRoutes(routes);
	return (
		<Show when={!context?.data.loading} fallback={<LoadingScreen />}>
			<Show
				when={context?.data() || context?.skippedLogin()}
				fallback={<Login />}
			>
				<Header />
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
	return (
		<main class="h-screen bg-gray-200">
			<Router>
				<ErrorBoundary
					fallback={(err) => {
						console.trace(err);
						if (err instanceof Error) {
							try {
								StackTrace.fromError(err).then((stacktrace) => {
									const message = err.message;
									FirebaseCrashlytics.recordException({
										message,
										stacktrace,
									});
								});
							} catch (e) {
								FirebaseCrashlytics.recordException({
									message: err.message,
								});
							}
						}
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
					<UserProvider>
						<StorageProvider>
							<DeviceProvider>
								<AppRoutes />
								<NotificationPopup />
							</DeviceProvider>
						</StorageProvider>
					</UserProvider>
				</ErrorBoundary>
			</Router>
		</main>
	);
}
