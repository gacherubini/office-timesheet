import { useCallback, useRef, useState } from 'react'

// Item 1 do PDF de ajustes de 18/08/2026: o CEP é o primeiro campo do endereço
// e, ao completar 8 dígitos, preenche rua, bairro, cidade e UF.
//
// Chamado DIRETO do front, sem proxy no Express: não há chave a proteger e o
// ViaCEP libera CORS. Um proxy somaria um hop de latência e um ponto de falha
// para zero ganho. Contrapartida aceita: o IP do usuário chega ao ViaCEP —
// para consulta de CEP público, irrelevante.
//
// REGRA QUE NÃO PODE QUEBRAR: nada aqui trava o cadastro. Todo caminho de falha
// devolve { ok: false } e a tela libera o preenchimento manual. O ViaCEP erra em
// loteamento novo, e um cadastro que não pode ser salvo é pior que um endereço
// digitado à mão.

const URL_BASE = 'https://viacep.com.br/ws'

export function apenasDigitos(cep) {
  return String(cep || '').replace(/\D/g, '')
}

export async function buscarCep(cep, { signal } = {}) {
  const limpo = apenasDigitos(cep)
  if (limpo.length !== 8) return { ok: false, motivo: 'CEP incompleto.' }

  try {
    const res = await fetch(`${URL_BASE}/${limpo}/json/`, { signal })
    if (!res.ok) return { ok: false, motivo: 'Não consegui consultar o CEP agora.' }
    const data = await res.json()
    // O ViaCEP responde 200 com { erro: true } para CEP inexistente — não é
    // um erro de rede/servidor, é "esse CEP não existe": libera o manual.
    if (data?.erro) return { ok: false, motivo: 'CEP não encontrado. Preencha à mão.' }
    return {
      ok: true,
      dados: {
        cep: data.cep || cep,
        street: data.logradouro || null,
        district: data.bairro || null,
        city: data.localidade || null,
        uf: data.uf || null,
      },
    }
  } catch (err) {
    // Abort é o usuário continuando a digitar (buscas antigas canceladas
    // pelo useCep) — não é erro para mostrar na tela.
    if (err?.name === 'AbortError') return { ok: false, abortado: true }
    return { ok: false, motivo: 'Não consegui consultar o CEP agora.' }
  }
}

export function useCep() {
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState(null)
  const abortRef = useRef(null)

  // Cancela a busca anterior: quem digita rápido dispara várias, e sem o abort
  // a resposta de um CEP antigo poderia chegar depois e sobrescrever o novo.
  const buscar = useCallback(async (cep) => {
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac

    setErro(null)
    setBuscando(true)
    const r = await buscarCep(cep, { signal: ac.signal })
    setBuscando(false)

    if (!r.ok && !r.abortado) setErro(r.motivo)
    return r
  }, [])

  return { buscando, erro, buscar }
}
