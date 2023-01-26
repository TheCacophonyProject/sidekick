import { registerPlugin } from "@capacitor/core";
import { createContext, createEffect, createResource, createSignal, JSX, onMount, Resource } from "solid-js";
import { createStore, Store } from "solid-js/store";
import { Preferences } from '@capacitor/preferences';
import { logError, logSuccess } from "./Notification";
import { Result } from ".";
export interface UserPlugin {
  authenticateUser(user: { email: string, password: string }): Promise<Result<{ token: string, id: string, email: string, refreshToken: string }>>;
  requestDeletion(user: { token: string }): Promise<Result<string>>;
  validateToken(token: AuthToken): Promise<Result<AuthToken>>;
  setToProductionServer(): Promise<Result>
  setToTestServer(): Promise<Result>
}

const ApiUrl = "https://api-test.cacophony.org.nz/api/v1"

const UserPlugin = registerPlugin<UserPlugin>("User");

type AuthToken = {
  token: string;
  refreshToken: string;
  expiry: string;
}
type User = AuthToken & {
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
  requestDeletion(): Promise<{
    data: any; result: "success"
  }>;
  skip(): void;
  toggleServer(): Promise<void>;
}

type UserContext = [UserState, UserActions]

export const UserContext = createContext<UserContext>()

interface UserProviderProps {
  children: JSX.Element
}

export function UserProvider(props: UserProviderProps) {

  const [isProd, setIsProd] = createSignal(true)
  const [storedUser, { mutate: mutateUser, refetch }] = createResource(async () => {
    const storedUser = await Preferences.get({ key: 'user' })
    if (storedUser.value) {
      const json = JSON.parse(storedUser.value)
      if (json.token && json.id && json.email && json.refreshToken) {
        setIsProd(json.prod ?? true)
        if (json.prod) {
          await UserPlugin.setToProductionServer()
        } else {
          await UserPlugin.setToTestServer()
        }
        return { ...json } as User
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

  createEffect(() => {
    const currUser = user.data()
    if (currUser && currUser.token && currUser.id && currUser.email) {
      const { token, id, email, refreshToken } = currUser
      Preferences.set({ key: 'user', value: JSON.stringify({ token, id, email, expiry: currUser.expiry, refreshToken, prod: isProd() }) })
    }
  })

  const validateCurrToken = async () => {
    if (user.data() && user.data().token) {
      const { token, refreshToken, expiry, email, id } = user.data()
      console.log("Validating token", user.data())

      const result = await UserPlugin.validateToken({ token, refreshToken, expiry })
      if (result.result === "success") {
        const { token, refreshToken, expiry } = result.data
        mutateUser({ id, email, token, refreshToken, expiry })
      }
    }
  }

  const userContext: UserContext = [
    user,
    {
      async login(email: string, password: string) {
        try {
          const authUser = await UserPlugin.authenticateUser({ email, password })
          if (authUser.result !== "success") {
            logError("Could not login.")
            return
          }
          const { token, id, refreshToken } = authUser.data
          Preferences.set({ key: 'skippedLogin', value: "false" })
          mutateUser({ token, id, email, refreshToken, expiry: new Date().toISOString() })
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
      },
      async requestDeletion(): Promise<Result<string>> {
        if (!user.data()) return Promise.reject("No user to delete")
        await validateCurrToken()
        try {
          const value = await UserPlugin.requestDeletion({ token: user.data().token })
          logSuccess("Deletion request sent")
          return value
        } catch (error) {
          logError("Could not request deletion", error)
        }
      },
      async toggleServer() {
        if (isProd()) {
          const res = await UserPlugin.setToTestServer()
          if (res.result !== "success") {
            logError("Could not set to test server")
            return
          }
          setIsProd(false)
          logSuccess("Set to test server")
        } else {
          const res = await UserPlugin.setToProductionServer()
          if (res.result !== "success") {
            logError("Could not set to production server")
            return
          }
          setIsProd(true)
          logSuccess("Set to production server")
        }
      }
    }
  ]

  return (
    <UserContext.Provider value={userContext}>
      {props.children}
    </UserContext.Provider>
  )
}