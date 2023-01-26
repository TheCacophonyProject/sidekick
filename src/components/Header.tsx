import { JSXElement, createEffect, createSignal } from "solid-js";
import { A, useLocation } from "solid-start";
import { RiSystemArrowLeftSLine } from 'solid-icons/ri'

const [HeaderButton, setHeaderButton] = createSignal<JSXElement>(<></>)

function Header() {
  const location = useLocation();
  const headerMap = new Map<string, string>([
    ["/", "Devices"],
    ["/devices", "Devices"],
    ["/storage", "Storage"],
    ["/settings", "Settings"],
    ["/settings/user", "User"],
  ])
  const [header, setHeader] = createSignal(headerMap.get(location.pathname) || "Dashboard")
  const [backNav, setBackNav] = createSignal<JSXElement>(<></>)
  createEffect(() => {
    if (headerMap.has(location.pathname)) {
      setHeader(headerMap.get(location.pathname))
      // check if there is a back nav
      const link = location.pathname.split("/").slice(0, -1)
      if (link.length > 1) {
        setBackNav(<A href={link.join("/")} class="text-blue-500 flex items-center text-xl"><RiSystemArrowLeftSLine size={32} /></A>)
      } else {
        setBackNav(<></>)
      }

      setHeaderButton(<></>)
    } else {
      setHeader("")
    }
  })

  return (
    <div class="pb-4 px-6 fixed top-0 pt-safe flex items-center justify-between bg-white w-screen z-10 h-36">
      <div class="flex items-center pt-6">
        <div class="w-6 flex items-center justify-center">
          {backNav()}
        </div>
        <h2 class="text-4xl text-gray-800 font-bold ml-4">{header()}</h2>
      </div>
      <div class="pt-6">
        {HeaderButton()}
      </div>
    </div>
  )
}

export default Header;
export { setHeaderButton };