// Semente do eval set (§13). Cada caso: pergunta → tool esperada / regra.
// Cresce à medida que as tools alargam; roda sob demanda contra o modelo real.
export const CASES = [
  {
    nome: 'listar time (admin)',
    papel: 'admin',
    pergunta: 'quem está no time?',
    espera: { toolEsperada: 'listar_equipe' },
  },
  {
    nome: 'ambíguo pede esclarecimento',
    papel: 'admin',
    pergunta: 'qual o custo?',
    espera: { pedirEsclarecimento: true, naoInventar: true },
  },
]
