// src/components/UI/RadioGroup.tsx
import type { Component } from "solid-js";
import { For } from "solid-js";

type RadioOption = {
	value: string;
	title: string;
	description: string;
};

type RadioGroupProps = {
	name: string;
	options: RadioOption[];
	selectedValue: string;
	onChange: (value: string) => void;
};

export const RadioGroup: Component<RadioGroupProps> = (props) => {
	return (
		<div class="space-y-3">
			<For each={props.options}>
				{(option) => (
					<label class="flex items-start gap-x-3 rounded-md border p-3 transition hover:bg-gray-50">
						<input
							type="radio"
							name={props.name}
							value={option.value}
							checked={props.selectedValue === option.value}
							onChange={() => props.onChange(option.value)}
							class="mt-1 h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
						/>
						<div class="flex-grow">
							<p class="font-medium text-gray-900">{option.title}</p>
							<p class="text-xs text-gray-500">{option.description}</p>
						</div>
					</label>
				)}
			</For>
		</div>
	);
};
