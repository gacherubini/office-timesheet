# Simulador de Performance + Remoção do Dark Mode

Data: 2026-08-05

Duas mudanças na aplicação web:

1. **Simulador de Performance** — novo bloco principal na página de Performance do
   colaborador: um calendário do mês onde a pessoa simula quantas horas vai
   trabalhar por dia e vê o ganho projetado, combinando as horas já trabalhadas
   com os dias que faltam. A simulação é salva no servidor.
2. **Remoção do dark mode** — a aplicação passa a ter apenas o tema claro.

---

## Parte 1 — Simulador de Performance

### Objetivo

Dar ao colaborador uma ferramenta de "e se eu trabalhar X horas por dia?": ele
parte das horas reais já registradas no mês e simula as horas dos dias restantes,
vendo total de horas, ganho projetado (`horas × valor/hora`) e comparação com a
meta mensal de renda.

### Onde entra na página

Arquivo: `web/src/pages/PerformancePage.jsx` (componente `EmployeePerformancePage`).
Admin (`AdminPerformanceHub`) **não muda**.

Nova ordem da página:

1. `PageHeader` + navegação de mês (inalterado).
2. Linha de KPIs (inalterada).
3. **Faixa compacta** com os três painéis atuais recolhidos (ver abaixo).
4. **Simulador de Performance** — bloco principal e novo.

### Painéis atuais viram cartões recolhíveis

Os três painéis que hoje ocupam espaço na página — **Horas por projeto**,
**Tipos de tarefa mais feitas** e **Histórico — últimos meses** — passam a ser
cartões **compactos** numa faixa (grid de 3 colunas em telas largas). Cada cartão
mostra só título, ícone e uma linha de resumo (ex.: total de horas do mês, projeto
com mais horas, nº de meses no histórico) e um affordance de "abrir".

Ao clicar, o painel abre **na frente** do simulador, num `Modal`
(`web/src/components/ui/Modal.jsx`, `size="lg"`, `z-50` + backdrop já existentes)
com o conteúdo completo do painel. O conteúdo interno de cada painel
(`HoursByProject`, `TaskTypesPanel`, `HistoryStrip`) é reaproveitado sem
reescrever a lógica — apenas extraído do `<Card>` externo para poder ser
renderizado tanto no resumo quanto dentro do modal.

Apenas um modal aberto por vez. Fecha por backdrop, botão X e Esc (já suportados
pelo `Modal`).

### Comportamento do calendário

- Grade do mês (semanas × 7 dias, seg–dom), navegando junto com o seletor de mês
  que já existe no topo da página (mesmo `cursor`).
- **Dias até hoje, inclusive:** travados (read-only). Mostram as **horas reais**
  trabalhadas, vindas de `stats.daily_totals` (mapa `date → minutos`). Dias sem
  registro mostram 0.
- **Dias futuros (> hoje):** editáveis. Input de **horas decimais**, faixa 0–24,
  passo 0,5.
- **Pré-preenchimento** dos dias editáveis sem valor salvo: **8h** em dia útil,
  **0** em fim de semana e **0** em feriado nacional. Feriados via
  `web/src/lib/holidaysClient.js` (`fetchHolidays(year)`, já com cache por ano).
- Célula do "hoje" destacada visualmente.

### Cálculos (rodapé do simulador)

Para cada dia do mês: valor = real (se dia ≤ hoje) ou planejado (se dia > hoje).

- **Horas reais acumuladas** = soma dos dias ≤ hoje.
- **Horas simuladas (dias restantes)** = soma dos dias > hoje.
- **Total de horas** = reais + simuladas.
- **Ganho projetado** = `total_horas × hourly_rate` (`stats.hourly_rate`).
- **Comparação com a meta** = `stats.monthly_income_goal`: quanto falta
  (`max(0, meta − projetado)`) e % atingido (`min(100, projetado/meta)`),
  exibidos só quando a meta > 0.

Reutiliza os helpers `hm()` e `formatCurrency()` já presentes no arquivo.

### Persistência (servidor)

Só os **dias futuros editados** são gravados. As horas reais nunca são
persistidas — vêm sempre vivas de `daily_totals`.

**Migração** `src/migrations/029_performance_simulations.sql`:

