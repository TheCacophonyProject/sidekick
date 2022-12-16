import { JSX, Show, useContext } from "solid-js";
import { UserContext } from "~/contexts/User";
import { IoLogInOutline } from 'solid-icons/io'
import { BsPersonFill } from "solid-icons/bs";
import { ImMobile } from 'solid-icons/im'
import { BiRegularLogIn, BiRegularLogOut } from "solid-icons/bi";
import { IconTypes } from "solid-icons";
import ActionContainer from "~/components/ActionContainer";

function Settings() {
  const [user, { logout }] = useContext(UserContext)
  const action = () =>
    <div class="text-blue-500">{user.skippedLogin()
      ? <button onClick={logout} class="flex flex-row items-center"><p class="w-32">Return to Login</p><BiRegularLogIn size={24} /></button>
      : <button class="flex flex-row items-center" onClick={logout}>Logout<BiRegularLogOut size={24} />
      </button>}
    </div>
  return (
    <div class="h-full bg-gray-200 p-2 space-y-2">
      <ActionContainer icon={BsPersonFill} action={action}>
        <>
          <Show when={user.data()?.email} fallback={<h1>Not Logged In...</h1>}>
            <h1>{user.data().email}</h1>
          </Show>
        </>
      </ActionContainer>
      <ActionContainer icon={ImMobile} header="App Version">
        <>
          <h1>0.0.1</h1>
        </>
      </ActionContainer>
    </div>
  )
}

export default Settings;