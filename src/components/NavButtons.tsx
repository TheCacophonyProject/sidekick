import { A } from "@solidjs/router";
import LabelledIcon, { LabelledIconProps } from "./LabelledIcon";
import { BiSolidDashboard } from "solid-icons/bi";
import { BsCameraVideoFill, BsHddStackFill } from "solid-icons/bs";
import { IoSettingsSharp } from "solid-icons/io";
import { Show, createEffect, mergeProps } from "solid-js";
import { useStorage } from "~/contexts/Storage";

interface NavButtonProps extends LabelledIconProps {
  href?: string;
}

const formatLink = (link: string) =>
  `/${link
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase()}`;

const NavButton = (props: NavButtonProps) => {
  const mergedProps = mergeProps({ href: formatLink(props.label) }, props);
  return (
    <A
      href={mergedProps.href}
      class="relative mt-4 flex h-12 w-16  flex-col items-center outline-none transition-colors"
      style={{ "-webkit-tap-highlight-color": "transparent" }}
      activeClass="text-highlight"
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

const StorageNav = () => {
  const storage = useStorage();
  return (
    <div class="relative">
      <Show when={storage.hasItemsToUpload()}>
        <div class="absolute right-0 top-0 h-4 w-4 rounded-full bg-red-500" />
      </Show>
      <NavButton icon={BsHddStackFill} label="Storage" />
    </div>
  );
};

const SettingsNav = () => <NavButton icon={IoSettingsSharp} label="Settings" />;

export { DashboardNav, DevicesNav, StorageNav, SettingsNav };
