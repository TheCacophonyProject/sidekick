import { createSignal, Show } from "solid-js";
import { Browser } from "@capacitor/browser";
import { z } from "zod";
import CacaophonyLogo from "./components/CacaophonyLogo";
import { useUserContext } from "./contexts/User";
import { ImCog } from "solid-icons/im";
import { FaRegularEye, FaRegularEyeSlash } from "solid-icons/fa";
import { useDevice } from "./contexts/Device";
type LoginInput = {
  type: string;
  placeholder?: string;
  autoComplete: string;
  name: string;
  label: string;
  invalid: boolean;
  onInput: (event: Event) => void;
};

const LoginInput = (props: LoginInput) => {
  let inputRef: HTMLInputElement | undefined;
  const [showPassword, setShowPassword] = createSignal(false);
  const [type, setType] = createSignal(props.type);

  const toggleShowPassword = () => {
    if (props.type === "password") {
      setShowPassword(!showPassword());
      if (showPassword()) {
        setType("text");
      } else {
        setType("password");
      }
      inputRef?.focus();
    }
  };

  return (
    <div class="relative flex flex-col text-gray-600">
      <label class="font-base" for={props.name}>
        {props.label}
      </label>
      <input
        ref={inputRef}
        autocomplete={props.autoComplete}
        class="rounded-md border-2 px-2 py-3 shadow-inner transition-colors"
        classList={{
          "border-slate-50": !props.invalid,
          "border-red-300": props.invalid,
        }}
        type={type()}
        placeholder={props.placeholder}
        name={props.name}
        onInput={(e) => props.onInput(e)}
        required
      />
      <Show when={props.type === "password"}>
        <button
          onClick={(e) => {
            e.preventDefault();
            toggleShowPassword();
          }}
          class="absolute inset-y-1/2 right-0 mr-4 flex h-fit items-center pt-1"
        >
          <Show when={!showPassword()} fallback={<FaRegularEye size={24} />}>
            <FaRegularEyeSlash size={24} />
          </Show>
        </button>
      </Show>
    </div>
  );
};

const emailSchema = z.string().email("Invalid Email");
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters");

function Login() {
  const user = useUserContext();
  const device = useDevice();
  let form: HTMLFormElement | undefined;
  const [emailError, setEmailError] = createSignal("");
  const [passwordError, setPasswordError] = createSignal("");

  const [error, setError] = createSignal("");
  const [loggingIn, setLoggingIn] = createSignal(false);
  const onSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    const formData = new FormData(form);
    setLoggingIn(true);
    setEmailError("");
    setPasswordError("");
    setError("");
    const email = emailSchema.safeParse(formData.get("email"));
    if (email.success === false) {
      setEmailError(email.error.message);
    }
    const password = passwordSchema.safeParse(formData.get("password"));
    if (password.success === false) {
      setPasswordError(password.error.message);
    }
    if (emailError() || passwordError()) {
      setError("Invalid Email or Password");
    }
    if (email.success && password.success) {
      if (device.apState() === "connected") {
        await device.disconnectFromDeviceAP();
      }
      await user?.login(email.data, password.data).catch(() => {
        setError("Invalid Email or Password");
      });
    }
    setLoggingIn(false);
  };
  const onInput = (event: Event) => {
    event.preventDefault();
    const target = event.target as HTMLInputElement;
    if (target.name === "email") {
      setEmailError("");
    }
    if (target.name === "password") {
      setPasswordError("");
    }
    setError("");
  };
  // Create a way to check if user is holding logo down for 5 taps
  // If so, toggle server
  const [pressed, setPressed] = createSignal(0);
  const logoDown = () => {
    setPressed(pressed() + 1);
    if (pressed() === 5) {
      user?.toggleServer();
      setPressed(0);
    }
  };

  const openRegisterPage = () => {
    Browser.open({ url: "https://browse.cacophony.org.nz/register" });
  };

  return (
    <form
      ref={form}
      class="mx-auto flex h-screen w-screen max-w-screen-sm flex-col justify-center gap-y-4 bg-white px-8 text-lg"
      onSubmit={onSubmit}
    >
      <Show when={!user?.isProd()}>
        <div class="pt-safe absolute top-0 mt-8 flex items-center pr-8 font-bold text-neutral-700">
          <ImCog size={32} />
          <h1 class="ml-2">Test Mode</h1>
        </div>
      </Show>
      <div
        class="mb-6 mt-20 max-w-[90%] justify-center"
        role="button"
        onTouchStart={logoDown}
      >
        <CacaophonyLogo />
      </div>
      <LoginInput
        autoComplete="email"
        type="email"
        placeholder="example@gmail.com"
        name="email"
        label="Email"
        invalid={Boolean(emailError())}
        onInput={onInput}
      />
      <LoginInput
        autoComplete="current-password"
        type="password"
        name="password"
        label="Password"
        invalid={Boolean(passwordError())}
        onInput={onInput}
      />
      <Show when={error} fallback={<div class="h-8" />}>
        <p class="h-8 text-red-500">{error()}</p>
      </Show>
      <button
        class="mb-8 rounded-md bg-blue-500 py-4 font-semibold text-white"
        type="submit"
      >
        {loggingIn() ? "Logging In..." : "Login"}
      </button>
      <p class="text-base text-gray-600 md:text-base">
        Don't have a Cacophony Account?
        <button class="ml-1 text-blue-500" onClick={openRegisterPage}>
          Register
        </button>
      </p>
      <button
        class="text-blue-500"
        onClick={(e) => {
          e.preventDefault();
          user?.skip();
        }}
      >
        Skip Login
      </button>
    </form>
  );
}

export default Login;
