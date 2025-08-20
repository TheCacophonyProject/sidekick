import { debounce } from "@solid-primitives/scheduled";
import {
	FaSolidCheck,
	FaSolidPlus,
	FaSolidSpinner,
	FaSolidTrashCan,
} from "solid-icons/fa";
import { ImCross } from "solid-icons/im";
import {
	For,
	Index,
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
import { createStore } from "solid-js/store";
import { Portal } from "solid-js/web";
import type {
	AiControlConfig,
	ConfidenceValue,
	DeviceId,
} from "~/contexts/Device";
import { availableSpecies, useDevice } from "~/contexts/Device";

import { DurationInput } from "~/components/UI/DurationInput";

type SettingProps = { deviceId: DeviceId };

type AiMode = "off" | "stream" | "trigger" | "cellium";

// The TargetSelectorModal (renamed from SpeciesSelectorModal) remains mostly unchanged
const TargetSelectorModal = (props: {
	isOpen: boolean;
	onClose: () => void;
	selected: { name: string; confidence: ConfidenceValue }[];
	onUpdate: (
		newSelection: { name: string; confidence: ConfidenceValue }[],
	) => void;
	title: string;
}) => {
	const [localSelection, setLocalSelection] = createSignal<
		{ name: string; confidence: ConfidenceValue }[]
	>([]);
	createEffect(() => {
		setLocalSelection(props.selected);
	});

	const isSelected = (targetName: string) =>
		localSelection().some((s) => s.name === targetName);

	const toggleTarget = (targetName: string) => {
		setLocalSelection(
			isSelected(targetName)
				? (p) => p.filter((s) => s.name !== targetName)
				: (p) => [...p, { name: targetName, confidence: 80 }], // Default to High confidence
		);
	};

	const handleSave = () => {
		props.onUpdate(localSelection());
		props.onClose();
	};

	return (
		<Portal>
			<Show when={props.isOpen}>
				<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
					<div class="flex h-full max-h-[85vh] w-full max-w-md flex-col rounded-xl bg-white shadow-lg">
						<header class="flex items-center justify-between border-b p-4">
							<h2 class="text-lg font-semibold">{props.title}</h2>
							<button onClick={props.onClose}>
								<ImCross />
							</button>
						</header>
						<main class="flex-grow overflow-y-auto p-4">
							<div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
								<For each={availableSpecies}>
									{(target) => (
										<button
											onClick={() => toggleTarget(target)}
											class="rounded-md p-3 text-center text-sm transition"
											classList={{
												"bg-green-500 text-white shadow-sm": isSelected(target),
												"bg-gray-200 text-gray-800 hover:bg-gray-300":
													!isSelected(target),
											}}
										>
											{target.charAt(0).toUpperCase() + target.slice(1)}
										</button>
									)}
								</For>
							</div>
						</main>
						<footer class="border-t p-4">
							<button
								onClick={handleSave}
								class="w-full rounded-md bg-blue-500 px-4 py-3 text-white"
							>
								Confirm Selection
							</button>
						</footer>
					</div>
				</div>
			</Show>
		</Portal>
	);
};

// Mode Selector Component
const ModeSelector = (props: {
	value: AiMode;
	onChange: (mode: AiMode) => void;
}) => {
	const modes: { value: AiMode; label: string; description: string }[] = [
		{
			value: "off",
			label: "Off",
			description: "",
		},
		{
			value: "stream",
			label: "Stream",
			description:
				"Sends continuous data stream (UART serial) with all AI detections and confidence scores via auxiliary port",
		},
		{
			value: "trigger",
			label: "Trigger",
			description:
				"Outputs digital signal via auxiliary port based on target detection rules",
		},
		{
			value: "cellium",
			label: "Cellium",
			description: "Sends stream of AI detections to Cellium for processing",
		},
	];

	return (
		<div class="space-y-4">
			<div class="relative flex rounded-lg bg-gray-100">
				{/* Sliding indicator */}
				<div
					class="absolute h-full rounded-md bg-white shadow-sm transition-all duration-300 ease-out"
					style={{
						width: "25%",
						transform: `translateX(${modes.findIndex((m) => m.value === props.value) * 100}%)`,
					}}
				/>

				{/* Mode buttons */}
				<div class="relative grid w-full grid-cols-4 items-center">
					<For each={modes}>
						{(mode) => (
							<button
								onClick={() => props.onChange(mode.value)}
								class="relative z-10 flex-1 rounded-md py-2 text-sm font-medium transition-colors duration-200"
								classList={{
									"text-gray-900": props.value === mode.value,
									"text-gray-600 hover:text-gray-800":
										props.value !== mode.value,
								}}
							>
								{mode.label}
							</button>
						)}
					</For>
				</div>
			</div>

			{/* Mode description */}
			<Show when={props.value !== "off"}>
				<div class="text-sm text-gray-600 transition-opacity duration-200">
					<For each={modes}>
						{(mode) => (
							<Show when={props.value === mode.value}>
								<p class="px-2">{mode.description}</p>
							</Show>
						)}
					</For>
				</div>
			</Show>
		</div>
	);
};

export function DeviceControlTab(props: SettingProps) {
	const context = useDevice();
	const id = () => props.deviceId;

	const [configResource] = createResource(id, (id) =>
		context.getAiControlConfig(id),
	);

	const [config, setConfig] = createStore<AiControlConfig>({
		aiEnabled: false,
		operatingMode: "simple",
		triggerLogic: "activateOnTarget",
		targetSpecies: [],
		activationDuration: "1m0s",
		protectedSpecies: [],
		deactivationDuration: "5m0s",
	});

	// Store the original loaded config to compare against for changes
	const [originalConfig, setOriginalConfig] =
		createSignal<AiControlConfig | null>(null);

	const [saveStatus, setSaveStatus] = createSignal<
		"idle" | "saving" | "saved" | "error"
	>("idle");

	// Compute the current mode based on config
	const currentMode = (): AiMode => {
		if (!config.aiEnabled) return "off";
		if (config.operatingMode === "uart") return "stream";
		if (config.operatingMode === "at-esl") return "cellium";
		return "trigger";
	};

	// Helper function to apply defaults when enabling AI for the first time
	const applyDefaultsIfNeeded = (
		mode: AiMode,
		currentConfig: AiControlConfig,
	) => {
		// Only apply defaults when switching from off to on, and if the config appears to be empty/default
		const isFirstTimeEnable = !originalConfig()?.aiEnabled && mode !== "off";
		const hasEmptyConfig =
			currentConfig.targetSpecies.length === 0 &&
			currentConfig.protectedSpecies.length === 0 &&
			(currentConfig.activationDuration === "1m0s" ||
				currentConfig.activationDuration === "0m0s") &&
			(currentConfig.deactivationDuration === "5m0s" ||
				currentConfig.deactivationDuration === "0m0s");

		const defaults = currentConfig.defaults;
		const operatingMode =
			mode === "stream"
				? ("uart" as const)
				: mode === "cellium"
					? ("at-esl" as const)
					: ("simple" as const);
		if (isFirstTimeEnable && hasEmptyConfig && defaults) {
			return {
				...currentConfig,
				aiEnabled: true,
				operatingMode,
				targetSpecies: defaults.targetSpecies,
				activationDuration: defaults.activationDuration,
				protectedSpecies: defaults.protectedSpecies,
				deactivationDuration: defaults.deactivationDuration,
			};
		}

		return {
			...currentConfig,
			aiEnabled: mode !== "off",
			operatingMode,
		};
	};

	// Handle mode changes
	const handleModeChange = (mode: AiMode) => {
		batch(() => {
			if (mode === "off") {
				setConfig("aiEnabled", false);
			} else {
				const newConfig = applyDefaultsIfNeeded(mode, config);
				// Apply all the changes from the helper function
				setConfig("aiEnabled", newConfig.aiEnabled);
				setConfig("operatingMode", newConfig.operatingMode);
				if (
					newConfig.targetSpecies &&
					newConfig.targetSpecies !== config.targetSpecies
				) {
					setConfig("targetSpecies", newConfig.targetSpecies);
				}
				if (
					newConfig.activationDuration &&
					newConfig.activationDuration !== config.activationDuration
				) {
					setConfig("activationDuration", newConfig.activationDuration);
				}
				if (
					newConfig.protectedSpecies &&
					newConfig.protectedSpecies !== config.protectedSpecies
				) {
					setConfig("protectedSpecies", newConfig.protectedSpecies);
				}
				if (
					newConfig.deactivationDuration &&
					newConfig.deactivationDuration !== config.deactivationDuration
				) {
					setConfig("deactivationDuration", newConfig.deactivationDuration);
				}
				if (
					newConfig.triggerLogic &&
					newConfig.triggerLogic !== config.triggerLogic
				) {
					setConfig(
						"triggerLogic",
						newConfig.triggerLogic as
							| "activateOnTarget"
							| "deactivateOnProtected",
					);
				}
			}
		});
	};

	// Effect to populate the local store once the config is fetched from the device.
	createEffect(() => {
		const loadedConfig = configResource();
		if (loadedConfig) {
			setConfig(loadedConfig);
			setOriginalConfig(loadedConfig); // Store the original for comparison
			setSaveStatus("idle"); // Ready to accept changes
		}
	});

	// Function to deep compare two configs to check if they're different
	const configsAreEqual = (
		config1: AiControlConfig,
		config2: AiControlConfig,
	): boolean => {
		return (
			config1.aiEnabled === config2.aiEnabled &&
			config1.operatingMode === config2.operatingMode &&
			config1.triggerLogic === config2.triggerLogic &&
			config1.activationDuration === config2.activationDuration &&
			config1.deactivationDuration === config2.deactivationDuration &&
			config1.targetSpecies.length === config2.targetSpecies.length &&
			config1.protectedSpecies.length === config2.protectedSpecies.length &&
			config1.targetSpecies.every(
				(species, index) =>
					species.name === config2.targetSpecies[index]?.name &&
					species.confidence === config2.targetSpecies[index]?.confidence,
			) &&
			config1.protectedSpecies.every(
				(species, index) =>
					species.name === config2.protectedSpecies[index]?.name &&
					species.confidence === config2.protectedSpecies[index]?.confidence,
			)
		);
	};

	// Debounced function to save the configuration to the device.
	// This prevents a flood of API calls on rapid changes (e.g., typing).
	const saveConfig = async (newConfig: AiControlConfig) => {
		setSaveStatus("saving");
		try {
			const success = await context.saveAiControlConfig(id(), newConfig);
			if (success) {
				// Update the original config to the newly saved config
				setOriginalConfig(newConfig);
				setSaveStatus("saved");
				setTimeout(() => {
					// Only transition from 'saved' to 'idle' if the status hasn't changed.
					if (saveStatus() === "saved") setSaveStatus("idle");
				}, 2500); // Show "saved" message for 2.5 seconds
			} else {
				throw new Error("API reported save failure");
			}
		} catch (error) {
			console.error("Failed to save AI settings:", error);
			setSaveStatus("error");
			// Optionally, allow user to see error for longer before it disappears
			setTimeout(() => {
				if (saveStatus() === "error") setSaveStatus("idle");
			}, 5000);
		}
	};

	const debouncedSave = debounce(saveConfig, 1000); // 1-second debounce window

	// Effect that triggers the save operation whenever the config store changes.
	// Only saves if the config is actually different from the originally loaded config.
	createEffect(
		on(
			() => ({ ...config }),
			(newConfig) => {
				// Don't save while the initial data is still loading
				if (configResource.loading) return;

				// Don't save if we don't have an original config to compare against
				const original = originalConfig();
				if (!original) return;

				// Only save if the config has actually changed
				if (!configsAreEqual(newConfig, original)) {
					debouncedSave(newConfig);
				}
			},
			{ defer: true },
		),
	);

	onMount(() => {
		onCleanup(() => {
			const original = originalConfig();
			if (!original) return;

			if (!configsAreEqual(config, original)) {
				saveConfig(config);
			}
		});
	});

	const [isTargetModalOpen, setTargetModalOpen] = createSignal(false);
	const [isProtectModalOpen, setProtectModalOpen] = createSignal(false);

	const batch = (fn: () => void) => fn();

	return (
		<section class="bg-gray-50 p-2 sm:p-4">
			<Show
				when={!configResource.loading}
				fallback={
					<div class="flex h-full w-full items-center justify-center gap-x-2 p-8">
						<FaSolidSpinner class="animate-spin" size={32} />
						<p>Loading AI Settings...</p>
					</div>
				}
			>
				<div class="relative">
					<div class="rounded-lg border border-gray-200 bg-white shadow-sm px-4 py-4">
						<div class="space-y-4">
							<ModeSelector value={currentMode()} onChange={handleModeChange} />
						</div>
					</div>

					<Show when={config.operatingMode === "simple" && config.aiEnabled}>
						<div class="mt-2 space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
							<div>
								<h3 class="text-md font-semibold text-gray-800">
									Target Detection Settings
								</h3>
								<p class="mt-1 text-sm text-gray-600">
									Signal ON (high voltage) when targets are detected and OFF
									(low voltage) when protected targets are found.
								</p>
							</div>

							{/* Target Section */}
							<div class="space-y-3 pt-2">
								<p class="text-sm text-gray-800">
									When a <span class="font-semibold">Target</span> is
									detected...
								</p>
								<div class="space-y-2">
									<Index each={config.targetSpecies}>
										{(_subField, i) => (
											<div class="flex items-center rounded-md bg-gray-50 p-2">
												<span class="text-sm font-medium text-gray-900 flex-1">
													{config.targetSpecies[i].name
														.charAt(0)
														.toUpperCase() +
														config.targetSpecies[i].name.slice(1)}
												</span>
												<div class="flex items-center gap-1 mr-3">
													<input
														type="number"
														min="0"
														max="100"
														value={config.targetSpecies[i].confidence}
														onChange={(e) => {
															const newConfidence =
																Number.parseInt(e.currentTarget.value) || 0;
															const clampedConfidence = Math.max(
																0,
																Math.min(100, newConfidence),
															);
															setConfig("targetSpecies", (targets) =>
																targets.map((target, idx) =>
																	idx === i
																		? {
																				...target,
																				confidence: clampedConfidence,
																			}
																		: target,
																),
															);
														}}
														class="w-14 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-center"
													/>
													<span class="text-xs text-gray-500 w-4">%</span>
												</div>
												<button
													type="button"
													onClick={() => {
														setConfig("targetSpecies", (p) =>
															p.filter((_, idx) => idx !== i),
														);
													}}
													class="text-red-500 transition-colors hover:text-red-700"
												>
													<FaSolidTrashCan size={14} />
												</button>
											</div>
										)}
									</Index>
									<button
										type="button"
										onClick={() => setTargetModalOpen(true)}
										class="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-gray-300 p-2 text-sm text-blue-600 transition hover:bg-gray-50"
									>
										<FaSolidPlus size={12} /> Add Target
									</button>
								</div>
								<p class="text-sm text-gray-800">...activate the device for:</p>
								<DurationInput
									value={config.activationDuration}
									onChange={(value) => setConfig("activationDuration", value)}
								/>
							</div>

							<hr class="my-2" />

							{/* Protected Targets Section */}
							<div class="space-y-3 pt-2">
								<p class="text-sm text-gray-800">
									When a{" "}
									<span class="font-semibold text-orange-600">
										Protected Target
									</span>{" "}
									is detected, the device will automatically deactivate.
								</p>

								<div class="space-y-2">
									<Index each={config.protectedSpecies}>
										{(_subField, i) => (
											<div class="flex items-center rounded-md bg-orange-50 p-2">
												<span class="text-sm font-medium text-gray-900 flex-1">
													{config.protectedSpecies[i].name
														.charAt(0)
														.toUpperCase() +
														config.protectedSpecies[i].name.slice(1)}
												</span>
												<div class="flex items-center gap-1 mr-3">
													<input
														type="number"
														min="0"
														max="100"
														value={config.protectedSpecies[i].confidence}
														onChange={(e) => {
															const newConfidence =
																Number.parseInt(e.currentTarget.value) || 0;
															const clampedConfidence = Math.max(
																0,
																Math.min(100, newConfidence),
															);
															setConfig("protectedSpecies", (targets) =>
																targets.map((target, idx) =>
																	idx === i
																		? {
																				...target,
																				confidence: clampedConfidence,
																			}
																		: target,
																),
															);
														}}
														class="w-14 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-center"
													/>
													<span class="text-xs text-gray-500 w-4">%</span>
												</div>
												<button
													type="button"
													onClick={() => {
														setConfig("protectedSpecies", (p) =>
															p.filter((_, idx) => idx !== i),
														);
													}}
													class="text-red-500 transition-colors hover:text-red-700"
												>
													<FaSolidTrashCan size={14} />
												</button>
											</div>
										)}
									</Index>
									<button
										type="button"
										onClick={() => setProtectModalOpen(true)}
										class="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-gray-300 p-2 text-sm text-blue-600 transition hover:bg-gray-50"
									>
										<FaSolidPlus size={12} /> Add Protected Target
									</button>
									<DurationInput
										value={config.deactivationDuration}
										onChange={(value) =>
											setConfig("deactivationDuration", value)
										}
									/>
								</div>
							</div>
						</div>
					</Show>

					{/* Saving Status Indicator */}
					<Show when={saveStatus() !== "idle"}>
						<div class="pt-4 h-8 flex items-center justify-end px-2">
							<Switch>
								<Match when={saveStatus() === "saving"}>
									<div class="flex items-center gap-2 text-sm text-gray-600">
										<FaSolidSpinner class="animate-spin" />
										<span>Saving...</span>
									</div>
								</Match>
								<Match when={saveStatus() === "saved"}>
									<div class="flex items-center gap-2 text-sm text-green-600">
										<FaSolidCheck />
										<span>Settings saved</span>
									</div>
								</Match>
								<Match when={saveStatus() === "error"}>
									<div class="flex items-center gap-2 text-sm text-red-600">
										<ImCross size={14} />
										<span>Save failed. Please try again.</span>
									</div>
								</Match>
							</Switch>
						</div>
					</Show>
				</div>
			</Show>

			<TargetSelectorModal
				isOpen={isTargetModalOpen()}
				onClose={() => setTargetModalOpen(false)}
				selected={config.targetSpecies}
				onUpdate={(newSelection) => setConfig("targetSpecies", newSelection)}
				title="Select Targets"
			/>
			<TargetSelectorModal
				isOpen={isProtectModalOpen()}
				onClose={() => setProtectModalOpen(false)}
				selected={config.protectedSpecies}
				onUpdate={(newSelection) => setConfig("protectedSpecies", newSelection)}
				title="Select Protected Targets"
			/>
		</section>
	);
}
