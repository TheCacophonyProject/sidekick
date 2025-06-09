import { Dialog as Prompt } from "@capacitor/dialog";
import { A, useSearchParams } from "@solidjs/router";
import {
	BiRegularNoSignal,
	BiRegularSave,
	BiRegularSignal1,
	BiRegularSignal2,
	BiRegularSignal3,
	BiRegularSignal4,
	BiRegularSignal5,
} from "solid-icons/bi";
import { BsWifiOff, BsWifi1, BsWifi2, BsWifi } from "solid-icons/bs";
import {
	FaRegularEye,
	FaRegularEyeSlash,
	FaSolidCheck,
	FaSolidLock,
	FaSolidLockOpen,
	FaSolidPlus,
	FaSolidSpinner,
} from "solid-icons/fa";
import { ImCog, ImCross } from "solid-icons/im";
import {
	For,
	Match,
	Show,
	Switch,
	createEffect,
	createResource,
	createSignal,
	on,
	onCleanup,
	onMount,
} from "solid-js";
import { Portal } from "solid-js/web";
import FieldWrapper from "~/components/Field";
import type { DeviceId, WifiNetwork } from "~/contexts/Device";
import { useDevice } from "~/contexts/Device";
import { useLogsContext } from "~/contexts/LogsContext";

type SettingProps = { deviceId: DeviceId };

