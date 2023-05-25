import { JSXElement, createEffect, createSignal } from "solid-js";
import { RiSystemArrowLeftSLine } from "solid-icons/ri";
import { ReactiveMap } from "@solid-primitives/map";
import { useLocation, A, useNavigate } from "@solidjs/router";
import { App } from "@capacitor/app";

type Header = string;
type HeaderButton = JSXElement;
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
  const [HeaderButton, setHeaderButton] = createSignal<JSXElement>(<></>);
  const [header, setHeader] = createSignal(
    headerMap.get(location.pathname) || "Dashboard"
  );
  const [backNav, setBackNav] = createSignal<JSXElement>(<></>);
  const navigate = useNavigate();
  createEffect(() => {
    if (headerMap.has(location.pathname)) {
      const newHeader = headerMap.get(location.pathname) ?? ["Dashboard"];
      setHeader((prevHeader) => {
        if (prevHeader !== newHeader) {
          setHeaderButton(newHeader[1] ?? <></>);
          return newHeader[0] ?? "";
        }
        return prevHeader;
      });
      const link = location.pathname.split("/").slice(0, -1);
      if (link.length > 1) {
        setBackNav(
          <A
            href={link.join("/")}
            class="flex items-center text-xl text-blue-500"
          >
            <RiSystemArrowLeftSLine size={32} />
          </A>
        );
        App.addListener("backButton", () => {
          navigate(link.join("/"));
        });
      } else {
        setBackNav(<></>);
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
    <div class="pt-safe fixed top-0 z-30 flex max-h-44 w-screen items-center justify-between bg-white px-6 pb-4">
      <div class="flex items-center pt-6">
        <div class="flex w-6 items-center justify-center">{backNav()}</div>
        <h2 class="ml-4 text-4xl font-bold text-gray-800">{header()}</h2>
      </div>
      <div class="pr-2 pt-6">{HeaderButton()}</div>
    </div>
  );
}

export default Header;
export { headerMap };
