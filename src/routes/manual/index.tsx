import { onMount, onCleanup } from "solid-js";
import Manual from "~/components/Manual";
import { setIsChatOnManualPage, toggleFlyweightChat } from "~/components/FlyweightChatManager";

export default function HelpPage() {
	onMount(() => {
		// Mark that we're on the manual page
		setIsChatOnManualPage(true);
	});

	onCleanup(() => {
		// Mark that we're leaving the manual page
		setIsChatOnManualPage(false);
		// Close the chat when leaving the page
		toggleFlyweightChat(false);
	});

	return (
		<div class="pt-bar pb-bar h-full">
			<div class="mx-2 mb-2 rounded-lg bg-white px-2 py-4">
				<Manual />
			</div>
		</div>
	);
}