export function WifiSettingsTab(props: SettingProps) {
	const context = useDevice();
	const log = useLogsContext();
	const id = () => props.deviceId;
	const device = () => context.devices.get(id());
	const [initialLoad, setInitialLoad] = createSignal(false);
	const [wifiNetworks, { refetch: refetchWifiNetowrks }] = createResource(
		() => [device(), context.apState()] as const,
		async ([currDevice]) => {
			try {
				console.log("Fetching Wifi Networks for ", currDevice);
				if (!currDevice?.isConnected) return null;
				const wifiNetworks = await context.getWifiNetworks(currDevice.id);
				return wifiNetworks;
			} catch (e) {
				console.error("Failed wifi networks", e);
			} finally {
				setInitialLoad(true);
			}
		},
	);
	const [currentWifi, { refetch }] = createResource(
		() => [device()],
		async () => context.getCurrentWifiNetwork(device()?.id ?? ""),
	);

	// Modem is now turned on automatically when device is discovered
	// const [turnedOnModem] = createResource(async () => {
	// 	const res = await context.turnOnModem(id());
	// 	return res;
	// });

	const [savedWifi, { refetch: refetchSavedWifi }] = createResource(
		async () => {
			const saved = await context.getSavedWifiNetworks(device()?.id ?? "");
			console.log(saved);
			return saved;
		},
	);
	const [password, setPassword] = createSignal("");
	const [apn, setAPN] = createSignal("");

	const getWifiIcon = (signal: number) => (
		<Switch>
			<Match when={signal <= 0}>
				<BsWifiOff size={28} />
			</Match>
			<Match when={signal < 34}>
				<BsWifi1 size={28} />
			</Match>
			<Match when={signal < 67}>
				<BsWifi2 size={28} />
			</Match>
			<Match when={signal >= 67}>
				<BsWifi size={28} />
			</Match>
		</Switch>
	);

	const sortWifi = (a: WifiNetwork, b: WifiNetwork) => {
		if (currentWifi()?.SSID === a.SSID) return -1;
		if (a.quality > b.quality) return -1;
		if (a.quality < b.quality) return 1;
		return 0;
	};

	const [openedNetwork, setOpenedNetwork] = createSignal<{
		SSID: string;
		quality: number;
		isSecured: boolean;
	} | null>(null);
	const [errorConnecting, setErrorConnecting] = createSignal<string | null>(
		null,
	);

	const [openedModem, setOpenedModem] = createSignal<boolean>();

	const [connecting, setConnecting] = createSignal<null | string>(null);
	createEffect(
		on(connecting, (ssid) => {
			const currDevice = device();
			if (currDevice) {
				if (ssid) {
					context.devicesConnectingToWifi.set(currDevice.id, ssid !== null);
				} else {
					context.devicesConnectingToWifi.delete(currDevice.id);
				}
			}
		}),
	);
	const connectToWifi = async () => {
		setErrorConnecting(null);
		const wifi = openedNetwork();
		if (!wifi) return;
		setConnecting(wifi.SSID);
		const res = await context.connectToWifi(id(), wifi.SSID, password());
		setConnecting(null);
		if (res) {
			setPassword("");
			setOpenedNetwork(null);
		} else {
			log.logEvent("Failed to connect to wifi");
			setErrorConnecting("Could not connect to wifi. Please try again.");
			setTimeout(() => {
				context.devicesConnectingToWifi.delete(device()?.id);
			}, 5000);
		}
		context.searchDevice();
		refetch();
	};
	createEffect(() => {
		on(context.apState, () => {
			if (!connecting()) {
				refetch();
			}
		});
	});

	// This state is used when a person disconnects from wifi
	const [disconnected, setDisconnected] = createSignal(false);

	createEffect(() => {
		const state = context.apState();
		if (state === "connected") {
			setDisconnected(false);
		}
	});

	const [params, setSearchParams] = useSearchParams();

	createEffect(() => {
		if (!disconnected() && !connecting() && !(device()?.isConnected ?? false)) {
			// remove
			setSearchParams({
				deviceSettings: null,
			});
		}
	});
	const disconnectFromWifi = async () => {
		setErrorConnecting(null);
		const res = await context.disconnectFromWifi(id());
		refetch();
		if (res) {
			setDisconnected(true);
		} else {
			setErrorConnecting("Could not disconnect from wifi.\n Please try again.");
		}
		context.searchDevice();
	};

	const forgetWifi = async (ssid: string) => {
		setErrorConnecting(null);
		const res = await context.forgetWifi(id(), ssid);
		if (res) {
			if (currentWifi()?.SSID === ssid) {
				refetch();
				setDisconnected(true);
			}
		} else {
			setErrorConnecting("Could not forget wifi. Please try again.");
		}
	};

	let inputRef: HTMLInputElement | undefined;
	const [showPassword, setShowPassword] = createSignal(false);
	createEffect(() => {
		on(
			() => showPassword(),
			() => {
				inputRef?.focus();
			},
		);
	});

	createEffect(() => {
		on(wifiNetworks, () => {
			if (!initialLoad()) return;
			if (wifiNetworks() === null || wifiNetworks.error) {
				refetchWifiNetowrks();
			}
		});
	});

	// Interval check for current wifi and background refresh
	onMount(() => {
		const interval = setInterval(() => {
			if (!initialLoad()) return;

			// Background refresh of network data (stale-while-revalidate)
			// This updates caches with fresh data while UI continues showing cached data
			context.backgroundRefreshNetworkData(id());

			// Still refetch SolidJS resources to trigger reactivity when cache updates
			if (!wifiNetworks.loading) {
				refetchWifiNetowrks();
			}
			if (!currentWifi.loading) {
				refetchSavedWifi();
			}
			if (!modem.loading) {
				refetchModem();
			}
			if (!currentWifi.loading) {
				refetch();
			}
		}, 10000);
		onCleanup(() => clearInterval(interval));
	});

	const [wifiConnectedToInternet] = createResource(
		() => [currentWifi()],
		async ([wifi]) => {
			if (!wifi) return "no-wifi";
			setErrorConnecting(null);
			const res = await context.checkDeviceWifiInternetConnection(id());
			return res ? "connected" : "disconnected";
		},
	);

	const [modem, { refetch: refetchModem }] = createResource(async () => {
		try {
			const res = await context.getModem(id());
			console.log("MODEM", res);
			return res;
		} catch (error) {
			console.log(error);
		}
	});

	const [modemSignal] = createResource(async () => {
		try {
			const res = await context.getModemSignalStrength(id());
			console.log("modem signal", res);
			if (res === null) return null;
			if (typeof res === "number") return res / 5;
			return Number.parseInt(res.signal?.strength ?? "0") / 30;
		} catch (error) {
			console.log(error);
		}
	});

	const modemSignalStrength = () => {
		const currModem = modem();
		const currSignal = modemSignal();
		if (currModem === null && currSignal === null) return null;

		let signalStrength = null;

		// Try to get the signal strength from currModem
		if (currModem?.signal?.strength) {
			const signal = Number.parseInt(currModem.signal.strength);
			if (signal !== 99) {
				signalStrength = signal;
			}
		}

		// If currSignal is available, use it
		if (signalStrength === null && currSignal !== null && currSignal !== undefined) {
			signalStrength = currSignal;
		}

		// Handle unknown signal strength
		if (signalStrength === null || signalStrength === 99) {
			return null; // Signal strength is unknown
		}

		// Normalize the signal strength (ASU value from 0 to 31)
		const normalizedSignal = signalStrength / 31;

		// Ensure the normalized value is between 0 and 1
		return Math.min(Math.max(normalizedSignal, 0), 1);
	};

	const noSim = () => {
		const currModem = modem();
		return (
			currModem?.failedToFindSimCard ??
			currModem?.simCard?.simCardStatus?.includes("not inserted") ??
			false
		);
	};

	const [modemConnectedToInternet] = createResource(
		() => [modemSignalStrength()],
		async ([currModem]) => {
			if (!currModem) return "disconnected";
			const res = await context.checkDeviceModemInternetConnection(id());
			return res ? "connected" : "disconnected";
		},
	);

	const [hasNetworkEndpoints, { refetch: refetchHasNetworkEndpoints }] =
		createResource<boolean>(async () => {
			const hasEndpoint = await context.hasNetworkEndpoints(id());
			return hasEndpoint;
		});
	createEffect(() => {
		if (device()?.isConnected) {
			refetchHasNetworkEndpoints();
		}
		console.log("HAS END BOOL", hasNetworkEndpoints());
	});

	const LinkToNetwork = () => (
		<div class="flex w-full items-center justify-center py-2 text-lg text-blue-500">
			<A href={`/devices/${id()}/wifi-networks`}>Open Network Settings</A>
		</div>
	);

	const isSaved = (ssid: string) => {
		const saved = savedWifi();
		return saved?.includes(ssid);
	};
	const [showSaveNetwork, setShowSaveNetwork] = createSignal(false);
	const [ssid, setSsid] = createSignal("");
	type SaveState = "saving" | "saved" | "error" | null;
	const [saving, setSaving] = createSignal<SaveState>(null);
	const saveWifi = async () => {
		try {
			setSaving("saving");
			const res = await context.saveWifiNetwork(id(), ssid(), password());
			if (res) {
				setSaving("saved");
				refetchSavedWifi();
			} else {
				setSaving("error");
			}
			setTimeout(() => {
				setSaving(null);
			}, 3000);
		} catch (error) {
			console.log(error);
		}
	};
	const saveAPN = async () => {
		try {
			setSavingModem("saving");
			const res = await context.saveAPN(id(), apn());
			if (res) {
				setSaving("saved");
				setTimeout(() => {
					setOpenedModem(false);
				}, 2000);
			} else {
				setSaving("error");
			}
			refetchModem();
		} catch (error) {
			console.log("");
		}
	};

	const [savingModem, setSavingModem] = createSignal<SaveState>(null);

	createEffect(
		on(
			() => [modem, currentWifi] as const,
			([modem, wifi]) => {
				if (!modem.loading && !wifi.loading) {
					log.logEvent("device_connection", {
						wifi: wifi()?.SSID ? "connected" : "disconnected",
						modem: noSim() ? "no-sim" : modemConnectedToInternet(),
					});
				}
			},
		),
	);

	createEffect(() => {
		console.log(
			"Loading Wifi && Modem",
			wifiNetworks(),
			initialLoad(),
		);
	});

	const disableConnect = (ssid: string) =>
		(showPassword() && password().length < 8) || connecting() === ssid;
	const hasApn = () => modem()?.modem?.apn !== undefined;
	const [isForgetting, setIsForgetting] = createSignal<boolean>(false);

	return (
		<div class="flex w-full flex-col space-y-2 px-2 py-2">
			<Show
				when={hasNetworkEndpoints() === undefined}
				fallback={
					<Show when={hasNetworkEndpoints()} fallback={LinkToNetwork()}>
						<button
							class="relative w-full space-y-2 pt-2"
							onClick={() => {
								if (!hasApn()) return;
								setOpenedModem(true);
							}}
						>
							<FieldWrapper
								type="custom"
								title={
									<div class="flex items-center justify-center gap-x-2">
										<div
											classList={{
												"bg-yellow-300": modemConnectedToInternet.loading,
												"bg-green-500":
													modemConnectedToInternet() === "connected",
												"bg-red-500":
													modemConnectedToInternet() === "disconnected",
											}}
											class="h-2 w-2 rounded-full transition-colors"
										/>
										<p>Modem</p>
									</div>
								}
							>
								<div class="space-between flex h-full w-full items-center justify-between p-2 text-xs">
									<Switch>
										<Match when={modem.loading}>
											<FaSolidSpinner class="animate-spin" />
										</Match>
										<Match when={noSim()}>
											<p>No Sim Card</p>
										</Match>
										<Match when={modem()?.simCard?.simCardStatus === "finding"}>
											<p>Checking Sim</p>
										</Match>
										<Match
											when={modem.loading || modemConnectedToInternet.loading}
										>
											<p>Checking Connection</p>
										</Match>
										<Match
											when={
												modem()?.failedToFindModem
											}
										>
											<p>No Modem Connection</p>
										</Match>
										<Match when={modemConnectedToInternet() === "connected"}>
											<p>Internet Connection</p>
										</Match>
										<Match when={modemConnectedToInternet() === "disconnected"}>
											<p>No Mobile Data</p>
										</Match>
									</Switch>
									<div class="flex gap-x-2">
										<Show when={modemSignalStrength()}>
											{(modem) => (
												<Switch>
													<Match when={modem() <= 0.2}>
														<BiRegularSignal1 size={28} />
													</Match>
													<Match when={modem() <= 0.4}>
														<BiRegularSignal2 size={28} />
													</Match>
													<Match when={modem() <= 0.6}>
														<BiRegularSignal3 size={28} />
													</Match>
													<Match when={modem() <= 0.8}>
														<BiRegularSignal4 size={28} />
													</Match>
													<Match when={modem() <= 1}>
														<BiRegularSignal5 size={28} />
													</Match>
												</Switch>
											)}
										</Show>
										<Show when={modemSignalStrength() === null}>
											<BiRegularNoSignal size={28} />
										</Show>
									</div>
									<Show when={hasApn()}>
										<ImCog size={18} />
									</Show>
								</div>
							</FieldWrapper>
							<FieldWrapper
								type="custom"
								title={
									<div class="flex items-center justify-center gap-x-2 text-xs">
										<div
											classList={{
												"bg-yellow-300": wifiConnectedToInternet.loading,
												"bg-gray-400": wifiConnectedToInternet() === "no-wifi",
												"bg-green-500":
													wifiConnectedToInternet() === "connected",
												"bg-red-500":
													wifiConnectedToInternet() === "disconnected",
											}}
											class="h-2 w-2 rounded-full transition-colors"
										/>
										<p>WiFi</p>
									</div>
								}
							>
								<div class="flex h-full w-full items-center justify-between p-2">
									<p>
										{currentWifi()?.SSID !== "" ? currentWifi()?.SSID : "-"}
									</p>
								</div>
							</FieldWrapper>
						</button>
						<section class="flex h-32 flex-col space-y-2 overflow-y-auto rounded-md bg-neutral-100 p-2">
							<Show when={wifiNetworks.loading && wifiNetworks() === undefined}>
								<div class="flex h-full w-full flex-col items-center justify-center">
									<FaSolidSpinner size={28} class="animate-spin" />
									<p>Loading Networks...</p>
								</div>
							</Show>
							<For each={wifiNetworks()?.sort(sortWifi)}>
								{(val) => (
									<button
										classList={{
											"bg-white": currentWifi()?.SSID === val.SSID,
											"bg-gray-50": currentWifi()?.SSID !== val.SSID,
										}}
										class="flex w-full items-center justify-between rounded-md px-4 py-4"
										onClick={() => setOpenedNetwork(val)}
									>
										<div class="flex space-x-2">
											{getWifiIcon(val.quality)}
											<div class="flex flex-col items-start justify-center">
												<p class="text-start text-slate-900">{val.SSID}</p>
												<div class=" flex gap-x-1 text-xs text-slate-600">
													<Show when={val.SSID === currentWifi()?.SSID}>
														<Switch>
															<Match
																when={wifiConnectedToInternet() === "connected"}
															>
																<p>Internet Connection</p>
															</Match>
															<Match
																when={
																	wifiConnectedToInternet() === "disconnected"
																}
															>
																<p>No Internet Connection</p>
															</Match>
														</Switch>
													</Show>
													<Show
														when={
															val.SSID === currentWifi()?.SSID &&
															isSaved(val.SSID)
														}
													>
														<p>|</p>
													</Show>
													<Show when={isSaved(val.SSID)}>
														<p>Saved</p>
													</Show>
												</div>
											</div>
										</div>
										<Show when={val.SSID !== currentWifi()?.SSID}>
											<Show when={val.isSecured} fallback={<FaSolidLockOpen />}>
												<div class="text-gray-800">
													<FaSolidLock />
												</div>
											</Show>
										</Show>
									</button>
								)}
							</For>
							<For
								each={savedWifi()?.filter(
									(val) =>
										val !== "" &&
										val !== currentWifi()?.SSID &&
										!wifiNetworks()?.some((wifi) => wifi.SSID === val) &&
										val.toLowerCase() !== "bushnet",
								)}
							>
								{(val) => (
									<button
										class="flex w-full items-center justify-between rounded-md bg-gray-50 px-4 py-4"
										onClick={() =>
											setOpenedNetwork({
												SSID: val,
												quality: 0,
												isSecured: false,
											})
										}
									>
										<div class="flex space-x-2 text-gray-600">
											<BiRegularSave size={28} />
											<div class="flex flex-col items-start justify-center">
												<p class="text-start text-slate-900">{val}</p>
											</div>
										</div>
									</button>
								)}
							</For>
						</section>
						<section>
							<button
								onClick={() => setShowSaveNetwork(true)}
								class="text-md flex w-full items-center justify-center space-x-2 pb-3 pt-3 text-blue-700"
							>
								<p>Add Network</p>
								<FaSolidPlus size={16} />
							</button>
						</section>
					</Show>
				}
			>
				<div>
					<div class="flex w-full items-center justify-center">
						<FaSolidSpinner size={28} class="animate-spin" />
					</div>
				</div>
			</Show>
			<Portal>
				<Show when={openedModem()}>
					<div class="fixed left-1/2 top-1/2 z-40 h-auto w-11/12 -translate-x-1/2 -translate-y-1/2 transform rounded-xl border bg-white px-3 py-4  shadow-lg">
						<div class="flex justify-between px-4 pb-2">
							<div class="flex items-center space-x-4">
								<h1 class="text-lg text-neutral-800">Modem Settings</h1>
							</div>
							<button
								onClick={() => {
									setOpenedModem(false);
								}}
								class="p-2 text-gray-500"
							>
								<ImCross size={12} />
							</button>
						</div>
						<h1 class="text-md pb-2 pl-2 text-gray-800">Access Point Name</h1>
						<div class="flex gap-x-2">
							<input
								class="w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
								type="text"
								ref={inputRef}
								autocapitalize="none"
								autocorrect="off"
								placeholder={modem()?.modem?.apn ?? ""}
								value={apn()}
								onInput={(e) => setAPN((e.target as HTMLInputElement).value)}
							/>
							<button
								class="flex w-24 items-center justify-center space-x-2 rounded-md  bg-blue-500 py-3 text-white"
								onClick={(e) => {
									e.preventDefault();
									saveAPN();
								}}
							>
								<p>
									{saving() === "saving"
										? "Saving..."
										: saving() === "error"
											? "Failed Saved..."
											: saving() === "saved"
												? "Saved"
												: "Save"}
								</p>
							</button>
						</div>
					</div>
				</Show>
			</Portal>
			<Portal>
				<Show when={openedNetwork()}>
					{(wifi) => (
						<div class="fixed left-1/2 top-1/2 z-40 h-auto w-11/12 -translate-x-1/2 -translate-y-1/2 transform rounded-xl border bg-white px-3 py-4  shadow-lg">
							<div class="flex justify-between px-4 pb-2">
								<div class="flex items-center space-x-4">
									{getWifiIcon(wifi().quality)}
									<h1 class="text-lg text-neutral-800">{wifi().SSID}</h1>
								</div>
								<button
									onClick={() => {
										setPassword("");
										setErrorConnecting(null);
										setOpenedNetwork(null);
									}}
									class="text-gray-500"
								>
									<ImCross size={12} />
								</button>
							</div>
							<p class="whitespace-pre-line px-3 py-2 text-red-500">
								{errorConnecting()}
							</p>
							<Show
								when={!currentWifi() || wifi().SSID !== currentWifi()?.SSID}
								fallback={
									<Show
										when={disconnected()}
										fallback={
											<div class="flex space-x-2">
												<button
													class="flex w-full items-center justify-center rounded-md bg-blue-500 py-3 text-white"
													onClick={() => {
														disconnectFromWifi();
														context.searchDevice();
													}}
												>
													<p>Disconnect</p>
												</button>
												<Show
													when={
														wifi().SSID.toLowerCase() !== "bushnet" &&
														isSaved(wifi().SSID)
													}
												>
													<button
														class="flex w-full items-center justify-center rounded-md bg-blue-500 py-3 text-white"
														onClick={() => {
															forgetWifi(wifi().SSID);
															context.searchDevice();
														}}
													>
														<p>Forget</p>
													</button>
												</Show>
											</div>
										}
									>
										<div>
											<p class="whitespace-pre-line pb-2 text-green-500">
												Successfully disconnected from WiFi.
												<br /> Would you like to try to connect to it?
											</p>
											<button
												class="flex w-full items-center justify-center rounded-md bg-blue-500 py-3 text-white"
												onClick={async () => {
													context.connectToDeviceAP();
												}}
												disabled={[
													"loadingDisconect",
													"loadingConnect",
												].includes(context.apState())}
											>
												{["loadingDisconect", "loadingConnect"].includes(
													context.apState(),
												)
													? "Connecting..."
													: "Connect to Device"}
											</button>
										</div>
									</Show>
								}
							>
								<Show when={connecting() === wifi().SSID}>
									<p class="px-2 pb-2">
										To continue accessing this device, ensure you are connected
										to the same WiFi network.
									</p>
								</Show>
								<div class="flex w-full flex-col items-center space-y-2 px-2">
									<Show
										when={
											wifi().isSecured &&
											!isSaved(wifi().SSID) &&
											connecting() !== wifi().SSID
										}
									>
										<div class="flex w-full items-center space-x-2">
											<input
												class="w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
												type={showPassword() ? "text" : "password"}
												ref={inputRef}
												placeholder="Password"
												required
												value={password()}
												onInput={(e) =>
													setPassword((e.target as HTMLInputElement).value)
												}
											/>
											<button
												type="button"
												class="px-2 text-neutral-500"
												onClick={() => setShowPassword(!showPassword())}
											>
												<Show
													when={!showPassword()}
													fallback={<FaRegularEye size={24} />}
												>
													<FaRegularEyeSlash size={24} />
												</Show>
											</button>
										</div>
									</Show>
									<div class="flex w-full items-center space-x-2">
										<button
											type="submit"
											classList={{
												"bg-gray-300 text-gray-700": disableConnect(
													wifi().SSID,
												),
												"bg-blue-500": !disableConnect(wifi().SSID),
											}}
											class="flex w-full items-center justify-center space-x-2 rounded-md bg-blue-500 py-3 text-white"
											disabled={disableConnect(wifi().SSID)}
											onClick={(e) => {
												e.preventDefault();
												connectToWifi();
											}}
										>
											<Show
												when={connecting() === wifi().SSID}
												fallback={<p>Connect</p>}
											>
												<p>Connecting...</p>
											</Show>
										</button>
										<Show
											when={
												wifi().SSID.toLowerCase() !== "bushnet" &&
												isSaved(wifi().SSID)
											}
										>
											<button
												class="flex w-full items-center justify-center rounded-md bg-blue-500 py-3 text-white"
												onClick={async () => {
													setIsForgetting(true);
													await forgetWifi(wifi().SSID);
													setIsForgetting(false);
													await refetchSavedWifi();
													context.searchDevice();
												}}
											>
												<Show when={isForgetting()} fallback={<p>Forget</p>}>
													<p>Forgetting...</p>
												</Show>
											</button>
										</Show>
									</div>
								</div>
							</Show>
						</div>
					)}
				</Show>
			</Portal>
			<Portal>
				<Show when={showSaveNetwork()}>
					<div class="fixed left-1/2 top-1/2 z-40 h-auto w-11/12 -translate-x-1/2 -translate-y-1/2 transform rounded-xl border bg-white px-3 py-4  shadow-lg">
						<div class="flex justify-between px-4 pb-2">
							<h1 class="text-lg text-neutral-800">Save Network</h1>
							<button
								onClick={() => {
									setShowSaveNetwork(false);
								}}
								class="text-gray-500"
							>
								<ImCross size={12} />
							</button>
						</div>
						<p class="whitespace-pre-line px-3 py-2 text-red-500">
							{errorConnecting()}
						</p>
						<form class="flex w-full flex-col items-center space-y-2 px-2">
							<input
								type="text"
								value={ssid()}
								class="w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
								placeholder="SSID"
								min={1}
								disabled={["saved", "saving"].includes(saving() ?? "")}
								onInput={(e) => setSsid((e.target as HTMLInputElement).value)}
							/>
							<div class="flex w-full items-center space-x-2">
								<input
									class="w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
									type={showPassword() ? "text" : "password"}
									placeholder="Password"
									required
									value={password()}
									min={8}
									max={64}
									onInput={(e) =>
										setPassword((e.target as HTMLInputElement).value)
									}
								/>
								<button
									type="button"
									class="px-2 text-neutral-500"
									onClick={() => setShowPassword(!showPassword())}
								>
									<Show
										when={!showPassword()}
										fallback={<FaRegularEye size={24} />}
									>
										<FaRegularEyeSlash size={24} />
									</Show>
								</button>
							</div>
							<button
								class="flex w-full items-center justify-center space-x-2 rounded-md bg-blue-500 py-3 text-white"
								onClick={(e) => {
									e.preventDefault();
									saveWifi();
								}}
							>
								<p>
									{saving() === "saving"
										? "Saving..."
										: saving() === "error"
											? "Failed Saved..."
											: saving() === "saved"
												? "Saved"
												: "Save"}
								</p>
							</button>
						</form>
					</div>
				</Show>
			</Portal>
		</div>
	);
}