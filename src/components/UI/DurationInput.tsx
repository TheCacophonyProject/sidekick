import { type Component, createMemo } from "solid-js";

type DurationInputProps = {
    value: string;
    onChange: (value: string) => void;
};

export const DurationInput: Component<DurationInputProps> = (props) => {
    const parsedTime = createMemo(() => {
        const match = props.value?.match(/(\d+)m(\d+)s/);
        if (match) {
            return { minutes: parseInt(match[1], 10), seconds: parseInt(match[2], 10) };
        }
        return { minutes: 0, seconds: 0 };
    });

    const handleMinutesChange = (e: Event) => {
        const minutes = parseInt((e.target as HTMLInputElement).value, 10) || 0;
        props.onChange(`${minutes}m${parsedTime().seconds}s`);
    };

    const handleSecondsChange = (e: Event) => {
        const seconds = parseInt((e.target as HTMLInputElement).value, 10) || 0;
        props.onChange(`${parsedTime().minutes}m${seconds}s`);
    };

    return (
        <div class="flex items-center space-x-2">
            <input
                type="number"
                value={parsedTime().minutes}
                onInput={handleMinutesChange}
                class="w-16 rounded-md border-gray-300 text-center text-sm shadow-sm"
                min="0"
            />
            <span class="text-sm text-gray-600">min</span>
            <input
                type="number"
                value={parsedTime().seconds}
                onInput={handleSecondsChange}
                class="w-16 rounded-md border-gray-300 text-center text-sm shadow-sm"
                min="0"
                max="59"
            />
            <span class="text-sm text-gray-600">sec</span>
        </div>
    );
};