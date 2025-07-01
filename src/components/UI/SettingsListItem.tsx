import { RiArrowsArrowRightSLine } from "solid-icons/ri";
import { type JSXElement, Show } from "solid-js";

interface SettingsListItemProps {
	title: string;
	description?: string;
	icon?: JSXElement;
	onClick: () => void;
	showArrow?: boolean;
}

export function SettingsListItem(props: SettingsListItemProps) {
	return (
		<button
			onClick={props.onClick}
			class="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:bg-gray-50"
		>
			<div class="flex items-center gap-3">
				<Show when={props.icon}>
					<div class="text-gray-600">{props.icon}</div>
				</Show>
				<div>
					<h3 class="font-medium text-gray-900">{props.title}</h3>
					<Show when={props.description}>
						<p class="mt-1 text-sm text-gray-600">{props.description}</p>
					</Show>
				</div>
			</div>
			<Show when={props.showArrow ?? true}>
				<RiArrowsArrowRightSLine size={20} class="text-gray-400" />
			</Show>
		</button>
	);
}