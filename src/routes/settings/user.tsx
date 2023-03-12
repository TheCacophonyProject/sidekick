import { Dialog } from "@capacitor/dialog";
import { BiRegularLogOut } from "solid-icons/bi";
import { BsPersonFill } from "solid-icons/bs";
import { Show, useContext } from "solid-js";
import ActionContainer from "~/components/ActionContainer";
import { useUserContext } from "~/contexts/User";

function user() {
  const userContext = useUserContext();
  const logoutAccount = async () => {
    const { value } = await Dialog.confirm({
      title: "Confirm",
      message: `Are you sure you want to logout?`,
    });
    if (value) {
      userContext?.logout();
    }
  };
  const deleteAccount = async () => {
    const { value } = await Dialog.confirm({
      title: "Confirm",
      message: `Deletion of your account is irreversible and will take 24-48 hours to complete. Are you sure you want to delete your account?`,
    });
    if (value) {
      return userContext?.requestDeletion();
    }
  };
  return (
    <div class="pt-bar pb-bar h-full space-y-2 bg-gray-200 px-2">
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
      <ActionContainer>
        <>
          <button class="w-full text-2xl text-red-500" onClick={deleteAccount}>
            Delete Account
          </button>
        </>
      </ActionContainer>
    </div>
  );
}

export default user;
