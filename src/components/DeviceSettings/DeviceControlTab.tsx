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
import { SettingRow } from "~/components/UI/SettingRow";
import { ToggleSwitch } from "~/components/UI/ToggleSwitch";

type SettingProps = { deviceId: DeviceId };

// The SpeciesSelectorModal is compatible with the new approach and remains unchanged.
const SpeciesSelectorModal = (props: {
	isOpen: boolean;
	onClose: () => void;
	selected: { name: string; confidence: ConfidenceValue }[];
	onUpdate: (
		newSelection: { name: string; confidence: ConfidenceValue }[],
	) => void;
	title: string;
}) => {
	const [localSelection, setLocalSelection] = createStore<
		{ name: string; confidence: ConfidenceValue }[]
	>([]);
	createEffect(() => {
		setLocalSelection(props.selected);
	});

	const isSelected = (speciesName: string) =>
		localSelection.some((s) => s.name === speciesName);

	const toggleSpecies = (speciesName: string) => {
		setLocalSelection(
			isSelected(speciesName)
				? (p) => p.filter((s) => s.name !== speciesName)
				: (p) => [...p, { name: speciesName, confidence: "High" }], // Default to High confidence
		);
	};

	const handleSave = () => {
		props.onUpdate(localSelection);
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
									{(species) => (
										<button
											onClick={() => toggleSpecies(species)}
											class="rounded-md p-3 text-center text-sm transition"
											classList={{
												"bg-green-500 text-white shadow-sm":
													isSelected(species),
												"bg-gray-200 text-gray-800 hover:bg-gray-300":
													!isSelected(species),
											}}
										>
											{species.charAt(0).toUpperCase() + species.slice(1)}
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

export function DeviceControlTab(props: SettingProps) {
	const context = useDevice();
	const id = () => props.deviceId;

	const [configResource] = createResource(id, (id) =>
		context.getAiControlConfig(id),
	);

	const [config, setConfig] = createStore<AiControlConfig>({
		aiEnabled: false,
		controlEnabled: false,
		operatingMode: "simple",
		triggerLogic: "activateOnTarget",
		targetSpecies: [],
		activationDuration: "1m0s",
		protectedSpecies: [],
		deactivationDuration: "5m0s",
	});

	// Store the original loaded config to compare against for changes
	const [originalConfig, setOriginalConfig] = createSignal<AiControlConfig | null>(null);

	const [saveStatus, setSaveStatus] = createSignal<
		"idle" | "saving" | "saved" | "error"
	>("idle");

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
	const configsAreEqual = (config1: AiControlConfig, config2: AiControlConfig): boolean => {
		return (
			config1.aiEnabled === config2.aiEnabled &&
			config1.controlEnabled === config2.controlEnabled &&
			config1.operatingMode === config2.operatingMode &&
			config1.triggerLogic === config2.triggerLogic &&
			config1.activationDuration === config2.activationDuration &&
			config1.deactivationDuration === config2.deactivationDuration &&
			config1.targetSpecies.length === config2.targetSpecies.length &&
			config1.protectedSpecies.length === config2.protectedSpecies.length &&
			config1.targetSpecies.every((species, index) => 
				species.name === config2.targetSpecies[index]?.name &&
				species.confidence === config2.targetSpecies[index]?.confidence
			) &&
			config1.protectedSpecies.every((species, index) => 
				species.name === config2.protectedSpecies[index]?.name &&
				species.confidence === config2.protectedSpecies[index]?.confidence
			)
		);
	};

	// Debounced function to save the configuration to the device.
	// This prevents a flood of API calls on rapid changes (e.g., typing).
	const debouncedSave = debounce(async (newConfig: AiControlConfig) => {
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
	}, 1000); // 1-second debounce window

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

	const [isTargetModalOpen, setTargetModalOpen] = createSignal(false);
	const [isProtectModalOpen, setProtectModalOpen] = createSignal(false);

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
				{/* The form tag is no longer needed as there's no submit event */}
				<div class="relative">
					<div class="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-sm px-2">
						<SettingRow
							title="Onboard AI Processing"
							description="Enables real-time animal identification."
						>
							<ToggleSwitch
								checked={config.aiEnabled}
								onChange={(checked) => setConfig("aiEnabled", checked)}
							/>
						</SettingRow>

						<Show when={config.aiEnabled}>
							<SettingRow
								title="External Device Control"
								description="Control devices via the auxiliary port's digital signal."
							>
								<ToggleSwitch
									checked={config.controlEnabled}
									onChange={(checked) => setConfig("controlEnabled", checked)}
								/>
							</SettingRow>
						</Show>
					</div>

					<Show when={config.aiEnabled && config.controlEnabled}>
						<div class="mt-4 space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
							<div>
								<h3 class="text-md font-semibold text-gray-800">
									Species Detection Settings
								</h3>
								<p class="mt-1 text-sm text-gray-600">
									The device activates when target species are detected and
									automatically deactivates when protected species are found.
								</p>
							</div>

							{/* Target Species Section */}
							<div class="space-y-3 pt-2">
								<p class="text-sm text-gray-800">
									When a <span class="font-semibold">Target Species</span> is
									detected...
								</p>
								<div class="space-y-2">
									<Index each={config.targetSpecies}>
										{(_subField, i) => (
											<div class="flex items-center justify-between rounded-md bg-gray-50 p-2">
												<span class="text-sm font-medium text-gray-900">
													{config.targetSpecies[i].name
														.charAt(0)
														.toUpperCase() +
														config.targetSpecies[i].name.slice(1)}
												</span>
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
										<FaSolidPlus size={12} /> Add Target Species
									</button>
								</div>
								<p class="text-sm text-gray-800">...activate the device for:</p>
								<DurationInput
									value={config.activationDuration}
									onChange={(value) => setConfig("activationDuration", value)}
								/>
							</div>

							<hr class="my-2" />

							{/* Protected Species Section */}
							<div class="space-y-3 pt-2">
								<p class="text-sm text-gray-800">
									When a{" "}
									<span class="font-semibold text-orange-600">
										Protected Species
									</span>{" "}
									is detected, the device will automatically deactivate.
								</p>

								<div class="space-y-2">
									<Index each={config.protectedSpecies}>
										{(_subField, i) => (
											<div class="flex items-center justify-between rounded-md bg-orange-50 p-2">
												<span class="text-sm font-medium text-gray-900">
													{config.protectedSpecies[i].name
														.charAt(0)
														.toUpperCase() +
														config.protectedSpecies[i].name.slice(1)}
												</span>
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
										<FaSolidPlus size={12} /> Add Protected Species
									</button>
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

			<SpeciesSelectorModal
				isOpen={isTargetModalOpen()}
				onClose={() => setTargetModalOpen(false)}
				selected={config.targetSpecies}
				onUpdate={(newSelection) => setConfig("targetSpecies", newSelection)}
				title="Select Target Species"
			/>
			<SpeciesSelectorModal
				isOpen={isProtectModalOpen()}
				onClose={() => setProtectModalOpen(false)}
				selected={config.protectedSpecies}
				onUpdate={(newSelection) => setConfig("protectedSpecies", newSelection)}
				title="Select Protected Species"
			/>
		</section>
	);
}
