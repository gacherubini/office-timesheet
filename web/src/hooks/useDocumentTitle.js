import { useEffect } from 'react'

const SUFIXO = 'Gestão VOID'

// Título da aba no formato "Página · Gestão VOID" (item 10 do PDF de ajustes).
// Sem título — ou com um título que não seja texto — fica só o nome do sistema:
// PageHeader aceita `title` como nó JSX em algumas telas, e "[object Object] ·
// Gestão VOID" seria pior que não mexer.
export function useDocumentTitle(titulo) {
  useEffect(() => {
    const texto = typeof titulo === 'string' ? titulo.trim() : ''
    document.title = texto ? `${texto} · ${SUFIXO}` : SUFIXO
  }, [titulo])
}
