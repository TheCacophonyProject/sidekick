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
  disabled: boolean;
  message?: string;
};

// Note: This is not generic, recommend changing it to be generic props (title etc.) if it's used more than once.
const DropdownInput: Component<DropdownInputProps> = (props) => {
  const [open, setOpen] = createSignal(false);
  const [search, setSearch] = createSignal("");
  let input: HTMLInputElement | undefined;
  let options: HTMLDivElement | undefined;
  const items = () =>
    props.options.map((option) =>
      typeof option === "string" ? option : option.value
    );
  const shownOptions = () =>
    items().filter((option) =>
      option.toLowerCase().includes(search().toLowerCase())
    );
  const [showOptions, setShowOptions] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const saveText = () => (saving() ? "Saving..." : "Save");

  const disabled = () =>
    props.disabled ||
    search() === props.value ||
    saving() ||
    !search() ||
    (Boolean(search()) && notAvailable());

  const notAvailable = () =>
    search() !== props.value && !items().includes(search());
  const existing = () => search() !== props.value && items().includes(search());
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
            <div class="w-full">
              {props.message && (
                <div class="mb-2 text-sm text-gray-500">{props.message}</div>
              )}
            </div>
            <div class="relative">
              <div class="flex items-center gap-x-2 py-1 text-sm">
                <h1 class="text-sm font-light text-gray-600">Group Name</h1>
                <Show when={search()}>
                  <Switch>
                    <Match when={search() === props.value}>
                      <p class="flex items-center space-x-2 rounded-md px-2 text-green-400 outline outline-2 outline-green-400">
                        Current
                      </p>
                    </Match>
                    <Match when={notAvailable()}>
                      <p class="flex items-center space-x-2 rounded-md px-2 text-red-500 outline outline-2 outline-red-500">
                        Not available
                      </p>
                    </Match>
                    <Match when={existing()}>
                      <p class="flex items-center space-x-2 rounded-md px-2 text-gray-500 outline outline-2 outline-gray-500">
                        Existing
                      </p>
                    </Match>
                  </Switch>
                </Show>
              </div>
              <Show when={search() && notAvailable()}>
                <p class="pb-1 text-sm text-red-500">
                  Please create group on cacophony browse first.
                </p>
              </Show>
              <div class="flex items-center space-x-2">
                <div class="relative flex w-full items-center">
                  <input
                    class="w-full rounded-lg border border-gray-300 bg-transparent  px-2 py-2 outline-none"
                    value={search()}
                    placeholder={props.value}
                    onInput={(e) => setSearch(e.currentTarget.value)}
                    onFocus={() => setShowOptions(true)}
                  />
                </div>
                <button
                  classList={{
                    "bg-gray-400": disabled(),
                    "bg-blue-500": !disabled(),
                  }}
                  class="rounded-lg px-3 py-2  text-white"
                  disabled={disabled()}
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
  onChange: (value: string) => Promise<void>;
  disabled: boolean;
  message?: string;
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
      <div class="flex w-2/5 items-center justify-start border-r bg-gray-50 px-4 py-2">
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
              disabled={val().disabled}
              message={val().message}
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
