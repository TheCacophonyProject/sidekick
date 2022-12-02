import { IconProps, IconTypes } from "solid-icons";

export interface LabelledIconProps extends IconProps {
	label: string;
	icon: IconTypes;
}

function LabelledIcon(props: LabelledIconProps) {
	return (
		<>
			<props.icon {...props} />
			<h2 class="pt-1 text-xs text-slate-700">{props.label}</h2>
		</>
	);
}

export default LabelledIcon;
