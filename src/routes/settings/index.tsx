import { JSX, Show, useContext } from "solid-js";
import { useUserContext } from "~/contexts/User";
import { IoLogInOutline } from "solid-icons/io";
import { BsPersonFill } from "solid-icons/bs";
import { ImCog, ImMobile } from "solid-icons/im";
import { BiRegularLogIn, BiRegularLogOut } from "solid-icons/bi";
import { IconTypes } from "solid-icons";
import ActionContainer from "~/components/ActionContainer";
import { logSuccess } from "~/contexts/Notification";
import { DevicePlugin, useDevice } from "~/contexts/Device";
import { A } from "solid-start";
import { RiSystemArrowRightSLine } from "solid-icons/ri";
import { Dialog } from "@capacitor/dialog";

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
  const logoutAccount = async () => {
    const { value } = await Dialog.confirm({
      title: "Confirm",
      message: `Are you sure you want to logout?`,
    });
    if (value) {
      userContext?.logout();
    }
  };

  return (
    <section class="pt-bar h-full space-y-2 bg-gray-200 px-2">
      <div class="mt-2 rounded-xl bg-slate-50 p-2">
        <h1 class="ml-2 text-xl text-neutral-500">Account</h1>
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
        <ActionContainer>
          <>
            <button
              class="flex w-full items-center justify-center space-x-2 text-2xl text-blue-500"
              onClick={logoutAccount}
            >
              Logout
              <BiRegularLogOut size={24} />
            </button>
          </>
        </ActionContainer>
      </div>
      <div class="mt-2 rounded-xl bg-slate-50 p-2">
        <h1 class="ml-2 text-xl text-neutral-500">Application</h1>
        <ActionContainer icon={ImMobile} header="App Version">
          <>
            <h1>1.1</h1>
          </>
        </ActionContainer>
        <Show when={!userContext.isProd()}>
          <ActionContainer icon={ImCog}>
            <h1>Test Mode Activated</h1>
          </ActionContainer>
        </Show>
      </div>
    </section>
  );
}

export default Settings;
