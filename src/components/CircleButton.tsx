import { Motion, Presence } from "@motionone/solid";
import { Show } from "solid-js";

interface CircleButtonProps {
  text: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
}

function CircleButton(props: CircleButtonProps) {
  return (
    <div class="mx-2 flex flex-col items-center">
      <button
        disabled={props.disabled}
        class="shadow-mda mb-2 rounded-full bg-white p-4"
        onClick={props.onClick}
      >
        <Presence exitBeforeEnter>
          <Show
            when={props.loading}
            fallback={
              <Motion.div
                initial={{ opacity: 1 }}
                exit={{ opacity: [1, 0] }}
                transition={{ duration: 0.1 }}
                class="rounded-full border-2 border-blue-400 p-4"
              />
            }
          >
            <Motion.div
              animate={{ scale: [0.2, 1.2], opacity: [0, 1, 0] }}
              class="rounded-full border-2 border-blue-400 p-4"
              transition={{
                repeat: Infinity,
                duration: 1,
                easing: "ease-in-out",
              }}
            />
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
