import { App } from "@capacitor/app";
import { createContextProvider } from "@solid-primitives/context";
import { ReactiveMap } from "@solid-primitives/map";
import { A, useLocation, useNavigate } from "@solidjs/router";
import {
	RiArrowsArrowLeftSLine,
	RiCommunicationChat1Fill,
} from "solid-icons/ri";
import { type JSXElement, createEffect, createSignal, onMount } from "solid-js";
import { toggleFlyweightChat } from "./FlyweightChatManager";

type Header = string;
type BackLink = string;
type HeaderButton = () => JSXElement;
export const [HeaderProvider, useHeaderContext] = createContextProvider(() => {
	const headerMap = new ReactiveMap<string, [Header, HeaderButton?, BackLink?]>(
		[
			["/", ["Devices"]],
			["/devices", ["Devices"]],
			["/storage", ["Storage"]],
			["/storage/recordings", ["Uploaded"]],
			["/settings", ["Settings"]],
			["/settings/user", ["User"]],
			[
				"/manual",
				[
					"Manual",
					() => {
						return (
							<button
								onClick={() => toggleFlyweightChat(true)}
								class="flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-white shadow-md transition-all hover:bg-blue-600 hover:shadow-lg active:scale-95 sm:px-4"
								aria-label="Open Chat Assistant"
							>
								<RiCommunicationChat1Fill size={24} />
								<span class="hidden font-medium sm:inline">Ask for Help</span>
								<span class="font-medium sm:hidden">Help</span>
							</button>
						);
					},
				],
			],
		],
	);
	const location = useLocation();
	const [HeaderButton, setHeaderButton] = createSignal<HeaderButton>();
	const [header, setHeader] = createSignal<string>(
		headerMap.get(location.pathname)?.[0] ?? "Dashboard",
	);
	const [backNav, setBackNav] = createSignal<JSXElement>();
	const navigate = useNavigate();
	const [link, setLink] = createSignal("");
	onMount(() => {
		const backButtonListener = () => {
			navigate(link());
		};
		App.addListener("backButton", backButtonListener);
		return () => {
			App.removeAllListeners();
		};
	});
	createEffect(() => {
		if (headerMap.has(location.pathname)) {
			const newHeader = headerMap.get(location.pathname) ?? ["Dashboard"];
			setHeaderButton(() => newHeader[1]);
			setHeader(newHeader[0]);
			const newLink = newHeader[2];
			if (newLink) {
				setLink(newLink);
				setBackNav(
					<A href={link()} class="flex items-center text-xl text-blue-500">
						<RiArrowsArrowLeftSLine size={32} />
					</A>,
				);
			} else {
				const link = location.pathname.split("/").slice(0, -1);
				if (link.length > 1) {
					setBackNav(
						<A
							href={link.join("/")}
							class="flex items-center text-xl text-blue-500"
						>
							<RiArrowsArrowLeftSLine size={32} />
						</A>,
					);
					const navigationPath = link.join("/");
					const backButtonListener = () => {
						navigate(navigationPath);
					};
					App.addListener("backButton", backButtonListener);
				} else {
					setBackNav();
					const pathToCheck = location.pathname;
					const backButtonListener = () => {
						if (pathToCheck !== "/devices") {
							navigate("/devices");
						} else {
							App.exitApp();
						}
					};
					App.addListener("backButton", backButtonListener);
				}
			}
		} else {
			setHeader("");
		}
	});
	const HeaderElement = () => (
		<div class="pt-safe fixed top-0 z-30 flex w-screen items-center justify-between bg-white px-2 pb-3">
			<div class="flex items-center">
				<div class="flex w-6 items-center justify-center">{backNav()}</div>
				<h2 class="text-4xl font-bold text-gray-800">{header()}</h2>
			</div>
			{HeaderButton()?.()}
		</div>
	);
	return { headerMap, HeaderElement };
});
