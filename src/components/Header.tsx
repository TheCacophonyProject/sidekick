import { createEffect, createSignal } from "solid-js";
import { useLocation } from "solid-start";

function Header() {
  const location = useLocation();
  const headerMap = new Map<string, string>([
    ["/", "Dashboard"],
    ["/devices", "Devices"],
    ["/storage", "Storage"],
    ["/settings", "Settings"]
  ])
  const [header, setHeader] = createSignal(headerMap.get(location.pathname) || "Dashboard")

  createEffect(() => {
    if (headerMap.has(location.pathname)) {
      setHeader(headerMap.get(location.pathname))
    } else {
      setHeader("")
    }
  })

  return (
    <div class="py-4 ml-6">
      <h2 class="text-4xl text-gray-800 font-bold">{header()}</h2>
    </div>
  )
}

export default Header;