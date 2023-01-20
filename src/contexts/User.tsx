import { registerPlugin } from "@capacitor/core";
import { createContext, createEffect, createResource, createSignal, JSX, onMount, Resource } from "solid-js";
import { createStore, Store } from "solid-js/store";
import { Preferences } from '@capacitor/preferences';
import { logError } from "./Notification";
export interface UserPlugin {
  authenticateUser(user: { email: string, password: string }): Promise<{ token: string, id: string, email: string }>;
}

const UserPlugin = registerPlugin<UserPlugin>("User");

interface User {
  token: string;
  id: string;
  email: string;
}

type UserState = Store<{
  data: Resource<User>;
  skippedLogin: Resource<boolean>;
  isAuthorized: boolean;
}>

interface UserActions {
  login(email: string, password: string): Promise<void>;
  logout(): void;
  skip(): void;
}

type UserContext = [UserState, UserActions]

export const UserContext = createContext<UserContext>()

interface UserProviderProps {
  children: JSX.Element
}

export function UserProvider(props: UserProviderProps) {
  const [storedUser, { mutate: mutateUser, refetch }] = createResource(async () => {
    const storedUser = await Preferences.get({ key: 'user' })
    if (storedUser.value) {
      const json = JSON.parse(storedUser.value)
      if (json.token && json.id && json.email) {
        return json as User
      }
    }
  })
  const [skippedLogin, { mutate: mutateSkip }] = createResource(async () => {
    const skippedLogin = await Preferences.get({ key: 'skippedLogin' })
    if (skippedLogin.value) {
      const json = JSON.parse(skippedLogin.value)
      if (json) {
        return json as boolean
      }
    }
  })
  const [user, setUser] = createStore<UserState>({
    data: storedUser,
    skippedLogin,
    isAuthorized: false,
  })

  createEffect(() => {
    if (!user.data.loading) {
      if (user.data() && user.data().token && user.data().id && user.data().email) {
        setUser('isAuthorized', true)
      } else {
        setUser('isAuthorized', false)
      }
    }
  })

  const userContext: UserContext = [
    user,
    {
      async login(email: string, password: string) {
        try {
          const { token, id } = await UserPlugin.authenticateUser({ email, password })
          Preferences.set({ key: 'user', value: JSON.stringify({ token, id, email }) })
          Preferences.set({ key: 'skippedLogin', value: "false" })
          mutateUser({ token, id, email })
          mutateSkip(false)
        } catch (error) {
          logError(`Could not login.`, error)
          throw error
        }
      },
      async logout() {
        await Preferences.set({ key: 'user', value: JSON.stringify({}) })
        await Preferences.set({ key: 'skippedLogin', value: "false" })
        mutateSkip(false)
        await refetch()
      },
      skip() {
        Preferences.set({ key: 'skippedLogin', value: "true" })
        mutateSkip(true)
      }
    }
  ]

  return (
    <UserContext.Provider value={userContext}>
      {props.children}
    </UserContext.Provider>
  )
}