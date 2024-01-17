// FieldWrapper.tsx
import { BiSolidGroup } from "solid-icons/bi";
import { ImCross } from "solid-icons/im";
import {
	Component,
	Match,
	Show,
	For,
	JSX,
	Switch,
	createSignal,
	createEffect,
	onMount,
	onCleanup,
} from "solid-js";
import { Portal } from "solid-js/web";
import { TiPlus, TiTick } from "solid-icons/ti";
import { AiFillEdit } from "solid-icons/ai";
type DropdownOption = string | { value: string; element: JSX.Element };
type DropdownInputProps = {
	value: string;
	options: DropdownOption[];
	onChange: (value: string) => Promise<void>;
};

const DropdownInput: Component<DropdownInputProps> = (props) => {
	const [open, setOpen] = createSignal(false);
	const [search, setSearch] = createSignal("");
	let input: HTMLInputElement | undefined;
	let options: HTMLDivElement | undefined;
	const items = () =>
		props.options.map((option) =>
			typeof option === "string" ? option : option.value,
		);
	const shownOptions = () =>
		items().filter((option) => option.includes(search()));
	const [showOptions, setShowOptions] = createSignal(false);
	const [saving, setSaving] = createSignal(false);
	const saveText = () => (saving() ? "Saving..." : "Save");

	createEffect(() => {
		console.log("search", search());
		console.log("shownOptions", shownOptions());
		console.log("items", items());
	});

	return (
		<>
			<div
				class="flex w-full items-center justify-between pl-2"
				onClick={() => setOpen(!open())}
			>
				<span>{props.value}</span>
				<span class="mr-4 text-gray-500">
					<AiFillEdit size={22} />
				</span>
			</div>
			<Portal>
				<Show when={open()}>
					<div class="fixed left-1/2 top-1/2 z-[100] h-auto w-11/12 -translate-x-1/2 -translate-y-1/2 transform rounded-xl border bg-white px-3 py-4  shadow-lg">
						<div class="flex items-center justify-between px-4 pb-2">
							<div class="flex items-center space-x-2  text-neutral-700">
								<BiSolidGroup size={28} />
								<h1 class="text-lg">Select Group</h1>
							</div>
							<button
								onClick={() => {
									setOpen(false);
								}}
								class="text-gray-500"
							>
								<ImCross size={12} />
							</button>
						</div>
						<div class="relative">
							<div class="flex items-center space-x-2">
								<div class="relative flex w-full items-center">
									<input
										class="w-full rounded-lg border border-gray-300 bg-transparent  px-2 py-2 outline-none"
										value={search()}
										placeholder={props.value}
										onInput={(e) => setSearch(e.currentTarget.value)}
										onFocus={() => setShowOptions(true)}
									/>
									<div class="absolute right-0 mr-1">
										<Switch>
											<Match when={search() === props.value}>
												<p class="flex items-center space-x-2 rounded-md bg-green-400 px-2 py-1 text-white">
													Current
												</p>
											</Match>
											<Match
												when={
													search() !== props.value &&
													!items().includes(search())
												}
											>
												<p class="flex items-center space-x-2 rounded-md bg-blue-500 px-2 py-1 text-white">
													New
												</p>
											</Match>
											<Match
												when={
													search() !== props.value && items().includes(search())
												}
											>
												<p class="flex items-center space-x-2 rounded-md bg-gray-500 px-2 py-1 text-white">
													Existing
												</p>
											</Match>
										</Switch>
									</div>
								</div>
								<button
									classList={{
										"bg-gray-200": search() === props.value,
										"bg-blue-500": search() !== props.value,
										"text-white": search() !== props.value,
										"text-gray-500": search() === props.value,
									}}
									class="rounded-lg px-3 py-2"
									disabled={search() === props.value}
									onClick={async () => {
										try {
											setSaving(true);
											await props.onChange(search());
											setSaving(false);
										} catch (error) {
											setSaving(false);
										}
									}}
								>
									{saveText()}
								</button>
							</div>
							<Show when={showOptions() && shownOptions().length !== 0}>
								<div
									class="absolute mt-1 max-h-48 w-full overflow-y-auto break-words rounded-lg border border-gray-300 bg-white"
									ref={options}
								>
									<For each={shownOptions()}>
										{(option) => (
											<div
												onClick={(e) => {
													setSearch(option);
													setShowOptions(false);
												}}
												class="px-2 py-2"
											>
												{option}
											</div>
										)}
									</For>
								</div>
							</Show>
						</div>
					</div>
				</Show>
			</Portal>
		</>
	);
};

type FieldWrapper = {
	value: string;
	onChange?: (value: string) => void;
};

type FieldWrapperTextProps = FieldWrapper & { type: "text" };
type FieldWrapperDropdownProps = FieldWrapper & {
	type: "dropdown";
	options: DropdownOption[];
	onChange: (value: string) => void;
};
type FieldWrapperCustomProps = Omit<FieldWrapper, "value"> & {
	type: "custom";
	children: JSX.Element;
};

type FieldWrapperProps =
	| FieldWrapperTextProps
	| FieldWrapperDropdownProps
	| FieldWrapperCustomProps;

const FieldWrapper: Component<
	FieldWrapperProps & {
		title: JSX.Element | string;
	}
> = (props) => {
	return (
		<div class="flex rounded-lg border">
			<div class="flex w-2/6 items-center justify-center border-r bg-gray-50 py-2">
				<div class="text-md font-light text-gray-700">
					<Show
						when={typeof props.title === "string" && props.title}
						fallback={props.title}
					>
						{(val) => <span>{val()}</span>}
					</Show>
				</div>
			</div>
			<Switch>
				<Match when={props.type === "text" && props.onChange}>
					<input
						type="text"
						value={(props as FieldWrapperTextProps).value!}
						onInput={(e) => props.onChange?.(e.currentTarget.value)}
						class="w-full rounded-md border-gray-300 p-2 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
					/>
				</Match>
				<Match when={props.type === "text" && !props.onChange}>
					<span class="w-full rounded-md border-gray-300 p-2 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50">
						{(props as FieldWrapperTextProps).value!}
					</span>
				</Match>
				<Match when={props.type === "dropdown" && props}>
					{(val) => (
						<DropdownInput
							options={val().options}
							value={val().value}
							onChange={val().onChange}
						/>
					)}
				</Match>
				<Match when={props.type === "custom" && props}>
					{(val) => val().children}
				</Match>
			</Switch>
		</div>
	);
};

export default FieldWrapper;
