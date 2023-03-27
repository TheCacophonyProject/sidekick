// @refresh reload
import { createEffect, ErrorBoundary, lazy, Show, Suspense } from "solid-js";
import { Router, useNavigate, useRoutes } from "@solidjs/router";
import NavBar from "./components/NavBar";
import { UserProvider, useUserContext } from "./contexts/User";
import "./root.css";
import Login from "./login";
import Header from "./components/Header";
import { DeviceProvider } from "./contexts/Device";
import { StorageProvider } from "./contexts/Storage";
import NotificationPopup from "./components/NotificationPopup";

const routes = [
  {
    path: "/devices",
    component: lazy(() => import("./routes/devices")),
  },
  {
    path: "/storage",
    component: lazy(() => import("./routes/storage")),
    children: [
      { path: "/", component: lazy(() => import("./routes/storage/index")) },
      {
        path: "/recordings",
        component: lazy(() => import("./routes/storage/recordings")),
      },
    ],
  },
  {
    path: "/settings",
    component: lazy(() => import("./routes/settings")),
    children: [
      { path: "/", component: lazy(() => import("./routes/settings/index")) },
      {
        path: "/user",
        component: lazy(() => import("./routes/settings/user")),
      },
    ],
  },
];

const AppRoutes = () => {
  const navigate = useNavigate();
  createEffect(() => {
    navigate("/devices", { replace: true });
  });
  const context = useUserContext();
  const Routes = useRoutes(routes);
  return (
    <Show
      when={context?.data() || context?.skippedLogin()}
      fallback={<Login />}
    >
      <Header />
      <Routes />
      <NavBar />
    </Show>
  );
};

export default function Root() {
  return (
    <main class="h-screen bg-gray-200">
      <Router>
        <Suspense>
          <ErrorBoundary
            fallback={
              <div class="flex h-full flex-col items-center justify-center">
                <h1 class="text-2xl font-bold">Something went wrong</h1>
                <p class="text-lg">Please refresh the page</p>
              </div>
            }
          >
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
      </Router>
    </main>
  );
}
