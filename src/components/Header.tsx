import { JSXElement, createEffect, createSignal } from "solid-js";
import { useLocation } from "solid-start";

const [HeaderButton, setHeaderButton] = createSignal<JSXElement>(<></>)

function Header() {
  const location = useLocation();
  const headerMap = new Map<string, string>([
    ["/", "Devices"],
    ["/devices", "Devices"],
    ["/storage", "Storage"],
    ["/settings", "Settings"]
  ])
  const [header, setHeader] = createSignal(headerMap.get(location.pathname) || "Dashboard")

  createEffect(() => {
    if (headerMap.has(location.pathname)) {
      setHeader(headerMap.get(location.pathname))
      setHeaderButton(<></>)
    } else {
      setHeader("")
    }
  })

  return (
    <div class="pb-4 px-6 fixed top-0 pt-bar flex items-center justify-between bg-white w-screen z-10">
      <h2 class="text-4xl text-gray-800 font-bold">{header()}</h2>
      {HeaderButton()}
    </div>
  )
}

export default Header;
export { setHeaderButton };