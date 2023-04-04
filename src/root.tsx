// @refresh reload
import { createEffect, ErrorBoundary, lazy, Show, Suspense } from 'solid-js';
import { Router, useNavigate, useRoutes } from '@solidjs/router';
import { Clipboard } from '@capacitor/clipboard';
import NavBar from './components/NavBar';
import { UserProvider, useUserContext } from './contexts/User';
import './root.css';
import Login from './login';
import Header from './components/Header';
import { DeviceProvider } from './contexts/Device';
import { StorageProvider } from './contexts/Storage';
import NotificationPopup from './components/NotificationPopup';
import { BiSolidCopyAlt } from 'solid-icons/bi';

const routes = [
  {
    path: '/devices',
    component: lazy(() => import('./routes/devices')),
  },
  {
    path: '/storage',
    children: [
      { path: '/', component: lazy(() => import('./routes/storage')) },
      {
        path: '/recordings',
        component: lazy(() => import('./routes/storage/recordings')),
      },
    ],
  },
  {
    path: '/settings',
    children: [
      { path: '/', component: lazy(() => import('./routes/settings')) },
      {
        path: '/user',
        component: lazy(() => import('./routes/settings/user')),
      },
    ],
  },
];

const AppRoutes = () => {
  const navigate = useNavigate();
  createEffect(() => {
    navigate('/devices', { replace: true });
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
const writeToClipboard = async (err: any) => {
  await Clipboard.write({
    string: JSON.stringify(err),
  });
};

export default function Root() {
  return (
    <main class="h-screen bg-gray-200">
      <Router>
        <Suspense>
          <ErrorBoundary
            fallback={(err) => {
              return (
                <div class="flex h-full flex-col items-center justify-center">
                  <h1 class="text-2xl font-bold">Something went wrong</h1>
                  <p class="text-lg">Please refresh the page</p>
                  <p class="flex items-center text-lg">
                    Error:
                    {err.message ?? "Couldn't get error message"}
                    <button
                      class="flex items-center rounded-lg py-1 px-4 text-gray-700 shadow-md"
                      onClick={writeToClipboard}
                    >
                      {' '}
                      {'Copy'} <BiSolidCopyAlt size={18} class="ml-1" />
                    </button>
                  </p>
                </div>
              );
            }}
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
