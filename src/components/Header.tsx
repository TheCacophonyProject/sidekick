import { App } from "@capacitor/app";
import { ReactiveMap } from "@solid-primitives/map";
import { A, useLocation, useNavigate } from "@solidjs/router";
import { JSXElement, createEffect, createSignal } from "solid-js";

type Header = string;
type HeaderButton = () => JSXElement;
const headerMap = new ReactiveMap<string, [Header, HeaderButton?]>([
  ["/", ["Devices"]],
  ["/devices", ["Devices"]],
  ["/storage", ["Storage"]],
  ["/storage/recordings", ["Uploaded"]],
  ["/settings", ["Settings"]],
  ["/settings/user", ["User"]],
]);

function Header() {
  const location = useLocation();
  const [HeaderButton, setHeaderButton] = createSignal<HeaderButton>();
  const [header, setHeader] = createSignal<string>(
    headerMap.get(location.pathname)?.[0] ?? "Dashboard"
  );
  const [backNav, setBackNav] = createSignal<JSXElement>();
  const navigate = useNavigate();
  createEffect(() => {
    if (headerMap.has(location.pathname)) {
      const newHeader = headerMap.get(location.pathname) ?? ["Dashboard"];
      setHeaderButton(() => newHeader[1]);
      setHeader(newHeader[0]);
      const link = location.pathname.split("/").slice(0, -1);
      if (link.length > 1) {
        setBackNav(
          <A
            href={link.join("/")}
            class="flex items-center text-xl text-blue-500"
          >
            <RiArrowsArrowLeftSLine size={32} />
          </A>
        );
        App.addListener("backButton", () => {
          navigate(link.join("/"));
        });
      } else {
        setBackNav();
        App.removeAllListeners();
        App.addListener("backButton", () => {
          if (location.pathname !== "/devices") {
            navigate("/devices");
          } else {
            App.exitApp();
          }
        });
      }
    } else {
      setHeader("");
    }
  });

  return (
    <div class="pt-safe fixed top-0 z-30 flex w-screen items-center justify-between bg-white px-6 pb-3">
      <div class="flex items-center justify-end">
        <div class="flex w-6 items-center justify-center">{backNav()}</div>
        <h2 class="ml-4 text-4xl font-bold text-gray-800">{header()}</h2>
      </div>
      {HeaderButton()?.()}
    </div>
  );
}

export default Header;
export { headerMap };
