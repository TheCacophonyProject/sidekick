import { createSignal, Show, useContext } from "solid-js";
import { A, createRouteAction, Navigate } from "solid-start";
import { Browser } from "@capacitor/browser";
import { z } from "zod";
import CacaophonyLogo from "./components/CacaophonyLogo";
import { logSuccess } from "./contexts/Notification";
import { useUserContext } from "./contexts/User";
import { ImCog } from "solid-icons/im";
type LoginInput = Partial<{
  type: string;
  placeholder: string;
  name: string;
  label: string;
  invalid: boolean;
  onInput: (event: Event) => void;
}>;

const LoginInput = (props: LoginInput) => {
  return (
    <div class="flex flex-col text-gray-600">
      <label class="font-base" for={props.name}>
        {props.label}
      </label>
      <input
        class="rounded-md border-2 py-3 px-2 shadow-inner transition-colors"
        classList={{
          "border-slate-50": !props.invalid,
          "border-red-300": props.invalid,
        }}
        type={props.type}
        placeholder={props.placeholder}
        name={props.name}
        onInput={props.onInput}
      />
    </div>
  );
};

const emailSchema = z.string().email("Invalid Email");
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters");

function Login() {
  const user = useUserContext();
  const [emailError, setEmailError] = createSignal("");
  const [passwordError, setPasswordError] = createSignal("");
  const [error, setError] = createSignal("");
  const [loggingIn, setLoggingIn] = createSignal(false);
  const [_form, { Form }] = createRouteAction(async (formData: FormData) => {
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
      await user?.login(email.data, password.data).catch((error) => {
        setError("Invalid Email or Password");
      });
    }
    setLoggingIn(false);
  });
  const onInput = (event: Event) => {
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
    <Form class="mx-8 flex h-full flex-col justify-center gap-y-4 text-lg">
      <Show when={!user?.isProd()}>
        <div class="pt-safe absolute top-0 mt-8 flex items-center pr-8 font-bold text-neutral-700">
          <ImCog size={32} />
          <h1 class="ml-2">Test Mode</h1>
        </div>
      </Show>
      <div class="mb-6 mt-24" role="button" onTouchStart={logoDown}>
        <CacaophonyLogo />
      </div>
      <LoginInput
        type="email"
        placeholder="example@gmail.com"
        name="email"
        label="Email"
        invalid={Boolean(emailError())}
        onInput={onInput}
      />
      <LoginInput
        type="password"
        name="password"
        label="Password"
        invalid={Boolean(passwordError())}
        onInput={onInput}
      />
      <Show when={error} fallback={<div class="h-8" />}>
        <p class="h-8 text-red-500">{error}</p>
      </Show>
      <button
        class="mb-8 rounded-md bg-blue-500 py-4 font-semibold text-white"
        type="submit"
      >
        {loggingIn() ? "Logging In..." : "Login"}
      </button>
      <p class="text-base text-gray-600">
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
    </Form>
  );
}

export default Login;
