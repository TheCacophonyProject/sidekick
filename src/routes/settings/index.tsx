import { JSX, Show, useContext } from "solid-js";
import { useUserContext } from "~/contexts/User";
import { IoLogInOutline } from "solid-icons/io";
import { BsPersonFill } from "solid-icons/bs";
import { ImCog, ImMobile } from "solid-icons/im";
import { BiRegularLogIn, BiRegularLogOut } from "solid-icons/bi";
import { IconTypes } from "solid-icons";
import ActionContainer from "~/components/ActionContainer";
import { logSuccess } from "~/contexts/Notification";
import { DevicePlugin } from "~/contexts/Device";
import { A } from "solid-start";
import { RiSystemArrowRightSLine } from "solid-icons/ri";

function Settings() {
  const userContext = useUserContext();
  const action = () => (
    <div class="text-blue-500">
      <Show
        when={userContext?.skippedLogin() || !userContext?.data()}
        fallback={
          <A href="user">
            <RiSystemArrowRightSLine size={32} />
          </A>
        }
      >
        <button
          onClick={userContext?.logout}
          class="flex flex-row items-center"
        >
          <p class="w-32">Return to Login</p>
          <BiRegularLogIn size={24} />
        </button>
      </Show>
    </div>
  );
  return (
    <section class="pt-bar h-full space-y-2 bg-gray-200 px-2">
      <ActionContainer icon={BsPersonFill} action={action}>
        <div class="pt-2">
          <Show
            when={userContext?.data()?.email}
            fallback={<h1>Not Logged In...</h1>}
          >
            <h1>{userContext?.data()?.email}</h1>
          </Show>
        </div>
      </ActionContainer>
      <ActionContainer icon={ImMobile} header="App Version">
        <>
          <h1>1.0</h1>
        </>
      </ActionContainer>
      <Show when={!userContext?.data()?.prod}>
        <ActionContainer icon={ImCog}>
          <h1>Test Mode Activated</h1>
        </ActionContainer>
      </Show>
    </section>
  );
}

export default Settings;
