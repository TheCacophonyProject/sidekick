// src/components/UI/ToggleSwitch.tsx
import type { Component } from "solid-js";

type ToggleSwitchProps = {
	checked: boolean;
	onChange: (checked: boolean) => void;
	disabled?: boolean;
};

export const ToggleSwitch: Component<ToggleSwitchProps> = (props) => {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={props.checked}
			onClick={() => props.onChange(!props.checked)}
			disabled={props.disabled}
			class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
			classList={{
				"bg-green-500": props.checked,
				"bg-gray-200": !props.checked,
			}}
		>
			<span
				aria-hidden="true"
				class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
				classList={{
					"translate-x-5": props.checked,
					"translate-x-0": !props.checked,
				}}
			/>
		</button>
	);
};
