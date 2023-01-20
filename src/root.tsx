// @refresh reload
import { createEffect, createSignal, Show, Suspense, useContext } from "solid-js";
import {
	A,
	Body,
	ErrorBoundary,
	FileRoutes,
	Head,
	Html,
	Meta,
	Routes,
	Scripts,
	Title,
	useNavigate,
} from "solid-start";
import NavBar from "./components/NavBar";
import { UserContext, UserProvider } from "./contexts/User";
import "./root.css";
import Login from "./login";
import Header from "./components/Header";
import { DeviceProvider } from "./contexts/Device";
import NotificationPopup from "./components/NotificationPopup";

const AppRoutes = () => {
	const [user] = useContext(UserContext)

	return (
		<Show when={user.isAuthorized || user.skippedLogin()} fallback={<Login />}>
			<Header />
			<Routes>
				<FileRoutes />
			</Routes>
			<NavBar />
		</Show>
	)
}

export default function Root() {
	const navigate = useNavigate()
	createEffect(() => {
		navigate('/devices', { replace: true })
	})
	return (
		<Html lang="en">
			<Head>
				<Title>SolidStart - Bare</Title>
				<Meta charset="utf-8" />
				<Meta
					name="viewport"
					content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
				/>
			</Head>
			{/* Center self */}
			<Body class="h-[calc(100vh-env(safe-area-inset-bottom)-env(safe-area-inset-top))] mb-safe mt-safe">
				<Suspense>
					<ErrorBoundary>
						<DeviceProvider>
							<UserProvider>
								<NotificationPopup />
								<AppRoutes />
							</UserProvider>
						</DeviceProvider>
					</ErrorBoundary>
				</Suspense>
				<Scripts />
			</Body>
		</Html>
	);
}
