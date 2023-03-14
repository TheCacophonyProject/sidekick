// @refresh reload
import { createEffect, Show, Suspense } from "solid-js";
import {
  Body,
  ErrorBoundary,
  FileRoutes,
  Head,
  Html,
  Meta,
  Routes,
  Scripts,
  Title,
  useNavigate,
} from "solid-start";
import NavBar from "./components/NavBar";
import { UserProvider, useUserContext } from "./contexts/User";
import "./root.css";
import Login from "./login";
import Header from "./components/Header";
import { DeviceProvider } from "./contexts/Device";
import { StorageProvider } from "./contexts/Storage";
import NotificationPopup from "./components/NotificationPopup";

const AppRoutes = () => {
  const context = useUserContext();
  return (
    <Show
      when={context?.data() || context?.skippedLogin()}
      fallback={<Login />}
    >
      <Header />
      <Routes>
        <FileRoutes />
      </Routes>
      <NavBar />
    </Show>
  );
};

export default function Root() {
  const navigate = useNavigate();
  createEffect(() => {
    navigate("/devices", { replace: true });
  });
  return (
    <Html lang="en">
      <Head>
        <Title>Sidekick</Title>
        <Meta charset="utf-8" />
        <Meta
          name="viewport"
          content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
        />
      </Head>
      <Body class="mb-safe mt-safe h-[calc(100vh-env(safe-area-inset-bottom)-env(safe-area-inset-top))]">
        <Suspense>
          <ErrorBoundary>
            <UserProvider>
              <StorageProvider>
                <DeviceProvider>
                  <AppRoutes />
                  <NotificationPopup />
                </DeviceProvider>
              </StorageProvider>
            </UserProvider>
          </ErrorBoundary>
        </Suspense>
        <Scripts />
      </Body>
    </Html>
  );
}
