// Create solid.js component that uses NotificationProvider
// to display any notifications that are passed to it

import { JSX, createSignal, createEffect, For, Show, onMount, onCleanup } from "solid-js";
import { notifications, logError, logLoading, logSuccess, Notification, keepNotification, hideNotification } from "~/contexts/Notification";
import { BiSolidError } from 'solid-icons/bi'
import { FaSolidThumbsUp, FaSolidSpinner } from 'solid-icons/fa'
import { BiSolidCopyAlt } from 'solid-icons/bi'
import { VsChevronDown } from 'solid-icons/vs'
import { Clipboard } from '@capacitor/clipboard';

interface NotificationBarProps {
  notification: Notification
}

function NotificationBar(props: NotificationBarProps) {
  const [icon, setIcon] = createSignal<JSX.Element>()
  const [color, setColor] = createSignal("border-slate-100")
  const [showDetails, setShowDetails] = createSignal(false)
  const [copied, setCopied] = createSignal(false)
  createEffect(() => {
    if (showDetails()) {
      keepNotification(props.notification.id)
    } else {
      hideNotification(props.notification.id, 2000)
    }
  })
  const writeToClipboard = async () => {
    await Clipboard.write({
      string: props.notification.details
    })
    setCopied(true)
  }

  createEffect(() => {
    switch (props.notification.type) {
      case "error":
        setIcon(<div class="text-yellow-400"><BiSolidError size={24} /></div>)
        setColor("border-yellow-400")
        break;
      case "success":
        setIcon(<div class="text-green-400"><FaSolidThumbsUp size={24} /></div>)
        setColor("border-green-400")
        break;
      case "loading":
        setIcon(<div class="text-blue-400 animate-spin"><FaSolidSpinner size={24} /></div>)
        setColor("border-blue-400")
        break;
    }

  })

  return (
    <section class={`bg-white border-4 ${color()} shadow-lg rounded-xl py-2 w-full]`}>
      <div class="flex mx-4 items-center justify-between py-1">
        <div class={` flex items-center w-full text-${color()}`}>
          {icon()}
          <h2 class="ml-4 w-full">{props.notification.message}</h2>
        </div>
        <Show when={props.notification.details}>
          <button class="flex items-center shadow-md rounded-lg py-1 px-4 text-gray-700" onClick={writeToClipboard}> {copied() ? "Copied!" : "Copy"} < BiSolidCopyAlt size={18} class="ml-1" /></button>
          <button class="pl-2" onClick={() => { setShowDetails(!showDetails()) }}><VsChevronDown size={24} style={{ transform: showDetails() ? "rotate(180deg)" : "rotate(0deg)" }}
          /></button>
        </Show>
      </div>
      <Show when={props.notification.details && showDetails()}>
        <p class="my-2 mx-4 px-2 py-2 rounded-lg bg-slate-100 text-slate-800 h-24 overflow-scroll">
          {props.notification.details}
        </p>
      </Show>
    </section>
  )
}

function NotificationPopup() {
  return (
    <div class="absolute top-0 z-10 mt-safe space-y-2 w-full px-4">
      <For each={notifications()}>
        {(notification) => <NotificationBar notification={notification} />}
      </For>
    </div>
  )
}


export default NotificationPopup;
