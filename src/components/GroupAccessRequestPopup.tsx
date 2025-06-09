import { BiSolidInfoCircle } from "solid-icons/bi";
import { Show, createSignal } from "solid-js";
import { useLogsContext } from "~/contexts/LogsContext";
import { useUserContext } from "~/contexts/User";
import { Portal } from "solid-js/web";

const GroupAccessRequestPopup = () => {
	const userContext = useUserContext();
	const logs = useLogsContext();
	const [adminEmail, setAdminEmail] = createSignal("");
	const [isRequesting, setIsRequesting] = createSignal(false);
	const [requestSent, setRequestSent] = createSignal(false);
	const [error, setError] = createSignal("");

	const handleRequestAccess = async (withAdminEmail: boolean) => {
		setError("");
		setIsRequesting(true);
		try {
			const { deviceId, deviceName, groupName } =
				userContext.userNeedsGroupAccess;

			// Validate we have either deviceId or deviceName+groupName
			if (!deviceId && (!deviceName || !groupName)) {
				setError("Device information is missing.");
				return;
			}

			const adminEmailValue = withAdminEmail ? adminEmail() : undefined;

			if (withAdminEmail && !adminEmailValue) {
				setError("Please enter an admin email.");
				return;
			}

			// Build parameters based on available data
			const params = deviceId ? { deviceId } : { deviceName, groupName };

			const success = await userContext.requestDeviceAccess(
				params,
				adminEmailValue,
			);

			if (success) {
				setRequestSent(true);
			} else {
				setError("Failed to send device access request. Please try again.");
			}
		} catch (err) {
			setError("An unexpected error occurred.");
			logs.logError({
				message: "Exception during device access request",
				error: err instanceof Error ? err : new Error(String(err)),
			});
		} finally {
			setIsRequesting(false);
		}
	};

	const onClose = () => {
		userContext.setUserNeedsGroupAccess({
			deviceId: "",
			deviceName: "",
			groupName: "",
		});
		setRequestSent(false);
		setError("");
		setAdminEmail("");
	};
	return (
		<Portal>
			<Show
				when={
					userContext.userNeedsGroupAccess.deviceId ||
					(userContext.userNeedsGroupAccess.deviceName &&
						userContext.userNeedsGroupAccess.groupName)
				}
			>
				<div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
					<div class="w-11/12 max-w-md rounded-lg bg-white p-6 shadow-lg">
						<div class="mb-4 flex items-center">
							<BiSolidInfoCircle size={24} class="mr-2 text-blue-500" />
							<h2 class="text-lg font-semibold">Device Access Required</h2>
						</div>
						<Show
							when={!requestSent()}
							fallback={
								<>
									<p class="mb-4 text-gray-700">
										Your request to join the group has been sent. You will
										receive an email once your request is processed.
									</p>
									<div class="flex justify-end">
										<button
											class="rounded bg-blue-500 px-4 py-2 text-white"
											onClick={onClose}
										>
											Close
										</button>
									</div>
								</>
							}
						>
							<p class="mb-4 text-gray-700">
								You do not have access to upload data for{" "}
								{userContext.userNeedsGroupAccess.deviceId
									? `device ID ${userContext.userNeedsGroupAccess.deviceId}`
									: userContext.userNeedsGroupAccess.groupName
										? `device ${userContext.userNeedsGroupAccess.deviceName} in group ${userContext.userNeedsGroupAccess.groupName}`
										: `device ${userContext.userNeedsGroupAccess.deviceName}`}
								.
							</p>
							<p class="mb-4 text-gray-700">
								Would you like to request access to this device? Your request
								will be sent to the group owner/admin.
							</p>

							<div class="mb-4">
								<label
									for="adminEmail"
									class="block text-sm font-medium text-gray-700"
								>
									Optional - Enter group admin email:
								</label>
								<input
									type="email"
									id="adminEmail"
									class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
									value={adminEmail()}
									onInput={(e) => setAdminEmail(e.currentTarget.value)}
									placeholder="admin@example.com"
									disabled={isRequesting()}
								/>
							</div>

							<Show when={error()}>
								<p class="mb-4 text-red-500 text-sm">{error()}</p>
							</Show>

							<div class="flex justify-end space-x-4">
								<button
									class="rounded bg-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-400 disabled:opacity-50"
									onClick={onClose}
									disabled={isRequesting()}
								>
									Cancel
								</button>
								<button
									class="rounded bg-blue-500 px-4 py-2 text-white disabled:bg-gray-300 disabled:text-gray-500 hover:bg-blue-600"
									onClick={() => handleRequestAccess(false)}
									disabled={isRequesting()}
								>
									Request Access
								</button>
							</div>
						</Show>
					</div>
				</div>
			</Show>
		</Portal>
	);
};

export default GroupAccessRequestPopup;
