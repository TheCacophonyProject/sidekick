// Create solid.js component that uses NotificationProvider
// to display any notifications that are passed to it

import { JSX, createSignal, createEffect, For, Show } from "solid-js";
import {
  notifications,
  Notification,
  keepNotification,
  hideNotification,
} from "../contexts/Notification";
import { BiSolidError } from "solid-icons/bi";
import { FaSolidThumbsUp, FaSolidSpinner } from "solid-icons/fa";
import { BiSolidCopyAlt } from "solid-icons/bi";
import { VsChevronDown } from "solid-icons/vs";
import { Clipboard } from "@capacitor/clipboard";

interface NotificationBarProps {
  notification: Notification;
}

function NotificationBar(props: NotificationBarProps) {
  const [icon, setIcon] = createSignal<JSX.Element>();
  const [color, setColor] = createSignal("border-slate-100");
  const [showDetails, setShowDetails] = createSignal(false);
  const [copied, setCopied] = createSignal(false);
  createEffect(() => {
    if (showDetails()) {
      keepNotification(props.notification.id);
    } else {
      hideNotification(props.notification.id, 2000);
    }
  });
  const writeToClipboard = async () => {
    await Clipboard.write({
      string: props.notification.details,
    });
    setCopied(true);
  };

  createEffect(() => {
    switch (props.notification.type) {
      case "error":
        setIcon(
          <div class="text-yellow-400">
            <BiSolidError size={24} />
          </div>
        );
        setColor("border-yellow-400");
        break;
      case "success":
        setIcon(
          <div class="text-green-400">
            <FaSolidThumbsUp size={24} />
          </div>
        );
        setColor("border-green-400");
        break;
      case "loading":
        setIcon(
          <div class="animate-spin text-blue-400">
            <FaSolidSpinner size={24} />
          </div>
        );
        setColor("border-blue-400");
        break;
    }
  });

  return (
    <section
      class={`border-4 bg-white ${color()} z-50 w-full rounded-xl py-2 shadow-lg`}
    >
      <div class="mx-4 flex items-center justify-between py-1">
        <div class={` flex w-full items-center text-${color()}`}>
          {icon()}
          <h2 class="ml-4 w-full">{props.notification.message}</h2>
        </div>
        <Show when={props.notification.details}>
          <button
            class="flex items-center rounded-lg py-1 px-4 text-gray-700 shadow-md"
            onClick={writeToClipboard}
          >
            {" "}
            {copied() ? "Copied!" : "Copy"}{" "}
            <BiSolidCopyAlt size={18} class="ml-1" />
          </button>
          <button
            class="pl-2"
            onClick={() => {
              setShowDetails(!showDetails());
            }}
          >
            <VsChevronDown
              size={24}
              style={{
                transform: showDetails() ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>
        </Show>
      </div>
      <Show when={props.notification.details && showDetails()}>
        <p class="my-2 mx-4 h-24 overflow-scroll rounded-lg bg-slate-100 px-2 py-2 text-slate-800">
          {props.notification.details}
        </p>
      </Show>
    </section>
  );
}

function NotificationPopup() {
  return (
    <div class="mt-safe absolute top-0 z-10 w-full space-y-2 px-4">
      <For each={notifications()}>
        {(notification) => <NotificationBar notification={notification} />}
      </For>
    </div>
  );
}

export default NotificationPopup;
