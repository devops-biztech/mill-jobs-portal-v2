import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // Must match the server's render (which has no `window`) on the client's
  // first render too, or React discards and re-renders the whole tree as a
  // hydration mismatch. The real value is resolved in the effect below,
  // which only runs after hydration completes.
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    onChange()
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
