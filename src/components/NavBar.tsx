import { A } from "solid-start";
import {
	DashboardNav,
	DevicesNav,
	StorageNav,
	SettingsNav,
} from "./NavButtons";

interface NavBarProps {
	// add props here
}

function NavBar(props: NavBarProps) {
	return (
		<nav class="fixed bottom-0 flex flex-row justify-between py-4 w-screen px-4 bg-gray-50 border border-t-2 transition-colors">
			<DashboardNav />
			<DevicesNav />
			<StorageNav />
			<SettingsNav />
		</nav>
	);
}

export default NavBar;
