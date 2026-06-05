import { useEffect } from 'react'

// Fecha um popover/dropdown quando o usuario clica fora do ref.
// active=false desliga o listener — economia quando o popover está fechado.
export function useClickOutside(ref, active, handler) {
  useEffect(() => {
    if (!active) return
    function onMouseDown(e) {
      if (ref.current && !ref.current.contains(e.target)) handler()
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [active, ref, handler])
}
