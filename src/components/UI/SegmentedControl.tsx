// src/components/UI/SegmentedControl.tsx
import type { Component } from "solid-js";
import { For } from "solid-js";

export type ConfidenceOption = {
	label: string;
	value: "Normal" | "High" | "VeryHigh";
};

type SegmentedControlProps = {
	options: ConfidenceOption[];
	selectedValue: "Normal" | "High" | "VeryHigh";
	onChange: (value: "Normal" | "High" | "VeryHigh") => void;
};

export const SegmentedControl: Component<SegmentedControlProps> = (props) => {
	return (
		<div class="isolate inline-flex rounded-md shadow-sm">
			<For each={props.options}>
				{(option, i) => (
					<button
						type="button"
						onClick={() => props.onChange(option.value)}
						class="relative -ml-px inline-flex items-center px-3 py-1.5 text-xs font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 transition-colors focus:z-10"
						classList={{
							"bg-blue-500 text-white hover:bg-blue-600":
								props.selectedValue === option.value,
							"bg-white hover:bg-gray-50": props.selectedValue !== option.value,
							"rounded-l-md": i() === 0,
							"rounded-r-md": i() === props.options.length - 1,
						}}
					>
						{option.label}
					</button>
				)}
			</For>
		</div>
	);
};
