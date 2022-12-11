// @refresh reload
import { createEffect, Show, Suspense, useContext } from "solid-js";
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
} from "solid-start";
import NavBar from "./components/NavBar";
import { UserContext, UserProvider } from "./contexts/User";
import "./root.css";
import Login from "./login";
import Header from "./components/Header";

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
	return (
		<Html lang="en">
			<Head>
				<Title>SolidStart - Bare</Title>
				<Meta charset="utf-8" />
				<Meta
					name="viewport"
					content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
				/>
			</Head>
			<Body class="h-[80vh]">
				<Suspense>
					<ErrorBoundary>
						<UserProvider>
							<AppRoutes />
						</UserProvider>
					</ErrorBoundary>
				</Suspense>
				<Scripts />
			</Body>
		</Html>
	);
}
