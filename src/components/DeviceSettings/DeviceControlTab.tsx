import { createForm } from "@tanstack/solid-form";
import { FaSolidPlus, FaSolidSpinner, FaSolidTrashCan } from "solid-icons/fa";
import { ImCross } from "solid-icons/im";
import {
	For,
	Index,
	Show,
	createEffect,
	createResource,
	createSignal,
} from "solid-js";
import { createStore } from "solid-js/store";
import { Portal } from "solid-js/web";
import type { ConfidenceValue, DeviceId } from "~/contexts/Device";
import { availableSpecies, useDevice } from "~/contexts/Device";

import { DurationInput } from "~/components/UI/DurationInput";
import { RadioGroup } from "~/components/UI/RadioGroup";
import {
	type ConfidenceOption,
	SegmentedControl,
} from "~/components/UI/SegmentedControl";
import { SettingRow } from "~/components/UI/SettingRow";
import { ToggleSwitch } from "~/components/UI/ToggleSwitch";

type SettingProps = { deviceId: DeviceId };

type AiControlFormData = {
	aiEnabled: boolean;
	controlEnabled: boolean;
	operatingMode: "simple" | "uart";
	triggerLogic: "activateOnTarget" | "deactivateOnProtected";
	targetSpecies: { name: string; confidence: ConfidenceValue }[];
	activationDuration: string;
	protectedSpecies: { name: string; confidence: ConfidenceValue }[];
	deactivationDuration: string;
};

