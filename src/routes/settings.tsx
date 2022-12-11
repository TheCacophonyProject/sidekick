import { JSX, Show, useContext } from "solid-js";
import { UserContext } from "~/contexts/User";
import { IoLogInOutline } from 'solid-icons/io'
import { BsPersonFill } from "solid-icons/bs";
import { ImMobile } from 'solid-icons/im'
import { BiRegularLogIn, BiRegularLogOut } from "solid-icons/bi";
import { IconTypes } from "solid-icons";

const SettingContainer = (props: { icon?: IconTypes, header?: string, children: JSX.Element, action?: JSX.Element }) => {
  return (
    <div class="flex flex-row bg-white px-4 py-4 rounded-xl justify-between items-center h-16">
      <div class="flex flex-row items-center gap-x-4">
        <div class="text-gray-700">
          {props.icon && <props.icon size={38} class="text-4xl " />}
        </div>
        <div>
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

function settings() {
  const [user, { logout }] = useContext(UserContext)
  const action = () =>
    <div class="text-blue-500">{user.skippedLogin()
      ? <button onClick={logout} class="flex flex-row items-center">Return to Login<BiRegularLogIn size={24} class="pl-2" /></button>
      : <button class="flex flex-row items-center" onClick={logout}>Logout<BiRegularLogOut size={24} class="pl-2" />
      </button>}
    </div>
  return (
    <div class="h-full bg-gray-200 p-2 space-y-2">
      <SettingContainer icon={BsPersonFill} action={action}>
        <>
          <Show when={user.data()?.email} fallback={<h1>Not Logged In...</h1>}>
            <h1>{user.data().email}</h1>
          </Show>
        </>
      </SettingContainer>
      <SettingContainer icon={ImMobile} header="App Version">
        <>
          <h1>0.0.1</h1>
        </>
      </SettingContainer>
    </div>
  )
}

export default settings;