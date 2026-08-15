import { describe, it, expect, vi, beforeEach } from 'vitest'

const admin = { id: '1', role: 'admin' }

describe('gerar_relatorio', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('recusa fonte inexistente', async () => {
    const tool = (await import('../../../lib/agent/tools/read/gerarRelatorio.js')).default
    await expect(tool.run(admin, {
      titulo: 'X', formato: 'csv', fontes: [{ tool: 'nao_existe', params: {} }],
    })).rejects.toThrow()
  })

  it('recusa o próprio gerar_relatorio como fonte', async () => {
    const tool = (await import('../../../lib/agent/tools/read/gerarRelatorio.js')).default
    await expect(tool.run(admin, {
      titulo: 'X', formato: 'csv', fontes: [{ tool: 'gerar_relatorio', params: {} }],
    })).rejects.toThrow()
  })

  it('recusa fonte de escrita', async () => {
    const tool = (await import('../../../lib/agent/tools/read/gerarRelatorio.js')).default
    await expect(tool.run(admin, {
      titulo: 'X', formato: 'csv', fontes: [{ tool: 'propor_criar_task', params: {} }],
    })).rejects.toThrow()
  })

  it('recusa 0 fontes e 7 fontes', async () => {
    const tool = (await import('../../../lib/agent/tools/read/gerarRelatorio.js')).default
    await expect(tool.run(admin, { titulo: 'X', formato: 'csv', fontes: [] })).rejects.toThrow()
    await expect(tool.run(admin, {
      titulo: 'X', formato: 'csv',
      fontes: Array.from({ length: 7 }, () => ({ tool: 'quem_nao_apontou', params: { periodo: 'hoje' } })),
    })).rejects.toThrow()
  })

  it('números do arquivo vêm da tool reexecutada, não de um campo linhas', async () => {
    const quem = await import('../../../lib/agent/tools/read/quemNaoApontou.js')
    vi.spyOn(quem.default, 'run').mockResolvedValue({ data: [{ pessoa: 'Zed' }], count: 1 })
    const tool = (await import('../../../lib/agent/tools/read/gerarRelatorio.js')).default
    const res = await tool.run(admin, {
      titulo: 'Ponto', formato: 'csv',
      fontes: [{ tool: 'quem_nao_apontou', params: { periodo: 'semana' }, linhas: [{ pessoa: 'FAKE' }] }],
    })
    expect(res.data.ok).toBe(true)
    expect(res.arquivo.token).toBeTruthy()
    const { get } = await import('../../../lib/agent/downloads.js')
    const rec = get(res.arquivo.token, admin)
    expect(rec.buffer.toString('utf8')).toContain('Zed')
    expect(rec.buffer.toString('utf8')).not.toContain('FAKE')
    vi.restoreAllMocks()
  })

  it('lança se todas as fontes falharem', async () => {
    const quem = await import('../../../lib/agent/tools/read/quemNaoApontou.js')
    vi.spyOn(quem.default, 'run').mockRejectedValue(new Error('fonte falhou'))
    const tool = (await import('../../../lib/agent/tools/read/gerarRelatorio.js')).default
    await expect(tool.run(admin, {
      titulo: 'X', formato: 'csv',
      fontes: [{ tool: 'quem_nao_apontou', params: { periodo: 'hoje' } }],
    })).rejects.toThrow(/não consegui montar o relatório/i)
    vi.restoreAllMocks()
  })

  it('formatos[] reexecuta as fontes uma vez e devolve um arquivo por formato', async () => {
    const quem = await import('../../../lib/agent/tools/read/quemNaoApontou.js')
    const spy = vi.spyOn(quem.default, 'run').mockResolvedValue({ data: [{ pessoa: 'Zed' }], count: 1 })
    const tool = (await import('../../../lib/agent/tools/read/gerarRelatorio.js')).default
    const res = await tool.run(admin, {
      titulo: 'Ponto', formatos: ['csv', 'md'],
      fontes: [{ tool: 'quem_nao_apontou', params: { periodo: 'hoje' } }],
    })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(res.arquivos).toHaveLength(2)
    const nomes = res.arquivos.map((a) => a.filename)
    expect(nomes.some((n) => n.endsWith('.csv'))).toBe(true)
    expect(nomes.some((n) => n.endsWith('.md'))).toBe(true)
    expect(res.arquivos.every((a) => a.token && a.bytes > 0)).toBe(true)
    expect(res.arquivo.token).toBe(res.arquivos[0].token)
    expect(res.data.arquivos.map((a) => a.formato).sort()).toEqual(['csv', 'md'])
    const { get } = await import('../../../lib/agent/downloads.js')
    expect(get(res.arquivos[0].token, admin).buffer.toString('utf8')).toContain('Zed')
    vi.restoreAllMocks()
  })

  it('recusa sem formato e sem formatos', async () => {
    const tool = (await import('../../../lib/agent/tools/read/gerarRelatorio.js')).default
    await expect(tool.run(admin, {
      titulo: 'X', fontes: [{ tool: 'quem_nao_apontou', params: { periodo: 'hoje' } }],
    })).rejects.toThrow(/formato/i)
  })
})
