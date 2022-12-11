import { Title } from "solid-start";
import Counter from "~/components/Counter";
import { Capacitor } from "@capacitor/core";
import { createEffect, createResource } from "solid-js";

export default function Home() {
	return (
		<main class="max-w-full">
			<Title>Hello {Capacitor.getPlatform()}</Title>
			<h1>Hello {Capacitor.getPlatform()}!</h1>
			<Counter />
			<p class="max-w-full"></p>
		</main>
	);
}
