import { Dialog } from "@capacitor/dialog";
import { BiRegularLogOut } from "solid-icons/bi";
import { BsPersonFill } from "solid-icons/bs";
import { Show, useContext } from "solid-js";
import ActionContainer from "~/components/ActionContainer";
import { UserContext } from "~/contexts/User";

function user() {
  const [user, { logout, requestDeletion }] = useContext(UserContext)
  const logoutAccount = async () => {
    // prompt user to confirm deletion
    // if confirmed, call requestDeletion
    const { value } = await Dialog.confirm({
      title: "Confirm",
      message: `Are you sure you want to logout?`,
    })
    if (value) {
      logout()
    }
  }
  const deleteAccount = async () => {
    // prompt user to confirm logout
    // if confirmed, call logout
    const { value } = await Dialog.confirm({
      title: "Confirm",
      message: `Deletion of your account is irreversible and will take 24-48 hours to complete. Are you sure you want to delete your account?`,
    })
    if (value) {
      return requestDeletion()
    }
  }
  return (
    <div class="h-full px-2 pt-bar pb-bar space-y-2 bg-gray-200">
      <ActionContainer>
        <>
          <button class="w-full text-2xl text-blue-500 flex items-center justify-center space-x-2" onClick={logoutAccount}>Logout<BiRegularLogOut size={24} /></button>
        </>
      </ActionContainer>
      <ActionContainer>
        <>
          <button class="w-full text-2xl text-red-500" onClick={deleteAccount}>Delete Account</button>
        </>
      </ActionContainer>
    </div>
  )
}

export default user;