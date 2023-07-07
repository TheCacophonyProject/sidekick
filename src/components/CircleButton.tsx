import { Motion, Presence } from "@motionone/solid";
import { JSXElement, Show } from "solid-js";

interface CircleButtonProps {
  text: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  loadingIcon?: JSXElement;
  children?: JSXElement;
}

function CircleButton(props: CircleButtonProps) {
  return (
    <div class="mx-2 flex flex-col items-center">
      <button
        disabled={props.disabled}
        class="mb-2 h-20 w-20 rounded-full bg-white p-4 shadow-md"
        onClick={props.onClick}
      >
        <Presence exitBeforeEnter>
          <Show
            when={props.loading}
            fallback={
              <Show
                when={props.children}
                fallback={
                  <Motion.div
                    initial={{ opacity: 1 }}
                    exit={{ opacity: [1, 0] }}
                    transition={{ duration: 0.1 }}
                    class={`rounded-full border-2 ${
                      props.disabled ? "border-neutral-400" : "border-blue-400"
                    } h-full w-full`}
                  />
                }
              >
                <div class="flex items-center justify-center rounded-full">
                  {props.children}
                </div>
              </Show>
            }
          >
            <Show
              when={props.loadingIcon}
              fallback={
                <Motion.div
                  animate={{ scale: [0.2, 1.2], opacity: [0, 1, 0] }}
                  class="h-full w-full rounded-full border-2 border-blue-400 p-4"
                  transition={{
                    repeat: Infinity,
                    duration: 1,
                    easing: "ease-in-out",
                  }}
                />
              }
            >
              <div class="flex items-center justify-center rounded-full">
                {props.loadingIcon}
              </div>
            </Show>
          </Show>
        </Presence>
      </button>
      <p class="test-gray-600">
        {props.loading ? props.loadingText : props.text}
      </p>
    </div>
  );
}

export default CircleButton;
