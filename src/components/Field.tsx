// FieldWrapper.tsx
import { Component, Match, Show, For, JSX, Switch } from "solid-js";

type DropdownOption = string | { value: string; element: JSX.Element };
type DropdownInputProps = {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
};

const DropdownInput: Component<DropdownInputProps> = (props) => {
  return (
    <select
      value={props.value}
      onChange={(e) => props.onChange(e.currentTarget.value)}
      class="select-secondary select w-full rounded-r-md border-gray-300"
    >
      <For each={props.options}>
        {(option) => (
          <option value={typeof option === "string" ? option : option.value}>
            {typeof option === "string" ? option : option.element}
          </option>
        )}
      </For>
    </select>
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

type FieldWrapperProps = FieldWrapperTextProps | FieldWrapperDropdownProps | FieldWrapperCustomProps;

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
