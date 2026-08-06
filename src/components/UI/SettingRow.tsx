// src/components/UI/SettingRow.tsx
import type { Component, JSX } from "solid-js";
import { Show } from "solid-js";

type SettingRowProps = {
	title: JSX.Element | string;
	description?: JSX.Element | string;
	children: JSX.Element; // The control (e.g., a toggle) is passed as a child
};

export const SettingRow: Component<SettingRowProps> = (props) => {
	return (
		<div class="py-3">
			<div class="flex items-center justify-between">
				<div class="flex-grow text-sm font-medium text-gray-800">
					{props.title}
				</div>
				<div class="ml-4 flex-shrink-0">{props.children}</div>
			</div>
			<Show when={props.description}>
				<p class="mt-1 text-xs text-gray-500">{props.description}</p>
			</Show>
		</div>
	);
};
