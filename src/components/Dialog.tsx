import { ImCross } from "solid-icons/im";
import { JSX, Show, onCleanup, onMount } from "solid-js";
import { Portal } from "solid-js/web";

interface DialogProps {
  show: boolean;
  onShowChange: (show: boolean) => void;
  children: JSX.Element;
}

function Dialog(props: DialogProps) {
  let el: HTMLElement;
  onMount(() => {
    const onClick = (e: MouseEvent) => {
      if (!el?.contains(e.target as Node)) {
        props.onShowChange(false);
      }
    };
    document.body.addEventListener("click", onClick);

    onCleanup(() => document.body.removeEventListener("click", onClick));
  });
  return (
    <Show when={props.show}>
      <Portal>
        <div class="relative z-30" role="dialog" aria-modal="true">
          <div
            class="fixed inset-0 bg-black opacity-40"
            onClick={() => props.onShowChange(false)}
          />
          <div class="fixed inset-0 flex items-center justify-center">
            <div
              ref={el}
              class="w-screen max-w-xs rounded-xl bg-white  p-4 shadow-lg"
            >
              <div class="px-4 py-3">{props.children}</div>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}

export default Dialog;
