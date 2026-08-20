/** @vitest-environment jsdom */
// O chip interpola STATUS_STYLES[value] direto no className. Uma chave de
// COLUMNS sem entrada no mapa não quebra nada em tempo de build — só produz
// `class="... undefined ..."` e o chip aparece sem cor nenhuma. Foi assim que
// 'blocked' ("Falta info", item 8 do PDF) entrou no quadro e ficou invisível.
// Este teste amarra as duas listas: acrescentar coluna sem cor falha aqui.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { StatusChip } from './StatusChip'
import { COLUMNS } from './helpers'

afterEach(cleanup)

describe('StatusChip — toda coluna tem estilo', () => {
  it.each(COLUMNS.map((c) => [c.key, c.label]))(
    '%s renderiza o rótulo com classe de cor',
    (key, label) => {
      render(<StatusChip value={key} onChange={() => {}} />)
      const botao = screen.getByRole('button', { name: new RegExp(label, 'i') })
      expect(botao.className).not.toContain('undefined')
    }
  )
})
