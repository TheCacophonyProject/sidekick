import { BiSolidInfoCircle } from "solid-icons/bi";
import { Component, Show, createEffect, createSignal } from "solid-js";
import { TracingLevel, useLogsContext } from "~/contexts/LogsContext";
import { useUserContext } from "~/contexts/User";

const ConsentPopup = () => {
	const user = useUserContext();
	const logs = useLogsContext();

	return (
		<Show when={user.data() && !logs.hasSetConsent()} fallback={null}>
			<div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
				<div class="w-11/12 max-w-md rounded-lg bg-white p-6 shadow-lg">
					<div class="mb-4 flex items-center">
						<BiSolidInfoCircle size={24} class="mr-2 text-blue-500" />
						<h2 class="text-lg font-semibold">
							Help Us Improve Your Experience
						</h2>
					</div>
					<p class="mb-4 text-gray-700">
						We use your email address to help identify and resolve issues you
						may encounter within our application. This allows us to provide you
						with better support and enhance your overall experience.
					</p>
					<div class="flex justify-end space-x-4">
						<button
							class="rounded px-4 py-2 text-gray-500 "
							onClick={() => logs.revokeConsent()}
						>
							Decline
						</button>
						<button
							class="rounded bg-blue-500 px-4 py-2 text-white"
							onClick={() => logs.grantConsent()}
						>
							Accept
						</button>
					</div>
				</div>
			</div>
		</Show>
	);
};

export default ConsentPopup;
