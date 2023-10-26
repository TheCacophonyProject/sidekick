// Create solid.js component that uses NotificationProvider
// to display any notifications that are passed to it

import { createSignal, createEffect, For, Show, Switch, Match } from "solid-js";
import {
  notifications,
  Notification,
  keepNotification,
  hideNotification,
} from "../contexts/Notification";
import { BiSolidError } from "solid-icons/bi";
import { FaSolidThumbsUp, FaSolidSpinner } from "solid-icons/fa";
import { BiSolidCopyAlt } from "solid-icons/bi";
import { VsChevronDown, VsClose } from "solid-icons/vs";
import { Clipboard } from "@capacitor/clipboard";

interface NotificationBarProps {
  notification: Notification;
}

function NotificationBar(props: NotificationBarProps) {
  const color = () => {
    switch (props.notification.type) {
      case "error":
        return "border-red-400";
      case "warning":
        return "border-yellow-400";
      case "success":
        return "border-green-400";
      case "loading":
        return "border-blue-400";
      default:
        return "border-gray-400";
    }
  };
  const [showDetails, setShowDetails] = createSignal(false);
  createEffect(() => {
    if (showDetails()) {
      keepNotification(props.notification.id);
    } else if (props.notification.timeout) {
      hideNotification(props.notification.id, props.notification.timeout);
    }
  });
  const [copied, setCopied] = createSignal(false);
  const writeToClipboard = async () => {
    await Clipboard.write({
      string: props.notification.details,
    });
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
    }, 6000);
  };
  return (
    <section
      class={`border-4 bg-white ${color()} relative z-50 w-full rounded-xl py-2 shadow-lg`}
    >
      <div class="mx-4 flex items-center justify-between py-1">
        <div class={` flex w-full items-center text-${color()}`}>
          <Switch>
            <Match when={props.notification.type === "error"}>
              <div class="text-red-400">
                <BiSolidError size={24} />
              </div>
            </Match>
            <Match when={props.notification.type === "warning"}>
              <div class="text-yellow-400">
                <BiSolidError size={24} />
              </div>
            </Match>
            <Match when={props.notification.type === "success"}>
              <div class="text-green-400">
                <FaSolidThumbsUp size={24} />
              </div>
            </Match>
            <Match when={props.notification.type === "loading"}>
              <div class="animate-spin text-blue-400">
                <FaSolidSpinner size={24} />
              </div>
            </Match>
          </Switch>
          <h2 class="ml-4 w-full">{props.notification.message}</h2>
        </div>
        <div class="space-y-2">
          <button
            onClick={() => {
              hideNotification(props.notification.id, 0);
            }}
          >
            <VsClose size={26} />
          </button>
          <Show when={props.notification.details}>
            <button
              onClick={() => {
                setShowDetails(!showDetails());
              }}
            >
              <VsChevronDown
                size={26}
                style={{
                  transform: showDetails() ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
            </button>
          </Show>
        </div>
      </div>
      <div class="w-full">
        <Show when={props.notification.action}>{(Action) => <Action />}</Show>
      </div>
      <Show when={props.notification.details && showDetails()}>
        <div class="relative">
          <p class="mx-4 my-2 h-24 overflow-scroll rounded-lg bg-slate-100 px-2 py-2 text-slate-800">
            <button
              class="absolute right-6 flex items-center rounded-lg bg-white px-4 py-1 text-gray-700 shadow-md"
              onClick={writeToClipboard}
            >
              {copied() ? "Copied!" : "Copy"}{" "}
              <BiSolidCopyAlt size={18} class="ml-1" />
            </button>
            {props.notification.details}
          </p>
        </div>
      </Show>
    </section>
  );
}

function NotificationPopup() {
  return (
    <div class="mt-safe absolute top-0 z-50 w-full space-y-2 px-4 pt-2">
      <For each={notifications()}>
        {(notification) => <NotificationBar notification={notification} />}
      </For>
    </div>
  );
}

export default NotificationPopup;
