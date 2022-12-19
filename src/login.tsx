import { createSignal, Show, useContext } from "solid-js";
import { A, createRouteAction, Navigate } from "solid-start";
import { Browser } from '@capacitor/browser';
import { UserContext } from "./contexts/User";
import { z } from "zod"

type LoginInput = Partial<{
  type: string;
  placeholder: string;
  name: string;
  label: string;
  invalid: boolean;
  onInput: (event: Event) => void;
}>

const LoginInput = (props: LoginInput) => {
  return (
    <div class="flex flex-col text-gray-600">
      <label class="font-base" for={props.name}>{props.label}</label>
      <input class="shadow-inner rounded-md py-3 px-2 border-2 transition-colors" classList={{ "border-slate-50": !props.invalid, "border-red-300": props.invalid }} type={props.type} placeholder={props.placeholder} name={props.name} onInput={props.onInput} />
    </div>
  )
}

const emailSchema = z.string().email("Invalid Email")
const passwordSchema = z.string().min(8, "Password must be at least 8 characters")

function Login() {
  const [_user, { login, skip }] = useContext(UserContext)
  const [emailError, setEmailError] = createSignal('')
  const [passwordError, setPasswordError] = createSignal('')
  const [error, setError] = createSignal('')
  const [loggingIn, setLoggingIn] = createSignal(false)
  const [_form, { Form }] = createRouteAction(async (formData: FormData) => {
    setLoggingIn(true)
    setEmailError('')
    setPasswordError('')
    setError('')
    const email = emailSchema.safeParse(formData.get('email'))
    if (email.success === false) {
      setEmailError(email.error.message)
    }
    const password = passwordSchema.safeParse(formData.get('password'));
    if (password.success === false) {
      setPasswordError(password.error.message)
    }
    if (emailError() || passwordError()) {
      setError("Invalid Email or Password")
    }
    if (email.success && password.success) {
      await login(email.data, password.data).catch((error) => {
        setError("Invalid Email or Password")
      })
    }
    setLoggingIn(false)
  })
  const onInput = (event: Event) => {
    const target = event.target as HTMLInputElement
    if (target.name === 'email') {
      setEmailError('')
    }
    if (target.name === 'password') {
      setPasswordError('')
    }
    setError('')
  }

  return (
    <Form class="flex flex-col mx-8 gap-y-6 text-lg">
      <div class="h-40 flex items-center justify-center  rounded-full bg-slate-100 mt-8">
        <h1 class="text-4xl font-bold">Sidekick Logo</h1>
      </div>
      <LoginInput type="email" placeholder="example@gmail.com" name="email" label="Email" invalid={Boolean(emailError())} onInput={onInput} />
      <LoginInput type="password" name="password" label="Password" invalid={Boolean(passwordError())} onInput={onInput} />
      <Show when={error} fallback={<div class="h-8" />}>
        <p class="text-red-500 h-8">{error}</p>
      </Show>
      <button class="mb-8 py-4 rounded-md font-semibold bg-blue-500 text-white" type="submit">{loggingIn() ? "Logging In..." : "Login"}</button>
      <p class="text-gray-600 text-base">
        Don't have a Cacophony Account?
        <button class="text-blue-500 ml-1" onClick={() => Browser.open({ url: 'https://browse.cacophony.org.nz/register' })}>Register</button>
      </p>
      <button class="text-blue-500" onClick={(e) => {
        e.preventDefault()
        skip()
      }}>Skip Login</button>
    </Form>
  )
}

export default Login;