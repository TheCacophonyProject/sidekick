import { createResource, Show } from "solid-js";
import { useUserContext } from "~/contexts/User";
import { BsPersonFill } from "solid-icons/bs";
import { ImCog, ImMobile } from "solid-icons/im";
import ActionContainer from "~/components/ActionContainer";
import { A } from "@solidjs/router";
import { RiSystemArrowRightSLine } from "solid-icons/ri";
import { Dialog } from "@capacitor/dialog";
import { BiRegularLogOut } from "solid-icons/bi";
import { CacophonyPlugin } from "~/contexts/CacophonyApi";
import { Geolocation } from "@capacitor/geolocation";

function Settings() {
  const userContext = useUserContext();
  const action = () => (
    <div class="text-blue-500">
      <Show when={userContext.data()}>
        <A href="user">
          <RiSystemArrowRightSLine size={32} />
        </A>
      </Show>
    </div>
  );
  const logoutAccount = async () => {
    const { value } = await Dialog.confirm({
      title: "Confirm",
      message: `Are you sure you want to ${
        userContext.data() ? "logout" : "return to login screen"
      }?`,
    });
    if (value) {
      userContext.logout();
    }
  };
  const [version] = createResource(async () => {
    const res = await CacophonyPlugin.getAppVersion();
    if (res.success) {
      return res.data;
    } else {
      return "1.0.0";
    }
  });
  return (
    <section class="pt-bar h-full space-y-2 bg-gray-200 px-2">
      <div class="space-y-2 rounded-xl bg-slate-50 p-2">
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
              {userContext.data() ? "Logout" : "Return to Login"}
              <BiRegularLogOut size={24} />
            </button>
          </>
        </ActionContainer>
      </div>
      <div class="mt-2 space-y-2 rounded-xl bg-slate-50 p-2">
        <h1 class="ml-2 text-xl text-neutral-500">Application</h1>
        <ActionContainer icon={ImMobile} header="App Version">
          <>
            <Show when={!version.loading} fallback={<h1>...</h1>}>
              <h1>{version()}</h1>
            </Show>
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
