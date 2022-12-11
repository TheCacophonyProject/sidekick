import { useContext } from "solid-js";
import { A, createRouteAction, Navigate } from "solid-start";
import { Browser } from '@capacitor/browser';
import { UserContext } from "./contexts/User";

type LoginInput = Partial<{
  type: string;
  placeholder: string;
  name: string;
  label: string;
}>

const LoginInput = (props: LoginInput) => {
  return (
    <div class="flex flex-col text-gray-600">
      <label class="font-base" for={props.name}>{props.label}</label>
      <input class="shadow-inner rounded-md py-3 px-2" type={props.type} placeholder={props.placeholder} name={props.name} />
    </div>
  )
}

function Login() {
  const [_user, { login, skip }] = useContext(UserContext)
  const [_form, { Form }] = createRouteAction(async (formData: FormData) => {
    const email = formData.get('email');
    const password = formData.get('password');
    if (email && password && typeof email === 'string' && typeof password === 'string') {
      await login(email as string, password as string)
    }
  })
  return (
    <Form class="flex flex-col mx-8 gap-y-6 text-lg">
      <div class="h-40 flex items-center justify-center  rounded-full bg-slate-100 mt-8">
        <h1 class="text-4xl font-bold">Sidekick Logo</h1>
      </div>
      <LoginInput type="text" placeholder="example@gmail.com" name="email" label="Email" />
      <LoginInput type="password" placeholder="password" name="password" label="Password" />
      <button class="my-4 py-3 rounded-md font-semibold bg-blue-500 text-white" type="submit">Login</button>
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