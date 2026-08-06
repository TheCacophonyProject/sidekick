import { RiArrowsArrowLeftSLine } from "solid-icons/ri";
import { type JSXElement, Show } from "solid-js";

interface SubPageNavigationProps {
	title: string;
	onBack: () => void;
	showBack?: boolean;
	rightContent?: JSXElement;
}

export function SubPageNavigation(props: SubPageNavigationProps) {
	return (
		<div class="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
			<div class="flex items-center gap-3">
				<Show when={props.showBack ?? true}>
					<button
						onClick={props.onBack}
						class="flex items-center text-blue-500 transition-colors hover:text-blue-600"
						aria-label="Go back"
					>
						<RiArrowsArrowLeftSLine size={28} />
					</button>
				</Show>
				<h2 class="text-lg font-semibold text-gray-800">{props.title}</h2>
			</div>
			<Show when={props.rightContent}>{props.rightContent}</Show>
		</div>
	);
}