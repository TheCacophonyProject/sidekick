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

const AppRoutes = () => {
	const [user] = useContext(UserContext)
	const navigate = useNavigate()
	createEffect(() => {
		navigate('/devices', { replace: true })
	})

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
			<Body class="h-[calc(100vh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] pb-safe pt-safe">
				<Suspense>
					<ErrorBoundary>
						<DeviceProvider>
							<UserProvider>
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
