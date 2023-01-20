import { A } from "solid-start";
import {
	DashboardNav,
	DevicesNav,
	StorageNav,
	SettingsNav,
} from "./NavButtons";


function NavBar() {
	return (
		<nav class="fixed bottom-0 flex flex-row justify-around pb-bar w-screen px-4 bg-gray-50 border border-t-2">
			{/* <DashboardNav /> */}
			<DevicesNav />
			{/* <StorageNav /> */}
			<SettingsNav />
		</nav>
	);
}

export default NavBar;
