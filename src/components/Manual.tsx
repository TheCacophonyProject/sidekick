import {
	AndroidSettings,
	IOSSettings,
	NativeSettings,
} from "capacitor-native-settings";
import {
	RiArrowsArrowLeftSLine,
	RiArrowsArrowRightSLine,
} from "solid-icons/ri";
import { For, type JSX, Match, Show, Switch, createSignal } from "solid-js";
import {
	type ColorType,
	type DeviceType,
	DeviceTypeToggle,
	LightSequence,
	StartupProcess,
	getStartupSteps,
} from "./SetupWizard";

export const getSteps = (deviceType: DeviceType): JSX.Element => {
	return (
		<div class="md:text-md text-sm">
			<Show
				when={deviceType === "DOC AI Cam / Bird Monitor"}
				fallback={
					<>
						<ol class="mb-2 list-none space-y-3 overflow-y-auto rounded-lg bg-gray-50 p-4">
							<li class="flex items-start">
								<span class="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
									1
								</span>
								<p>Plug in and ensure the device is on.</p>
							</li>
							<li class="flex items-start">
								<span class="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
									2
								</span>
								<p>Wait until the light indicates a slow pulsing.</p>
							</li>
							<li class="flex items-start">
								<span class="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
									3
								</span>
								<p>
									Press the{" "}
									<span class="font-medium text-blue-500">
										"Connect to Camera"
									</span>{" "}
									button below.
								</p>
							</li>
							<li class="flex items-start">
								<span class="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
									4
								</span>
								<span>If prompted, confirm the connection to "bushnet"</span>
							</li>
						</ol>
						<p class="md:text-md mb-2 rounded-lg bg-yellow-50 p-3 text-center text-xs text-xs text-yellow-700">
							If your light does not match the process indicated below try reset
							the device pressing the power button.
						</p>
					</>
				}
			>
				<>
					<ol class="mb-2 list-none space-y-3 rounded-lg bg-gray-50 p-4">
						<li class="flex items-start">
							<span class="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
								1
							</span>
							<span>Plug in and ensure the device is on.</span>
						</li>
						<li class="flex items-start">
							<span class="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
								2
							</span>
							<span>
								When the device light turns{" "}
								<span class="font-medium text-yellow-600">yellow</span>, press
								the{" "}
								<span class="font-medium text-blue-500">
									"Connect to Camera"
								</span>{" "}
								button.{" "}
							</span>
						</li>
						<li class="flex items-start">
							<span class="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
								3
							</span>
							<span>If prompted, confirm the connection to "bushnet".</span>
						</li>
					</ol>
					<p class="mb-2 rounded-lg bg-yellow-50 p-3 text-center text-xs text-yellow-700 md:text-sm">
						For a <span class="font-medium text-red-500">red</span> or solid
						blue (<span class="font-medium text-blue-500">standby</span>) light:
						Hold the power button until it's off, then hold it again to restart
						the process. <br /> Solid{" "}
						<span class="font-medium text-green-500">green</span> indicates WiFi
						connection.
					</p>
				</>
			</Show>
		</div>
	);
};

