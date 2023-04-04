import { DevicesNav, StorageNav, SettingsNav } from "./NavButtons";

function NavBar() {
  return (
    <nav class="z-50 fixed bottom-0 flex h-[5.5rem] w-screen flex-row justify-around border border-t-2 bg-white px-4">
      {/* <DashboardNav /> */}
      <DevicesNav />
      <StorageNav />
      <SettingsNav />
    </nav>
  );
}

export default NavBar;
