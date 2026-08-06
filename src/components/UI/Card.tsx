// src/components/UI/Card.tsx
import type { Component, JSX } from "solid-js";
import { Show } from "solid-js";

type CardProps = {
	title: JSX.Element | string;
	children: JSX.Element;
};

export const Card: Component<CardProps> = (props) => {
	return (
		<div class="w-full space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
			<Show when={props.title}>
				<h3 class="text-md font-semibold text-gray-800">{props.title}</h3>
			</Show>
			{props.children}
		</div>
	);
};