```sql
CREATE TABLE IF NOT EXISTS performance_simulations (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ym         text NOT NULL,               -- 'YYYY-MM'
  planned    jsonb NOT NULL DEFAULT '{}'::jsonb,  -- { "YYYY-MM-DD": minutos }
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ym)
);

DO $$ BEGIN
  CREATE TRIGGER performance_simulations_set_updated_at
    BEFORE UPDATE ON performance_simulations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

`planned` guarda **minutos** (inteiro), para casar com o resto do sistema; o
frontend converte horas ↔ minutos na borda.

**Endpoints** em `src/routes/me.js` (padrão `requireAuth` + `query`):

- `GET /me/simulation?month=YYYY-MM` → `{ month, planned }`, onde `planned` é o
  mapa salvo (`{}` se não houver registro). Valida o formato de `month`.
- `PUT /me/simulation` body `{ month, planned }` → upsert
  (`INSERT ... ON CONFLICT (user_id, ym) DO UPDATE`). Validações:
  - `month` casa `^\d{4}-\d{2}$`;
  - `planned` é objeto; cada chave é uma data `YYYY-MM-DD` **daquele mês**;
  - cada valor é inteiro entre 0 e 1440 (24h em minutos).
  - Entradas inválidas → `400` com mensagem em pt-BR.

### Frontend do simulador

Novo componente `web/src/components/PerformanceSimulator.jsx`:

- Props: `stats` (traz `hourly_rate`, `monthly_income_goal`, `daily_totals`,
  `year`, `month`) e `cursor` (ano/mês atual da página).
- No mount / troca de mês: `GET /me/simulation?month=` para carregar `planned`.
- Monta o mapa de exibição por dia combinando: reais (`daily_totals`) para
  dias ≤ hoje; salvos ou seed(8h útil / 0) para dias > hoje.
- Ao editar um dia: atualiza estado e faz **autosave com debounce (~800ms)** via
  `PUT /me/simulation`, enviando o mapa `planned` (só dias futuros, em minutos).
  Indicador de estado "Salvando…/Salvo".
- `hourly_rate === 0`: mostra o simulador de horas normalmente, mas o ganho
  projetado aparece como indisponível (sem valor/hora definido).

### Testes

Testes de API no padrão da suíte existente (Vitest + Supertest, `test:docker`),
cobrindo:

- `GET /me/simulation` sem registro retorna `planned: {}`.
- `PUT` válido persiste e `GET` seguinte devolve o mesmo mapa (upsert).
- `PUT` com `month` malformado → 400.
- `PUT` com data fora do mês → 400.
- `PUT` com minutos fora de 0–1440 → 400.
- Exige autenticação (401 sem token).

---

## Parte 2 — Remoção do dark mode (limpeza completa)

A aplicação passa a ter só o tema claro. Nada de alternância nem de estilos dark.

### Mudanças

- **`web/src/contexts/ThemeContext.jsx`:** deletar o arquivo.
- **`web/src/main.jsx`:** remover o `import` e o wrapper `<ThemeProvider>`.
- **`web/src/components/Layout.jsx`:** remover `useTheme`, o botão de alternância
  (ícones `Sun`/`Moon`) e imports não usados.
- **`web/src/index.css`:** remover o bloco `.dark { … }` e a regra
  `.dark .form-control::-webkit-calendar-picker-indicator`. O `:root` já é
  `color-scheme: light`.
- **Componentes (29 arquivos, ~83 ocorrências):** remover todas as classes
  utilitárias `dark:` (incluindo variantes tipo `dark:hover:...`). Feito por
  script (regex removendo tokens `dark:…` das `className`), seguido de validação.
- **`web/tailwind.config.js`:** manter `darkMode: 'class'` como guarda inócua —
  sem nenhum `.dark` sendo aplicado, nenhum `dark:` remanescente pode ativar via
  preferência do SO.
- Remover a chave de localStorage do tema (`gestao-void-theme`) — some junto com
  o `ThemeContext`.

### Validação

- `npm run build` em `web/` sem erros.
- `grep -rn "dark:" web/src` retorna vazio.
- `grep -rn "useTheme\|ThemeContext\|ThemeProvider" web/src` retorna vazio.

---

## Fora de escopo (YAGNI)

- Sem alternância de tema / preferência de SO.
- Sem persistência de simulação por dispositivo além do registro por
  `(user_id, mês)` no servidor.
- Simulador não altera apontamentos reais nem cria `time_entries` — é só
  projeção.
- Sem simulador para o admin.
