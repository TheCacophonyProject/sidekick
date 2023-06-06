import { IconTypes } from "solid-icons";
import { JSX, Show } from "solid-js";

const ActionContainer = (props: {
  icon?: IconTypes;
  header?: string;
  children: JSX.Element;
  action?: JSX.Element;
}) => {
  return (
    <div class="h-min-2 relative flex flex-row items-center justify-between rounded-xl bg-white px-3 py-4">
      <div class="flex w-full flex-row items-center gap-x-4">
        {props.icon && (
          <div class="text-gray-700">
            <props.icon size={38} class="text-4xl" />
          </div>
        )}
        <div class="w-full">
          <Show when={props.header}>
            <h1 class="text-base font-semibold text-gray-500">
              {props.header}
            </h1>
          </Show>
          {props.children}
        </div>
      </div>
      <div class="z-30 flex items-center justify-center">
        <Show when={props.action}>{props.action}</Show>
      </div>
    </div>
  );
};

export default ActionContainer;
