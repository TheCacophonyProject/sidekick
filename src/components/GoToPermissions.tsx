import {
  AndroidSettings,
  IOSSettings,
  NativeSettings,
} from "capacitor-native-settings";

export const GoToPermissions = () => (
  <button
    class="flex w-full justify-center space-x-2 py-2 text-center text-blue-500"
    onClick={() =>
      NativeSettings.open({
        optionAndroid: AndroidSettings.ApplicationDetails,
        optionIOS: IOSSettings.App,
      })
    }
  >
    <p>Permission Settings</p>
  </button>
);
