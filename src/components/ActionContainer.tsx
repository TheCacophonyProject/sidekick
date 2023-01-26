import { IconTypes } from "solid-icons"
import { JSX, Show } from "solid-js"

const ActionContainer = (props: { icon?: IconTypes, header?: string, children: JSX.Element, action?: JSX.Element }) => {
  return (
    <div class="flex flex-row bg-white mt-2 px-4 py-4 rounded-xl justify-between items-center h-16">
      <div class="flex flex-row items-center gap-x-4 w-full">
        <div class="text-gray-700">
          {props.icon && <props.icon size={38} class="text-4xl" />}
        </div>
        <div class="w-full">
          <Show when={props.header}>
            <h1 class="text-base font-semibold text-gray-500">{props.header}</h1>
          </Show>
          {props.children}
        </div>
      </div>
      <Show when={props.action}>
        {props.action}
      </Show>
    </div>
  )
}

export default ActionContainer