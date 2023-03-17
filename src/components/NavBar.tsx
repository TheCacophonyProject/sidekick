import { A } from "solid-start";
import {
  DashboardNav,
  DevicesNav,
  StorageNav,
  SettingsNav,
} from "./NavButtons";

function NavBar() {
  return (
    <nav class="pb-safe z-60 fixed bottom-0 flex h-[6.5rem] w-screen flex-row justify-around border border-t-2 bg-gray-50 px-4">
      {/* <DashboardNav /> */}
      <DevicesNav />
      <StorageNav />
      <SettingsNav />
    </nav>
  );
}

export default NavBar;
