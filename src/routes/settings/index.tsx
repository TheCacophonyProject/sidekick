import { JSX, Show, useContext } from "solid-js";
import { UserContext } from "~/contexts/User";
import { IoLogInOutline } from 'solid-icons/io'
import { BsPersonFill } from "solid-icons/bs";
import { ImCog, ImMobile } from 'solid-icons/im'
import { BiRegularLogIn, BiRegularLogOut } from "solid-icons/bi";
import { IconTypes } from "solid-icons";
import ActionContainer from "~/components/ActionContainer";
import { logSuccess } from "~/contexts/Notification";
import { DevicePlugin } from "~/contexts/Device";
import { A } from "solid-start";
import { RiSystemArrowRightSLine } from 'solid-icons/ri'

function Settings() {
  const [user, { logout }] = useContext(UserContext)
  const Logout = <button class="flex flex-row items-center" onClick={logout}>Logout<BiRegularLogOut size={24} />
  </button>
  const action = () =>
    <div class="text-blue-500">{user.skippedLogin()
      ? <button onClick={logout} class="flex flex-row items-center"><p class="w-32">Return to Login</p><BiRegularLogIn size={24} /></button>
      : <A href="user"><RiSystemArrowRightSLine size={32} /></A>}
    </div>
  return (
    <section class="h-full px-2 pt-bar space-y-2 bg-gray-200">
      <ActionContainer icon={BsPersonFill} action={action}>
        <div class="pt-2">
          <Show when={user.data()?.email} fallback={<h1>Not Logged In...</h1>}>
            <h1>{user.data().email}</h1>
          </Show>
        </div>
      </ActionContainer>
      <ActionContainer icon={ImMobile} header="App Version">
        <>
          <h1>1.0</h1>
        </>
      </ActionContainer>
    </section>
  )
}

export default Settings;