import { A } from "solid-start";
import LabelledIcon, { LabelledIconProps } from "./LabelledIcon";
import { BiSolidDashboard } from "solid-icons/bi";
import { BsCameraVideoFill, BsHddStackFill } from "solid-icons/bs";
import { IoSettingsSharp } from "solid-icons/io";
import { JSX, mergeProps } from "solid-js";

interface NavButtonProps extends LabelledIconProps {
	href?: string;
}

const formatLink = (link: string) =>
	`/${link.replace(/[^a-zA-Z0-9 ]/g, "").replace(/\s+/g, "-").toLowerCase()}`;

const NavButton = (props: NavButtonProps) => {
	const mergedProps = mergeProps({ href: formatLink(props.label) }, props);
	return (
		<A
			href={mergedProps.href}
			class="h-12 w-16 flex flex-col items-center outline-none  transition-colors pt-4"
			style="-webkit-tap-highlight-color: transparent;"
			activeClass="text-blue-500"
			inactiveClass="text-slate-300"
		>
			<LabelledIcon size={32} icon={props.icon} label={props.label} />
		</A>
	);
};

const DashboardNav = () => (
	<NavButton href="/" label="Dashboard" icon={BiSolidDashboard} />
);

const DevicesNav = () => <NavButton icon={BsCameraVideoFill} label="Devices" />;

const StorageNav = () => <NavButton icon={BsHddStackFill} label="Storage" />;

const SettingsNav = () => <NavButton icon={IoSettingsSharp} label="Settings" />;

export { DashboardNav, DevicesNav, StorageNav, SettingsNav };
