import { useRef, useState, useCallback } from 'react'

// Retorna props pra spreadar num elemento + flag visual.
// `onFiles(files: File[])` é chamado quando o usuario solta arquivos.
export function useDropzone(onFiles) {
  const [dragOver, setDragOver] = useState(false)
  const depth = useRef(0)

  const onDragEnter = useCallback((e) => {
    if (!e.dataTransfer?.types?.includes('Files')) return
    e.preventDefault()
    depth.current += 1
    setDragOver(true)
  }, [])

  const onDragOver = useCallback((e) => {
    if (e.dataTransfer?.types?.includes('Files')) e.preventDefault()
  }, [])

  const onDragLeave = useCallback((e) => {
    e.preventDefault()
    depth.current = Math.max(0, depth.current - 1)
    if (depth.current === 0) setDragOver(false)
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    depth.current = 0
    setDragOver(false)
    const files = Array.from(e.dataTransfer?.files || [])
    if (files.length) onFiles(files)
  }, [onFiles])

  return { dragOver, dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop } }
}