// The SpeciesSelectorModal updated for new confidence type
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
				: (p) => [...p, { name: speciesName, confidence: "Normal" }], // Changed default
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

	const form = createForm(() => ({
		defaultValues: configResource() ?? {
			aiEnabled: false,
			controlEnabled: false,
			operatingMode: "simple" as const,
			triggerLogic: "activateOnTarget" as const,
			targetSpecies: [] as { name: string; confidence: ConfidenceValue }[],
			activationDuration: "1m0s",
			protectedSpecies: [] as { name: string; confidence: ConfidenceValue }[],
			deactivationDuration: "5m0s",
		},
		onSubmit: async ({ value }) => {
			await context.saveAiControlConfig(id(), value);
		},
	}));

	// Update form when config loads
	createEffect(() => {
		const config = configResource();
		if (config) {
			form.reset(config);
		}
	});

	const [isTargetModalOpen, setTargetModalOpen] = createSignal(false);
	const [isProtectModalOpen, setProtectModalOpen] = createSignal(false);

	const confidenceOptions: ConfidenceOption[] = [
		{ label: "Normal", value: "Normal" },
		{ label: "High", value: "High" },
		{ label: "V. High", value: "VeryHigh" },
	];

	const triggerLogicOptions = [
		{
			value: "activateOnTarget",
			title: "Activate on Target",
			description: "Signal is normally OFF, turns ON for targets.",
		},
		{
			value: "deactivateOnProtected",
			title: "Deactivate on Protected",
			description: "Signal is normally ON, turns OFF for protected.",
		},
	];

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
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
				>
					<div class="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white shadow-sm px-2">
						<form.Field name="aiEnabled">
							{(field) => (
								<SettingRow
									title="Onboard AI Processing"
									description="Enables real-time animal identification."
								>
									<ToggleSwitch
										checked={field().state.value}
										onChange={field().handleChange}
									/>
								</SettingRow>
							)}
						</form.Field>

						<form.Field name="controlEnabled">
							{(field) => (
								<Show when={field().form.state.values.aiEnabled}>
									<SettingRow
										title="External Device Control"
										description="Control devices via the auxiliary port."
									>
										<ToggleSwitch
											checked={field().state.value}
											onChange={field().handleChange}
										/>
									</SettingRow>
								</Show>
							)}
						</form.Field>
					</div>

					<Show
						when={() =>
							form.state.values.aiEnabled && form.state.values.controlEnabled
						}
					>
						<div class="mt-4 space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
							<h3 class="text-md font-semibold text-gray-800">
								Trigger Configuration
							</h3>

							<form.Field name="triggerLogic">
								{(field) => (
									<RadioGroup
										name="triggerLogic"
										options={triggerLogicOptions}
										selectedValue={field().state.value}
										onChange={(value) => field().handleChange(value)}
									/>
								)}
							</form.Field>

							{/* Target Species Section */}
							<div class="space-y-3 pt-2">
								<p class="text-sm text-gray-800">
									When a <span class="font-semibold">Target Species</span> is
									detected...
								</p>
								<form.Field name="targetSpecies" mode="array">
									{(field) => (
										<div class="space-y-2">
											<Index each={field().state.value}>
												{(subField, i) => (
													<div class="flex items-center justify-between rounded-md bg-gray-50 p-2">
														<span class="text-sm font-medium text-gray-900">
															{subField().name.charAt(0).toUpperCase() +
																subField().name.slice(1)}
														</span>
														<div class="flex items-center gap-x-3">
															<SegmentedControl
																options={confidenceOptions}
																selectedValue={subField().confidence}
																onChange={(value) => {
																	const currentSpecies =
																		form.getFieldValue("targetSpecies") || [];
																	const updated = currentSpecies.map(
																		(species, idx) =>
																			idx === i
																				? {
																						...species,
																						confidence:
																							value as ConfidenceValue,
																					}
																				: species,
																	);
																	form.setFieldValue("targetSpecies", updated);
																}}
															/>
															<button
																type="button"
																onClick={() => {
																	const currentSpecies =
																		form.getFieldValue("targetSpecies") || [];
																	const updated = currentSpecies.filter(
																		(_, idx) => idx !== i,
																	);
																	form.setFieldValue("targetSpecies", updated);
																}}
																class="text-red-500"
															>
																<FaSolidTrashCan size={14} />
															</button>
														</div>
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
									)}
								</form.Field>
								<p class="text-sm text-gray-800">...activate the device for:</p>
								<form.Field name="activationDuration">
									{(field) => (
										<DurationInput
											value={field().state.value}
											onChange={field().handleChange}
										/>
									)}
								</form.Field>
							</div>

							<hr class="my-2" />

							{/* Protected Species Section */}
							<div class="space-y-3 pt-2">
								<p class="text-sm text-gray-800">
									When a{" "}
									<span class="font-semibold text-orange-600">
										Protected Species
									</span>{" "}
									is detected...
								</p>
								<form.Field name="protectedSpecies" mode="array">
									{(field) => (
										<div class="space-y-2">
											<Index each={field().state.value}>
												{(subField, i) => (
													<div class="flex items-center justify-between rounded-md bg-orange-50 p-2">
														<span class="text-sm font-medium text-gray-900">
															{subField().name.charAt(0).toUpperCase() +
																subField().name.slice(1)}
														</span>
														<div class="flex items-center gap-x-3">
															<SegmentedControl
																options={confidenceOptions}
																selectedValue={subField().confidence}
																onChange={(value) => {
																	const currentSpecies =
																		form.getFieldValue("protectedSpecies") ||
																		[];
																	const updated = currentSpecies.map(
																		(species, idx) =>
																			idx === i
																				? {
																						...species,
																						confidence:
																							value as ConfidenceValue,
																					}
																				: species,
																	);
																	form.setFieldValue(
																		"protectedSpecies",
																		updated,
																	);
																}}
															/>
															<button
																type="button"
																onClick={() => {
																	const currentSpecies =
																		form.getFieldValue("protectedSpecies") ||
																		[];
																	const updated = currentSpecies.filter(
																		(_, idx) => idx !== i,
																	);
																	form.setFieldValue(
																		"protectedSpecies",
																		updated,
																	);
																}}
																class="text-red-500"
															>
																<FaSolidTrashCan size={14} />
															</button>
														</div>
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
									)}
								</form.Field>
								<p class="text-sm text-gray-800">
									...deactivate the device for:
								</p>
								<form.Field name="deactivationDuration">
									{(field) => (
										<DurationInput
											value={field().state.value}
											onChange={field().handleChange}
										/>
									)}
								</form.Field>
							</div>
						</div>
					</Show>

					<div class="pt-4">
						<form.Subscribe
							selector={(state) => [
								state.canSubmit,
								state.isDirty,
								state.isSubmitting,
							]}
						>
							{(state) => {
								const [canSubmit, isDirty, isSubmitting] = state();
								return (
									<button
										type="submit"
										disabled={!canSubmit || !isDirty || isSubmitting}
										class="flex w-full items-center justify-center space-x-2 rounded-lg bg-blue-500 py-3 text-white shadow-md transition disabled:bg-gray-400 disabled:shadow-none"
									>
										<Show
											when={isSubmitting}
											fallback={<span>Save Settings</span>}
										>
											<FaSolidSpinner class="animate-spin" />
											<span>Saving...</span>
										</Show>
									</button>
								);
							}}
						</form.Subscribe>
					</div>
				</form>
			</Show>

			<SpeciesSelectorModal
				isOpen={isTargetModalOpen()}
				onClose={() => setTargetModalOpen(false)}
				selected={form.getFieldValue("targetSpecies") || []}
				onUpdate={(newSelection) =>
					form.setFieldValue("targetSpecies", newSelection)
				}
				title="Select Target Species"
			/>
			<SpeciesSelectorModal
				isOpen={isProtectModalOpen()}
				onClose={() => setProtectModalOpen(false)}
				selected={form.getFieldValue("protectedSpecies") || []}
				onUpdate={(newSelection) =>
					form.setFieldValue("protectedSpecies", newSelection)
				}
				title="Select Protected Species"
			/>
		</section>
	);
}
