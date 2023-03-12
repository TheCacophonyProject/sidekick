import { A } from "solid-start";
import {
  DashboardNav,
  DevicesNav,
  StorageNav,
  SettingsNav,
} from "./NavButtons";

function NavBar() {
  return (
    <nav class="pb-bar fixed bottom-0 flex h-28 w-screen flex-row justify-around border border-t-2 bg-gray-50 px-4">
      {/* <DashboardNav /> */}
      <DevicesNav />
      <StorageNav />
      <SettingsNav />
    </nav>
  );
}

export default NavBar;