export default function Manual() {
	const [selectedTab, setSelectedTab] = createSignal("connectionMethods");
	const [selectedConnectionMethod, setSelectedConnectionMethod] =
		createSignal<string>("");
	const tabs = [
		{ id: "connectionMethods", label: "Connection Methods" },
		{ id: "aiDocCam", label: "DOC AI Cam/ Bird Monitor" },
		{ id: "classicThermal", label: "Classic Thermal Camera" },
	];

	const connectionMethods = [
		{
			id: "directConnect",
			label: "Direct Connect",
			tooltip:
				"Connects to camera's hotspot. Use in offline/remote locations to download recordings without using your data.",
		},
		{
			id: "phoneHotspot",
			label: "Phone Hotspot",
			tooltip:
				"Use to update the camera software if the device has no modem. Will upload recordings and events automatically.",
		},
		{ id: "wifiConnection", label: "WiFi Connection" },
	];

	const getInstructions = (method: string): JSX.Element => {
		const [deviceType, setDeviceType] = createSignal<DeviceType>(
			"DOC AI Cam / Bird Monitor",
		);

		return (
			<div class="px-2 sm:px-4">
				<Switch
					fallback={<p>Select a connection method to see instructions.</p>}
				>
					<Match when={method === "directConnect"}>
						<>
							<button
								onClick={() => setSelectedConnectionMethod("")}
								class="flex items-center justify-center py-2 text-xl text-blue-500"
							>
								<RiArrowsArrowLeftSLine size={24} class="sm:h-8 sm:w-8" />
								<span class="text-lg sm:text-xl">Direct Connection</span>
							</button>

							<DeviceTypeToggle
								selected={deviceType()}
								onChange={(type) => setDeviceType(type)}
							/>

							{getSteps(deviceType())}
							<StartupProcess steps={getStartupSteps(deviceType())} />
						</>
					</Match>
					<Match when={method === "phoneHotspot"}>
						<>
							<button
								onClick={() => setSelectedConnectionMethod("")}
								class="flex items-center justify-center py-2 text-lg text-blue-500 sm:text-xl"
							>
								<RiArrowsArrowLeftSLine size={24} class="sm:h-8 sm:w-8" />
								Phone Hotspot
							</button>

							<ol class="mb-4 list-none space-y-3 rounded-lg bg-gray-50 p-4">
								<li class="flex items-start">
									<span class="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
										1
									</span>
									<span>Set up Personal Hotspot</span>
								</li>
								<li class="flex items-start">
									<span class="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
										2
									</span>
									<span>
										Go to Settings {">"} Personal Hotspot (or Portable Hotspot)
									</span>
								</li>
								<li class="flex items-start">
									<span class="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
										3
									</span>
									<span>Tap the slider next to Allow Others to Join</span>
								</li>
								<li class="flex items-start">
									<span class="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
										4
									</span>
									<span>Enable Maximize Compatibility if on iOS</span>
								</li>
								<li class="flex items-start">
									<span class="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
										5
									</span>
									<span>
										Connect using direct connect and add your hotspot through
										the WiFi settings
									</span>
								</li>
							</ol>

							<button
								onClick={() => {
									NativeSettings.open({
										optionAndroid: AndroidSettings.Wireless,
										optionIOS: IOSSettings.Tethering,
									});
								}}
								class="mt-4 w-full rounded bg-blue-500 px-4 py-2 text-white"
							>
								Hotspot Settings
							</button>
						</>
					</Match>
					<Match when={method === "wifiConnection"}>
						<>
							<button
								onClick={() => setSelectedConnectionMethod("")}
								class="flex items-center justify-center py-2 text-lg text-blue-500 sm:text-xl"
							>
								<RiArrowsArrowLeftSLine size={24} class="sm:h-8 sm:w-8" />
								WiFi Connection
							</button>

							<div class="mb-4 space-y-4 rounded-lg bg-gray-50 p-4">
								<div class="flex items-start">
									<span class="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
										1
									</span>
									<span>
										You will need to first either connect directly to the device
										or use your phone's hotspot.
									</span>
								</div>
								<div class="flex items-start">
									<span class="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
										2
									</span>
									<span>
										Follow the steps to add a WiFi network by clicking on the
										device that appears.
									</span>
								</div>
								<div class="flex items-start">
									<span class="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
										3
									</span>
									<div class="flex flex-col">
										<span>If your device is already connected to WiFi:</span>
										<span class="ml-2 mt-1 text-blue-700">
											Connect to the same network as your device.
										</span>
									</div>
								</div>
							</div>

							<button
								onClick={() => {
									NativeSettings.open({
										optionAndroid: AndroidSettings.Wifi,
										optionIOS: IOSSettings.WiFi,
									});
								}}
								class="mt-4 w-full rounded bg-blue-500 px-4 py-2 text-white"
							>
								WiFi Settings
							</button>
						</>
					</Match>
				</Switch>
			</div>
		);
	};

	const LightStatus = (props: {
		status: string;
		sequence: LightSequence;
		sequenceText: string;
		color: ColorType;
	}) => (
		<li class="mb-2 flex items-center space-x-2 rounded-md bg-gray-50 p-2">
			<span>
				<LightSequence sequence={props.sequence} color={props.color} />
			</span>
			<div>
				<p class="font-medium">
					<b>Status:</b> {props.status}
				</p>
				<p class="text-sm text-gray-600">
					<b>Sequence:</b> {props.sequenceText}
				</p>
			</div>
		</li>
	);

	return (
		<>
			<div class="flex overflow-x-auto pb-2">
				<For each={tabs}>
					{(tab) => (
						<button
							class={`mx-1 whitespace-nowrap rounded px-2 py-2 text-sm ${
								selectedTab() === tab.id
									? "bg-blue-500 text-white"
									: "bg-gray-200"
							}`}
							onClick={() => setSelectedTab(tab.id)}
						>
							{tab.label}
						</button>
					)}
				</For>
			</div>
			<Switch>
				<Match when={selectedTab() === "connectionMethods"}>
					<Show
						when={!selectedConnectionMethod()}
						fallback={getInstructions(selectedConnectionMethod())}
					>
						<p class="mb-4 text-center text-sm text-gray-700 sm:text-base">
							If you are unable to connect to your camera, you can try an
							alternative method.
						</p>
						<div class="mb-4 flex flex-col gap-y-2">
							<For each={connectionMethods}>
								{(method) => (
									<div class="rounded-lg border-2 border-gray-200 p-2">
										<button
											class="flex w-full items-center justify-between rounded border-2 border-blue-400 bg-white px-3 py-2 text-base text-blue-400 sm:text-lg"
											onClick={() => setSelectedConnectionMethod(method.id)}
										>
											<span>{method.label}</span>
											<RiArrowsArrowRightSLine
												size={24}
												class="sm:h-8 sm:w-8"
											/>
										</button>
										<p class="px-4 pt-2 text-xs text-gray-600 sm:text-sm">
											{method.tooltip}
										</p>
									</div>
								)}
							</For>
						</div>
					</Show>
				</Match>
				<Match when={selectedTab() === "aiDocCam"}>
					<h3 class="mb-3 ml-2 border-b pb-2 text-lg font-bold">
						Light Status Guide
					</h3>
					<div class="overflow-y-auto p-2">
						<div class="mb-3 rounded-md bg-blue-50 p-2">
							<h4 class="mb-1 font-medium text-blue-800">Bootup</h4>
							<LightStatus
								sequence={["short"]}
								color="blue"
								status="Booting up Device"
								sequenceText="(slow pulse)"
							/>
							<LightStatus
								sequence={[]}
								color="blue"
								status="Device Booted up"
								sequenceText="(Solid light)"
							/>
						</div>

						<div class="mb-3 rounded-md bg-green-50 p-2">
							<h4 class="mb-1 font-medium text-green-800">WiFi</h4>
							<LightStatus
								sequence={["short"]}
								color="green"
								status="Connecting to WiFi"
								sequenceText="(Short pulse)"
							/>
							<LightStatus
								sequence={[]}
								color="green"
								status="Connected to WiFi"
								sequenceText="(Solid light)"
							/>
						</div>

						<div class="mb-3 rounded-md bg-yellow-50 p-2">
							<h4 class="mb-1 font-medium text-yellow-800">Hotspot</h4>
							<LightStatus
								sequence={["short"]}
								color="yellow"
								status="Setting up hotspot"
								sequenceText="(Short pulse)"
							/>
							<LightStatus
								sequence={[]}
								color="yellow"
								status="Hotspot available"
								sequenceText="(Solid light)"
							/>
						</div>

						<div class="mb-3 rounded-md bg-red-50 p-2">
							<h4 class="mb-1 font-medium text-red-800">Power</h4>
							<LightStatus
								sequence={["long"]}
								color="red"
								status="Low Battery"
								sequenceText="(Slow pulse)"
							/>
							<LightStatus
								sequence={[]}
								color="red"
								status="Device is Off/in standby"
								sequenceText="(Solid Light)"
							/>
							<LightStatus
								sequence={[]}
								color="gray"
								status="Press to find status"
								sequenceText="(No Light)"
							/>
						</div>
					</div>
				</Match>
				<Match when={selectedTab() === "classicThermal"}>
					<h3 class="mb-3 ml-2 border-b pb-2 text-lg font-bold">
						Light Status Guide
					</h3>
					<div class="overflow-y-auto p-2">
						<div class="mb-3 rounded-md bg-blue-50 p-2">
							<h4 class="mb-1 font-medium text-blue-800">Boot & Connection</h4>
							<LightStatus
								sequence={["long", "blink", "blink"]}
								color="blue"
								status="Booting up Device"
								sequenceText="(One slow pulse, two flashes)"
							/>
							<LightStatus
								sequence={["long", "blink"]}
								color="blue"
								status="Connecting to WiFi"
								sequenceText="(One slow pulse, one flash)"
							/>
							<LightStatus
								sequence={["long"]}
								color="blue"
								status="Connected to WiFi or Setup hotspot"
								sequenceText="(One slow pulse)"
							/>
						</div>

						<div class="mb-3 rounded-md bg-gray-50 p-2">
							<h4 class="mb-1 font-medium text-gray-800">Standby</h4>
							<LightStatus
								sequence={[]}
								color="gray"
								status="Press to find status"
								sequenceText="(No Light)"
							/>
						</div>
					</div>
				</Match>
			</Switch>
		</>
	);
}
