# Topbar e dashboards sobre o brand book — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a sidebar por uma topbar com a assinatura oficial e redesenhar as duas home pages seguindo o brand book Studio Vivian v1.0.

**Architecture:** Direção B ("dois campos"): verde `#2E3D38` na topbar, marrom `#615142` no bloco herói de cada dashboard, e a linha contínua do grafismo sobre esses dois campos de cor. Tudo começa por corrigir os tokens do `index.css`, porque metade do trabalho é remover cores inventadas que não existem no livro.

**Tech Stack:** React 19, Vite 6, Tailwind 3, React Router 7, lucide-react, vitest (já usado na API).

**Spec:** `docs/superpowers/specs/2026-08-07-topbar-e-dashboards-brand-book-design.md`

## Global Constraints

- Paleta: **só** estes hex. `#0F0F0F` texto · `#2E3D38` e `#4C665E` verdes · `#615142` e `#2C2216` marrons · `#CB6D31` laranja · `#FFFFFF` e `#ECECEC` fundos. Cinzas intermediários vêm de `rgba(15,15,15,α)`, nunca de um hex novo.
- **Laranja `#CB6D31` só em grafismo, ponto de "ao vivo" e contador de pendências.** Nunca botão, link, barra de dados ou borda.
- **Teto de peso 500.** Nenhum `font-semibold`, `font-bold`, `font-extrabold` nos arquivos tocados.
- Título de página: Funnel Light (300) com uma palavra em Instrument Serif itálico (classe `.font-serif-em`, já existe em `index.css:56`).
- A linha do grafismo só existe sobre campo de cor sólida. Nunca sobre branco.
- **Sem raio e sem sombra no que está no fluxo da página.** Overlay (modal, toast, dropdown, popover) mantém a sombra: ali ela comunica camada. `rounded-full` sobrevive em avatar e sinal de status.
- Toda tarefa termina com `cd web && npm run build` passando.

---

### Task 1: Tokens do brand book

**Files:**
- Modify: `web/src/index.css:5-37` (o `:root`) e `:root` dos campos de formulário
- Modify: `web/tailwind.config.js:7-31`
- Modify: `web/package.json` (remover fontes órfãs)

**Interfaces:**
- Produces: os tokens CSS `--color-ink`, `--color-green`, `--color-green-dk`, `--color-brown`, `--color-brown-dk`, `--color-orange`, e as classes Tailwind `text-ink`, `bg-green-dk`, `bg-brown`, `border-subtle`, usadas por todas as tarefas seguintes.

- [ ] **Step 1: Reescrever o `:root` do `index.css`**

Substituir o bloco de cores (linhas 12-35) por:

```css
  /* ── Paleta oficial · brand book p.37 ─────────────────────── */
  --color-ink: #0F0F0F;
  --color-green-dk: #2E3D38;
  --color-green: #4C665E;
  --color-brown: #615142;
  --color-brown-dk: #2C2216;
  --color-orange: #CB6D31;

  --color-bg: #ECECEC;
  --color-surface: #FFFFFF;
  --color-surface-alt: #ECECEC;

  /* Cinzas derivados do preto — o livro não tem cinza próprio. */
  --color-text: var(--color-ink);
  --color-text-sec: rgba(15, 15, 15, 0.55);
  --color-border: rgba(15, 15, 15, 0.10);
  --color-hover: rgba(15, 15, 15, 0.04);

  /* Alias de compatibilidade: as páginas fora de escopo ainda usam accent. */
  --color-accent: var(--color-green);
  --color-accent-2: var(--color-orange);
  --color-accent-3: var(--color-brown);

  --color-field-bg: #FFFFFF;
  --color-field-text: var(--color-ink);
  --color-field-placeholder: rgba(15, 15, 15, 0.40);
  --color-field-border: rgba(15, 15, 15, 0.16);
  --color-field-focus: var(--color-green);
  --color-field-focus-ring: rgba(76, 102, 94, 0.20);
  --color-field-muted-bg: #ECECEC;
  --color-field-muted-text: rgba(15, 15, 15, 0.65);
  --color-field-muted-border: rgba(15, 15, 15, 0.16);
  color-scheme: light;
```

Remover `--shadow-card`, `--grafismo-a` e `--grafismo-b` — o grafismo passa a ser componente (Task 4) e a sombra sai do sistema (Task 2). `--color-sidebar` sai: não há mais sidebar.

- [ ] **Step 2: Ajustar o peso do `.font-display`**

Em `index.css:49-53`, trocar `font-weight: 500` por `font-weight: 300`. É o peso Light que o livro usa nos títulos (04.3).

- [ ] **Step 3: Espelhar os tokens no Tailwind**

Em `web/tailwind.config.js`, substituir o objeto `colors` inteiro por:

```js
      colors: {
        ink: 'var(--color-ink)',
        'green-dk': 'var(--color-green-dk)',
        green: 'var(--color-green)',
        brown: 'var(--color-brown)',
        'brown-dk': 'var(--color-brown-dk)',
        orange: 'var(--color-orange)',
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-alt': 'var(--color-surface-alt)',
        'text-primary': 'var(--color-text)',
        'text-secondary': 'var(--color-text-sec)',
        'border-subtle': 'var(--color-border)',
        accent: 'var(--color-accent)',
        'accent-2': 'var(--color-accent-2)',
        'accent-3': 'var(--color-accent-3)',
      },
```

E remover `boxShadow.card` do `extend` — nada mais usa sombra. O bloco `brand: {...}` (linhas 8-20) sai inteiro: são cores de uma paleta antiga que não batem com o livro.

- [ ] **Step 4: Remover as fontes órfãs**

Em `web/package.json`, remover das `dependencies`: `@fontsource-variable/inter`, `@fontsource-variable/space-grotesk`, `@fontsource/ibm-plex-mono`. Nenhum arquivo as importa — confirme antes com:

```bash
cd web && grep -rn "inter\|space-grotesk\|ibm-plex" src/ | grep -v "pointer-events\|interval\|internal"
```

Esperado: nenhum resultado. Depois `npm install` para atualizar o lockfile.

- [ ] **Step 5: Verificar o build e a tela**

```bash
cd web && npm run build && npm run dev
```

Abrir `/admin/dashboard`. Esperado: tudo ainda renderiza; o texto está preto em vez de marrom; nenhuma área ficou branca-sobre-branca. `shadow-card` some das bordas de card — é esperado, a Task 2 assume isso.

- [ ] **Step 6: Commit**

```bash
git add web/src/index.css web/tailwind.config.js web/package.json web/package-lock.json
git commit -m "feat(theme): tokens da paleta oficial do brand book Studio Vivian"
```

---

### Task 2: Primitivos na linguagem nova

**Files:**
- Modify: `web/src/components/ui/Card.jsx`
- Modify: `web/src/components/ui/PageHeader.jsx`
- Modify: `web/src/components/ui/Tabs.jsx`

**Interfaces:**
- Consumes: tokens da Task 1.
- Produces: `Card` sem raio e sem sombra; `PageHeader` que aceita `title` como nó React e não exige `subtitle`; `Tabs` com sublinhado em `--color-ink` e peso 500.

- [ ] **Step 1: Achatar o `Card`**

O livro é geométrico e trabalha em grid (p.49); não há raio nem sombra em lugar nenhum. Substituir o `className` em `Card.jsx`:

```jsx
export function Card({ as: Tag = 'div', className = '', padded = true, children, ...rest }) {
  return (
    <Tag
      className={`bg-surface border border-border-subtle ${padded ? 'p-5' : ''} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  )
}
```

Isso muda o app inteiro, inclusive as páginas fora de escopo. É intencional: deixar 18 páginas com card arredondado e 2 com card reto pareceria defeito.

- [ ] **Step 2: Título em Light no `PageHeader`**

Em `PageHeader.jsx`, trocar a linha do `h1` por:

```jsx
          <h1 className="font-display text-3xl font-light text-text-primary leading-tight">{title}</h1>
```

O `subtitle` **mantém** o Instrument Serif itálico. Só as duas dashboards ganham o título misto da hierarquia 04.3; nas outras 17 páginas o subtítulo serifado é o único lugar onde a fonte secundária da marca aparece, e tirá-lo deixaria essas páginas com menos marca do que têm hoje. Ajustar apenas a cor, que herda o token novo:

```jsx
        {subtitle && <p className="font-serif-em text-[15px] leading-snug text-text-secondary mt-1">{subtitle}</p>}
```

Trocar `font-serif italic` pela classe `.font-serif-em` de `index.css:56`, que já é exatamente isso e evita a dupla declaração.

- [ ] **Step 3: Aba ativa sem semibold**

Em `Tabs.jsx`, na variante `underline`, trocar `font-semibold` por `font-medium` e a cor da borda de `--color-accent` para `--color-ink`:

```jsx
            className={`px-5 py-3 text-sm transition-colors -mb-px ${
              active
                ? 'text-text-primary font-medium border-b-2'
                : 'text-text-secondary hover:text-text-primary border-b-2 border-transparent'
            }`}
            style={active ? { borderBottomColor: 'var(--color-ink)' } : undefined}
```

Na variante `pill`, trocar `shadow-card` por `border border-border-subtle` e remover `rounded-lg`/`rounded-md` (usar cantos retos).

- [ ] **Step 4: Achatar os outros primitivos**

Sem isto, a própria dashboard nova fica com card reto e botão arredondado dentro — o modal de sucesso do admin (`AdminDashboardPage.jsx:719-733`) usa `<Button>`. Remover o raio de cada um:

- `web/src/components/ui/Button.jsx:27` — tirar `rounded-lg` do `baseClass`
- `web/src/components/ui/Input.jsx:4` — tirar `rounded-lg`
- `web/src/components/ui/Select.jsx:15` — tirar `rounded-lg`
- `web/src/components/ui/Select.jsx:257` — tirar só `rounded-xl`, **manter `shadow-xl`**
- `web/src/components/ui/Modal.jsx:27` — tirar só `rounded-xl`, **manter `shadow-2xl`**
- `web/src/components/ui/Modal.jsx:46` — tirar `rounded-b-xl` (e o ternário que o produz)
- `web/src/components/ui/Badge.jsx:13` — tirar `rounded`

`Avatar` e `StatusDot` continuam redondos: são retrato e sinal, não moldura.

**A sombra só sai do que está no fluxo da página.** O que flutua acima do conteúdo — `Modal`, `Toast`, o dropdown do `Select`, `ActivityPopover`, `AssigneePicker`, `MentionInput`, `TaskDetailModal`, `ClockInReminder` e o painel do `NotificationBell` — mantém a elevação, porque ali a sombra comunica camada, não enfeite. Um painel branco sobre conteúdo branco separado só por um fio de 1px lê como defeito.

- [ ] **Step 5: Limpar a classe morta nas páginas que montam card à mão**

Seis lugares não usam o componente `Card` — repetem as classes na mão. Com `boxShadow.card` removido do Tailwind na Task 1, `shadow-card` vira classe morta. Em cada um, apagar `rounded-xl` e `shadow-card`, mantendo `bg-surface border border-border-subtle`:

- `web/src/pages/ForgotPasswordPage.jsx:35`
- `web/src/pages/ResetPasswordPage.jsx:58`
- `web/src/pages/ProfilePage.jsx:181` e `:321`
- `web/src/pages/TimerPage.jsx:137`
- `web/src/pages/profile/CalendarConnect.jsx:57`

Confirmar depois que não sobrou nenhuma:

```bash
cd web && grep -rn "shadow-card" src/
```

Esperado: nenhum resultado.

- [ ] **Step 6: Verificar**

```bash
cd web && npm run build && npm run dev
```

Abrir `/admin/dashboard`, `/pessoas`, `/agenda`, `/profile` e `/timer`. Esperado: cards retos com fio de 1px, sem sombra, iguais entre si; botões, campos, selects e modais igualmente retos; abas com sublinhado preto. Abrir um modal (aprovar algo em `/admin/dashboard`) e confirmar que a caixa e o botão dentro dela são retos.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/ui/ web/src/pages/ForgotPasswordPage.jsx web/src/pages/ResetPasswordPage.jsx web/src/pages/ProfilePage.jsx web/src/pages/TimerPage.jsx web/src/pages/profile/CalendarConnect.jsx
git commit -m "feat(ui): primitivos retos sem sombra e tipografia Light"
```

---

### Task 3: Modelo de navegação e períodos, com teste

Duas funções puras extraídas para poderem ser testadas sem DOM. A lógica de navegação tem três ramos de permissão e hoje mora dentro de um `useMemo` de componente (`Layout.jsx:115-147`) — é o único pedaço deste trabalho onde uma regressão silenciosa esconde uma página de alguém.

**Files:**
- Create: `web/src/lib/nav.js`
- Create: `web/src/lib/nav.test.js`
- Create: `web/src/lib/periods.js`
- Create: `web/src/lib/periods.test.js`
- Modify: `web/package.json` (devDependency + script)
- Modify: `.github/workflows/ci-cd.yml`

**Interfaces:**
- Produces: `buildNav({ isAdmin, isAdministrativeIntern }) -> Array<{to, label, icon, children?}>` e `getPeriodRange(period, today?) -> {start_date, end_date}` com `period` em `'week' | 'month' | 'quarter'`. Consumidos pelas Tasks 4 e 5.

- [ ] **Step 1: Instalar o vitest no web**

Mesma versão da API, para não ter dois runners diferentes no repo:

```bash
cd web && npm install -D vitest@^4.1.10
```

Adicionar aos `scripts` do `web/package.json`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 2: Escrever o teste de navegação (vai falhar)**

Criar `web/src/lib/nav.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { buildNav } from './nav'

const labels = (items) => items.map((i) => i.label)

describe('buildNav', () => {
  it('manda o colaborador para /dashboard e não aninha ferramentas de admin', () => {
    const nav = buildNav({})
    expect(nav[0]).toMatchObject({ label: 'Início', to: '/dashboard' })
    expect(labels(nav)).toEqual(['Início', 'Tarefas', 'Projetos', 'Pessoas', 'Agenda', 'Performance'])
    expect(nav.find((i) => i.label === 'Performance').children).toBeUndefined()
  })

  it('manda o admin para /admin/dashboard e aninha as quatro ferramentas', () => {
    const nav = buildNav({ isAdmin: true })
    expect(nav[0].to).toBe('/admin/dashboard')
    expect(labels(nav.find((i) => i.label === 'Performance').children)).toEqual([
      'Relatórios',
      'Apontamentos',
      'Bônus',
      'Despesas',
    ])
  })

  it('manda o estagiário administrativo para /admin/approvals e esconde Performance', () => {
    const nav = buildNav({ isAdministrativeIntern: true })
    expect(nav[0].to).toBe('/admin/approvals')
    expect(labels(nav)).not.toContain('Performance')
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd web && npm test`
Expected: FAIL — `Failed to resolve import "./nav"`.

- [ ] **Step 4: Implementar `nav.js`**

Criar `web/src/lib/nav.js`. É o `useMemo` de `Layout.jsx:115-147` transplantado, com "Home" renomeado para "Início" para casar com o título da página:

```js
import {
  Home,
  ListChecks,
  FolderKanban,
  Users,
  CalendarDays,
  BarChart3,
  FileText,
  Gift,
  Receipt,
} from 'lucide-react'

// Ferramentas de admin, aninhadas sob Performance.
const ADMIN_TOOLS = [
  { to: '/admin/reports', label: 'Relatórios', icon: BarChart3 },
  { to: '/admin/time-entries', label: 'Apontamentos', icon: FileText },
  { to: '/admin/manage-bonuses', label: 'Bônus', icon: Gift },
  { to: '/admin/manage-expenses', label: 'Despesas', icon: Receipt },
]

export function buildNav({ isAdmin = false, isAdministrativeIntern = false } = {}) {
  const homeTo = isAdmin
    ? '/admin/dashboard'
    : isAdministrativeIntern
      ? '/admin/approvals'
      : '/dashboard'

  const items = [
    { to: homeTo, label: 'Início', icon: Home },
    { to: '/tarefas', label: 'Tarefas', icon: ListChecks },
    { to: '/projetos', label: 'Projetos', icon: FolderKanban },
    { to: '/pessoas', label: 'Pessoas', icon: Users },
    { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  ]

  // Estagiário administrativo não acessa Performance.
  if (!isAdministrativeIntern) {
    items.push({
      to: '/performance',
      label: 'Performance',
      icon: BarChart3,
      children: isAdmin ? ADMIN_TOOLS : undefined,
    })
  }

  return items
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd web && npm test`
Expected: PASS, 3 testes.

- [ ] **Step 6: Escrever o teste de períodos (vai falhar)**

Criar `web/src/lib/periods.test.js`. 2026-08-07 é uma sexta-feira:

```js
import { describe, expect, it } from 'vitest'
import { getPeriodRange } from './periods'

describe('getPeriodRange', () => {
  it('mês corrente vai do dia 1 ao último dia', () => {
    expect(getPeriodRange('month', '2026-08-07')).toEqual({
      start_date: '2026-08-01',
      end_date: '2026-08-31',
    })
  })

  it('semana começa na segunda e termina no domingo', () => {
    expect(getPeriodRange('week', '2026-08-07')).toEqual({
      start_date: '2026-08-03',
      end_date: '2026-08-09',
    })
  })

  it('trimestre cobre os três meses do bloco', () => {
    expect(getPeriodRange('quarter', '2026-08-07')).toEqual({
      start_date: '2026-07-01',
      end_date: '2026-09-30',
    })
  })

  it('vira o ano corretamente na virada de trimestre', () => {
    expect(getPeriodRange('quarter', '2026-01-15')).toEqual({
      start_date: '2026-01-01',
      end_date: '2026-03-31',
    })
  })
})
```

- [ ] **Step 7: Rodar e ver falhar**

Run: `cd web && npm test`
Expected: FAIL — `Failed to resolve import "./periods"`.

- [ ] **Step 8: Implementar `periods.js`**

Criar `web/src/lib/periods.js`. A aritmética toda em UTC para não derrapar no fuso; o "hoje" vem do fuso do domínio, mesmo critério do `PerformanceSimulator.jsx:21`:

```js
// "Hoje" no fuso do domínio (America/Sao_Paulo). 'en-CA' já formata YYYY-MM-DD.
export function todayInSaoPaulo() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

const fmt = (date) => date.toISOString().slice(0, 10)

// Contas em UTC: o Date local mudaria de dia conforme o fuso de quem abre a tela.
export function getPeriodRange(period, today = todayInSaoPaulo()) {
  const [year, month, day] = today.split('-').map(Number)

  if (period === 'week') {
    const base = new Date(Date.UTC(year, month - 1, day))
    const mondayOffset = (base.getUTCDay() + 6) % 7
    const start = new Date(base)
    start.setUTCDate(base.getUTCDate() - mondayOffset)
    const end = new Date(start)
    end.setUTCDate(start.getUTCDate() + 6)
    return { start_date: fmt(start), end_date: fmt(end) }
  }

  if (period === 'quarter') {
    const firstMonth = Math.floor((month - 1) / 3) * 3
    return {
      start_date: fmt(new Date(Date.UTC(year, firstMonth, 1))),
      end_date: fmt(new Date(Date.UTC(year, firstMonth + 3, 0))),
    }
  }

  return {
    start_date: fmt(new Date(Date.UTC(year, month - 1, 1))),
    end_date: fmt(new Date(Date.UTC(year, month, 0))),
  }
}
```

- [ ] **Step 9: Rodar e ver passar**

Run: `cd web && npm test`
Expected: PASS, 7 testes.

- [ ] **Step 10: Ligar o teste no CI**

Em `.github/workflows/ci-cd.yml`, dentro de `strategy.matrix.include` do job `ci`, acrescentar depois da entrada `Web`:

```yaml
          - name: Web Tests
            working-directory: web
            command: npm test
```

- [ ] **Step 11: Commit**

```bash
git add web/src/lib/nav.js web/src/lib/nav.test.js web/src/lib/periods.js web/src/lib/periods.test.js web/package.json web/package-lock.json .github/workflows/ci-cd.yml
git commit -m "feat(web): extrai navegação e períodos como funções puras testadas"
```

---

### Task 4: Topbar substitui a sidebar

**Files:**
- Create: `web/src/assets/studio-vivian-hor.png` (copiar de `C:/Users/guilh/Downloads/ASSINATURA PRINCIPAL HOR - PRETO.png`)
- Create: `web/src/assets/studio-vivian-simbolo.png` (copiar de `C:/Users/guilh/Downloads/SÍMBOLO - PRETO.png`)
- Create: `web/src/components/BrandLine.jsx`
- Create: `web/src/components/Topbar.jsx`
- Modify: `web/src/components/Layout.jsx` (reescrita)
- Modify: `web/src/components/NotificationBell.jsx:66-96`

**Interfaces:**
- Consumes: `buildNav` da Task 3.
- Produces: `<BrandLine x1 y1 x2 y2 opacity />` reusado pelo herói das Tasks 5 e 7; `<Topbar />` consumido só pelo `Layout`.

- [ ] **Step 1: Copiar os arquivos da marca**

```bash
cd web/src && mkdir -p assets
cp "/c/Users/guilh/Downloads/ASSINATURA PRINCIPAL HOR - PRETO.png" assets/studio-vivian-hor.png
cp "/c/Users/guilh/Downloads/SÍMBOLO - PRETO.png" assets/studio-vivian-simbolo.png
```

Guardamos a versão **preta** e invertemos por CSS. O arquivo "BRANCO" tem exatamente o mesmo tamanho em bytes que o preto, o que indica que está trocado na origem — trocar por SVG quando a john&hackmann mandar.

- [ ] **Step 2: Criar o `BrandLine`**

Criar `web/src/components/BrandLine.jsx`:

```jsx
// Grafismo da marca (brand book 05.2): uma linha contínua que percorre o layout.
// Só existe sobre campo de cor sólida — nunca sobre branco.
export function BrandLine({ x1 = 0, y1 = 118, x2 = 100, y2 = -18, opacity = 0.3 }) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="none"
      viewBox="0 0 100 100"
    >
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={`rgba(255,255,255,${opacity})`}
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
```

`vectorEffect="non-scaling-stroke"` é o que mantém o traço em 1px mesmo com o `preserveAspectRatio="none"` esticando o viewBox.

- [ ] **Step 3: Criar o `Topbar`**

Criar `web/src/components/Topbar.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut, Menu, User, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { buildNav } from '../lib/nav'
import { useClickOutside } from '../hooks/useClickOutside'
import { Avatar } from './Avatar'
import { BrandLine } from './BrandLine'
import { NotificationBell } from './NotificationBell'
import assinatura from '../assets/studio-vivian-hor.png'
import simbolo from '../assets/studio-vivian-simbolo.png'

function NavLink({ item, active }) {
  return (
    <Link
      to={item.to}
      className={`whitespace-nowrap pb-0.5 text-[13px] transition-colors ${
        active
          ? 'border-b border-white text-white'
          : 'border-b border-transparent text-white/60 hover:text-white'
      }`}
    >
      {item.label}
    </Link>
  )
}

// Performance vira menu suspenso quando o usuário é admin.
function NavMenu({ item, active }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const location = useLocation()

  useClickOutside(ref, open, () => setOpen(false))
  useEffect(() => setOpen(false), [location.pathname])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex items-center gap-1 whitespace-nowrap pb-0.5 text-[13px] transition-colors ${
          active
            ? 'border-b border-white text-white'
            : 'border-b border-transparent text-white/60 hover:text-white'
        }`}
      >
        {item.label}
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-3 w-52 border border-border-subtle bg-surface py-1">
          <Link to={item.to} className="block px-4 py-2 text-[13px] text-text-primary hover:bg-surface-alt">
            {item.label}
          </Link>
          <div className="my-1 border-t border-border-subtle" />
          {item.children.map((child) => (
            <Link
              key={child.to}
              to={child.to}
              className="block px-4 py-2 text-[13px] text-text-secondary hover:bg-surface-alt hover:text-text-primary"
            >
              {child.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function AvatarMenu({ profile, onLogout }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useClickOutside(ref, open, () => setOpen(false))

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Conta">
        <Avatar name={profile?.name} url={profile?.avatar_url} size={28} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-3 w-56 border border-border-subtle bg-surface py-1">
          <div className="border-b border-border-subtle px-4 py-3">
            <p className="truncate text-[13px] text-text-primary">{profile?.name || 'Usuário'}</p>
            <p className="mt-0.5 truncate text-[11px] text-text-secondary">{profile?.email}</p>
          </div>
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2 text-[13px] text-text-secondary hover:bg-surface-alt hover:text-text-primary"
          >
            <User size={14} /> Perfil
          </Link>
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] text-text-secondary hover:bg-surface-alt hover:text-text-primary"
          >
            <LogOut size={14} /> Sair
          </button>
        </div>
      )}
    </div>
  )
}

export function Topbar() {
  const { profile, isAdmin, isAdministrativeIntern, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const nav = buildNav({ isAdmin, isAdministrativeIntern })

  useEffect(() => setDrawerOpen(false), [location.pathname])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  function isActive(item) {
    if (location.pathname === item.to) return true
    return Boolean(item.children?.some((c) => c.to === location.pathname))
  }

  return (
    <header className="sticky top-0 z-30 bg-green-dk">
      <div className="relative flex h-14 items-center gap-6 overflow-hidden px-4 md:px-6">
        <BrandLine />

        <button
          type="button"
          onClick={() => setDrawerOpen((o) => !o)}
          aria-label={drawerOpen ? 'Fechar menu' : 'Abrir menu'}
          className="relative z-10 text-white md:hidden"
        >
          {drawerOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <Link to={nav[0].to} className="relative z-10 flex flex-none items-center gap-3">
          <img src={assinatura} alt="Studio Vivian" className="hidden h-3.5 w-auto invert md:block" />
          <img src={simbolo} alt="Studio Vivian" className="h-5 w-auto invert md:hidden" />
          <span className="hidden h-4 w-px bg-white/25 lg:block" />
          <span className="hidden text-[13px] font-light tracking-wide text-white/80 lg:block">
            Gestão VOID
          </span>
        </Link>

        <nav className="relative z-10 hidden items-center gap-5 md:flex">
          {nav.map((item) =>
            item.children ? (
              <NavMenu key={item.label} item={item} active={isActive(item)} />
            ) : (
              <NavLink key={item.label} item={item} active={isActive(item)} />
            ),
          )}
        </nav>

        <div className="relative z-10 ml-auto flex items-center gap-4">
          <NotificationBell />
          <AvatarMenu profile={profile} onLogout={handleLogout} />
        </div>
      </div>

      {drawerOpen && (
        <nav className="border-t border-white/10 bg-green-dk px-4 pb-3 md:hidden">
          {nav.map((item) => (
            <div key={item.label}>
              <Link to={item.to} className="block py-2.5 text-[14px] text-white/80">
                {item.label}
              </Link>
              {item.children?.map((child) => (
                <Link key={child.to} to={child.to} className="block py-2 pl-4 text-[13px] text-white/55">
                  {child.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      )}
    </header>
  )
}
```

O `useClickOutside` recebe a ref, não devolve — assinatura `(ref, active, handler)`, mesmo uso de `ActivityPopover.jsx:13` e `AssigneePicker.jsx:12`.

- [ ] **Step 4: Reescrever o `Layout`**

Substituir `web/src/components/Layout.jsx` inteiro:

```jsx
import { Topbar } from './Topbar'
import { ClockInReminder } from './ClockInReminder'

export function Layout({ children }) {
  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <Topbar />
      <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      <ClockInReminder />
    </div>
  )
}
```

Some tudo: `NavRow`, `NavSubRow`, `isSidebarPinned`, `isSidebarHovered`, a chave `sidebarPinned` do localStorage, e o bloco de grafismo decorativo das linhas 266-279 — que desenhava a marca atrás de cards opacos e nunca apareceu.

O `<main>` fica **sem** `max-w`: `AdminTimeEntriesPage` e `AdminReportsPage` são tabelas largas que hoje usam a largura toda. As páginas que querem se estreitar já trazem a própria `max-w` (`EmployeeDashboardPage.jsx:98`, `ProfilePage.jsx:166`, `PerformancePage.jsx:206`).

- [ ] **Step 5: Tirar o `NotificationBell` de flutuante**

Em `NotificationBell.jsx`, o wrapper (linha 66) passa de posicionamento fixo para inline, e o botão perde a pílula branca — agora ele vive sobre o campo verde:

```jsx
    <div ref={wrapRef} className="relative hidden md:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Notificações"
        aria-label="Notificações"
        className="relative inline-flex h-8 w-8 items-center justify-center text-white/70 transition-colors hover:text-white"
      >
```

Remover o `style` de `boxShadow` do botão e o `<span>` do `animate-ping` (linhas 78-84). O contador (linha 87) troca `font-bold` por `font-medium`, `ring-2 ring-bg` por `ring-1 ring-green-dk`, e o fundo de `var(--color-accent)` para `var(--color-orange)` — contador de pendências é exatamente o "pequeno detalhe" que o livro reserva ao laranja.

No painel suspenso, trocar `rounded-2xl` por nada e `font-semibold` por `font-medium`.

- [ ] **Step 6: Verificar nos três papéis**

```bash
cd web && npm run build && npm run dev
```

Conferir, logando com cada tipo de conta:
- Admin: topbar mostra Início/Tarefas/Projetos/Pessoas/Agenda/Performance, e Performance abre com Relatórios, Apontamentos, Bônus e Despesas.
- Colaborador: Performance aparece sem menu suspenso; "Início" leva a `/dashboard`.
- Estagiário administrativo: sem Performance; "Início" leva a `/admin/approvals`.
- Em qualquer papel: sino abre o painel, avatar abre Perfil/Sair, a linha do grafismo é visível sobre o verde.
- Em 375px de largura: a assinatura vira só o símbolo e o menu abre em gaveta.

- [ ] **Step 7: Commit**

```bash
git add web/src/assets web/src/components/BrandLine.jsx web/src/components/Topbar.jsx web/src/components/Layout.jsx web/src/components/NotificationBell.jsx
git commit -m "feat(nav): topbar com a assinatura oficial substitui a sidebar"
```

---

### Task 5: Período e bloco herói no dashboard admin

**Files:**
- Modify: `web/src/pages/admin/AdminDashboardPage.jsx:14-15, 147-184, 333-373`

**Interfaces:**
- Consumes: `getPeriodRange` (Task 3), `BrandLine` (Task 4).

- [ ] **Step 1: Trocar o intervalo fixo por período selecionável**

Remover `FULL_RANGE_START` e `FULL_RANGE_END` (linhas 14-15). No corpo do componente, substituir as duas primeiras linhas de estado:

```jsx
  const [period, setPeriod] = useState('month')
  const { start_date: startDate, end_date: endDate } = getPeriodRange(period)
```

E importar no topo: `import { getPeriodRange } from '../../lib/periods'`.

O `useEffect` que busca o dashboard (linhas 175-184) já depende de `[startDate, endDate]`, então passa a refazer a busca quando o período muda — nada a alterar ali.

- [ ] **Step 2: Trocar o `PageHeader` pelo título da marca com seletor**

Substituir a linha 335 (`<PageHeader title="Início" subtitle="Visão geral da operação" />`) por:

```jsx
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-3xl font-light leading-tight">
          Visão geral da <span className="font-serif-em">operação</span>
        </h1>
        <div className="flex gap-4">
          {[
            { value: 'week', label: 'Semana' },
            { value: 'month', label: 'Mês' },
            { value: 'quarter', label: 'Trimestre' },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPeriod(option.value)}
              className={`pb-0.5 text-[10px] uppercase tracking-[.18em] transition-colors ${
                period === option.value
                  ? 'border-b border-ink text-text-primary'
                  : 'border-b border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
```

O import de `PageHeader` pode sair se nada mais o usar no arquivo.

- [ ] **Step 3: Trocar a faixa de KPIs pelo bloco herói marrom**

Substituir o `<Card>` de KPIs inteiro (linhas 343-373) por:

```jsx
      <div className="relative mb-4 flex flex-wrap items-end justify-between gap-8 overflow-hidden bg-brown px-6 py-6 text-white">
        <BrandLine x1={6} y1={112} x2={94} y2={-12} opacity={0.34} />
        <div className="relative z-10">
          <p className="text-[9px] uppercase tracking-[.2em] text-white/60">Horas da equipe</p>
          <p className="mt-2 font-display text-5xl font-light leading-none tabular-nums">
            {loading ? '—' : formatHM(kpis?.total_minutes ?? 0)}
          </p>
        </div>
        <div className="relative z-10 flex gap-9 pb-1">
          <div>
            <p className="text-[9px] uppercase tracking-[.2em] text-white/60">Usuários ativos</p>
            <p className="mt-2 font-display text-2xl font-light leading-none tabular-nums">
              {loading ? '—' : `${kpis?.active_users ?? 0} de ${kpis?.total_users ?? 0}`}
            </p>
          </div>
          <div>
            <p className="text-[9px] uppercase tracking-[.2em] text-white/60">Projetos ativos</p>
            <p className="mt-2 font-display text-2xl font-light leading-none tabular-nums">
              {loading ? '—' : `${kpis?.active_projects ?? 0} de ${kpis?.total_projects ?? 0}`}
            </p>
          </div>
        </div>
      </div>
```

Importar `BrandLine` de `../../components/BrandLine`.

- [ ] **Step 4: Verificar**

```bash
cd web && npm run build && npm run dev
```

Abrir `/admin/dashboard`. Esperado: bloco marrom com a linha atravessando; "Horas da equipe" agora mostra o mês corrente e **cai muito** em relação ao número de antes, que era o acumulado desde 2000; clicar em Semana/Trimestre refaz a busca e muda os três números.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/admin/AdminDashboardPage.jsx
git commit -m "feat(admin): período selecionável e bloco herói marrom na home"
```

---

### Task 6: Ao vivo e fila única de aprovações

Hoje "Solicitações", "Despesas" e "Férias" são três cards de estrutura idêntica empilhados na coluna direita (linhas 462-713): avatar, texto, Aprovar/Rejeitar. Viram uma fila só com etiqueta de tipo. As três chamadas de API e as seis funções de decisão não mudam.

**Files:**
- Modify: `web/src/pages/admin/AdminDashboardPage.jsx:78-145, 375-717`

- [ ] **Step 1: Trocar o `LiveNowCard` por uma faixa horizontal**

Substituir o componente `LiveNowCard` (linhas 78-145) por:

```jsx
// Resumo "Ao vivo" na home: quem está com o ponto rodando ou pausado agora.
// O painel completo (com offline e intervalos) fica em /admin/live.
function LiveNowStrip({ live }) {
  const online = (live || []).filter((m) => m.status === 'running' || m.status === 'paused')
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 border border-border-subtle bg-surface px-5 py-2.5">
      <span className="flex items-center gap-2 text-[9px] uppercase tracking-[.2em] text-text-secondary">
        <span className="h-1.5 w-1.5 rounded-full bg-orange" />
        Ao vivo · {online.length}
      </span>
      {online.length === 0 ? (
        <span className="text-[12px] text-text-secondary">Ninguém batendo ponto agora.</span>
      ) : (
        online.map((user) => (
          <span key={user.id} className="flex items-center gap-2 text-[12px]">
            <Avatar name={user.name} url={user.avatar_url} size={22} />
            {user.name.split(' ')[0]}
            <span className="text-text-secondary">
              · {user.status === 'paused' ? 'pausado' : user.task || user.project || 'em andamento'}
            </span>
          </span>
        ))
      )}
      <Link
        to="/admin/live"
        className="ml-auto border-b border-ink text-[9px] uppercase tracking-[.18em] text-text-primary"
      >
        Painel completo
      </Link>
    </div>
  )
}
```

Na árvore, apagar a chamada `<LiveNowCard live={live} />` de dentro da coluna esquerda (linha 458) e pôr `<LiveNowStrip live={live} />` logo depois do bloco herói, antes do `<div className="flex flex-col lg:flex-row gap-5">` — a faixa atravessa a largura toda, não mora numa coluna.

- [ ] **Step 2: Montar a fila unificada**

Acima do `return` do componente, derivar uma lista só a partir dos três estados que já existem:

```jsx
  // Solicitações, despesas e férias são a mesma tarefa do gestor: decidir.
  // Viram uma fila só, com etiqueta de tipo.
  const pending = [
    ...requests.map((r) => ({
      key: `req-${r.id}`,
      type: 'Horas',
      who: r.profile?.name || 'Colaborador',
      detail: `${r.time_entry?.project?.name || '-'}, ${isoToDateKey(r.time_entry?.started_at)} — ${formatRange(r.time_entry?.started_at, r.time_entry?.ended_at)} passa a ${formatRange(r.requested_started_at, r.requested_ended_at)}`,
      busy: decidingId === r.id,
      onApprove: () => approveRequest(r.id),
      onReject: () => rejectRequest(r.id),
    })),
    ...expenses.map((e) => ({
      key: `exp-${e.id}`,
      type: 'Despesa',
      who: e.profile?.name || 'Colaborador',
      detail: `${e.title} — ${formatCurrency(e.amount)}`,
      busy: decidingExpenseId === e.id,
      onApprove: () => approveExpense(e.id),
      onReject: () => rejectExpense(e.id),
    })),
    ...vacations.map((v) => ({
      key: `vac-${v.id}`,
      type: 'Férias',
      who: v.profile?.name || 'Colaborador',
      detail: `${formatDate(v.start_date)} → ${formatDate(v.end_date)}, ${formatDays(v.days_count)}`,
      busy: decidingVacationId === v.id,
      onApprove: () => approveVacation(v.id),
      onReject: () => rejectVacation(v.id),
    })),
  ]

  const pendingLoading = requestsLoading || expensesLoading || vacationsLoading
```

- [ ] **Step 3: Substituir os três cards por um**

Trocar os três `<Card>` da coluna direita (linhas 462-713) por:

```jsx
          <Card padded={false}>
            <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
              <h2 className="text-[9px] uppercase tracking-[.2em] text-text-secondary">
                Precisa de você
              </h2>
              {pending.length > 0 && (
                <span className="text-[11px] font-medium tabular-nums text-orange">{pending.length}</span>
              )}
            </div>
            <div className="divide-y divide-border-subtle">
              {pendingLoading ? (
                <p className="px-5 py-8 text-center text-sm text-text-secondary">Carregando...</p>
              ) : pending.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-text-secondary">
                  Nada esperando por você.
                </p>
              ) : (
                pending.map((item) => (
                  <div key={item.key} className="px-5 py-3.5">
                    <p className="text-[9px] uppercase tracking-[.2em] text-brown">
                      {item.type} · {item.who}
                    </p>
                    <p className="mt-1.5 text-[12px] text-text-secondary">{item.detail}</p>
                    <div className="mt-2.5 flex gap-2">
                      <button
                        type="button"
                        onClick={item.onApprove}
                        disabled={item.busy}
                        className="bg-green-dk px-3 py-1.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                      >
                        Aprovar
                      </button>
                      <button
                        type="button"
                        onClick={item.onReject}
                        disabled={item.busy}
                        className="border border-border-subtle px-3 py-1.5 text-[11px] font-medium text-text-primary transition-colors hover:bg-surface-alt disabled:opacity-60"
                      >
                        Rejeitar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
```

O `<BirthdayCalendar />` continua logo abaixo, na mesma coluna. Os ícones `Check`, `X`, `Receipt`, `CalendarOff` e `Radio` podem sair do import se nada mais os usar.

- [ ] **Step 4: Verificar com dados reais**

```bash
cd web && npm run build && npm run dev
```

Com pelo menos uma solicitação de hora, uma despesa e uma férias pendentes: as três aparecem na mesma fila com as etiquetas certas, o contador em laranja bate com o total, e aprovar cada uma continua funcionando (o modal de sucesso aparece e o item some da fila). A faixa "Ao vivo" mostra quem está com o ponto rodando.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/admin/AdminDashboardPage.jsx
git commit -m "feat(admin): fila única de aprovações e faixa Ao vivo na home"
```

---

### Task 7: Home do colaborador

**Files:**
- Modify: `web/src/pages/EmployeeDashboardPage.jsx:24-40, 97-160`

- [ ] **Step 1: Título com o nome em serif itálico**

Substituir o bloco "Hero" (linhas 99-105) por:

```jsx
      <div className="mb-6">
        <h1 className="font-display text-4xl font-light leading-tight">
          Olá, <span className="font-serif-em">{firstName}</span>
        </h1>
      </div>
```

Some o ponto final decorativo, que era o único lugar onde o serif da marca aparecia.

- [ ] **Step 2: Bloco herói marrom no lugar da faixa de KPIs**

Substituir o `<Card>` de estatísticas (linhas 108-113) por:

```jsx
      <div className="relative mb-4 flex flex-wrap items-end justify-between gap-8 overflow-hidden bg-brown px-6 py-6 text-white">
        <BrandLine x1={6} y1={112} x2={94} y2={-12} opacity={0.34} />
        <div className="relative z-10">
          <p className="text-[9px] uppercase tracking-[.2em] text-white/60">Horas no mês</p>
          <p className="mt-2 font-display text-5xl font-light leading-none tabular-nums">
            {statsLoading ? '—' : formatHM(stats?.total_minutes ?? 0)}
          </p>
        </div>
        <div className="relative z-10 pb-1">
          <p className="text-[9px] uppercase tracking-[.2em] text-white/60">Projetos</p>
          <p className="mt-2 font-display text-2xl font-light leading-none tabular-nums">
            {statsLoading ? '—' : (stats?.project_count ?? 0)}
          </p>
        </div>
      </div>
```

Importar `BrandLine` de `../components/BrandLine`. O componente `StatTile` (linhas 24-40) e os ícones `Clock3`/`FolderKanban` podem sair se nada mais os usar.

- [ ] **Step 3: Barra de proporção em marrom e pesos no teto**

No `SectionCard` (linhas 42-64), trocar `text-[11px] font-semibold uppercase` por `text-[9px] uppercase tracking-[.2em]`, e remover o quadrado colorido do ícone (linhas 47-49) — vira só o texto.

Na linha 145, a barra de proporção troca de verde para marrom:

```jsx
                          <div className="h-full" style={{ width: `${pct}%`, background: 'var(--color-brown)' }} />
```

Remover o `rounded-full` da barra e do trilho (linha 144). E em toda a página, trocar os `font-semibold` restantes por `font-medium`.

- [ ] **Step 4: Verificar**

```bash
cd web && npm run build && npm run dev
```

Logar como colaborador e abrir `/dashboard`. Esperado: "Olá, *Nome*" com o nome em serifa itálica; bloco marrom com a linha; barras de proporção marrons; nenhum texto em semibold.

- [ ] **Step 5: Rodar a suíte inteira e commitar**

```bash
cd web && npm test && npm run build
git add web/src/pages/EmployeeDashboardPage.jsx
git commit -m "feat(dashboard): home do colaborador na linguagem do brand book"
```

---

### Task 8: Varredura de peso tipográfico

O livro define Light, Regular e Medium (04.1). O código tem **163 ocorrências de peso acima disso em 41 arquivos**. Sem esta varredura, as duas dashboards ficam com teto 500 e as outras dezoito continuam pesadas — a mesma seção parece mais gorda em `/pessoas` do que em `/admin/dashboard`.

**Files:**
- Modify: os 41 arquivos que casam com `font-(semibold|bold|extrabold)` em `web/src/`

- [ ] **Step 1: Fotografar o estado atual**

```bash
cd web/src && grep -roE 'font-(semibold|bold|extrabold)' . | wc -l
```

Esperado: 163. Se o número tiver mudado, as tarefas anteriores já reduziram parte — siga assim mesmo.

- [ ] **Step 2: Trocar tudo por `font-medium`**

```bash
cd web/src && grep -rlE 'font-(semibold|bold|extrabold)' . | xargs sed -i -E 's/font-(semibold|bold|extrabold)/font-medium/g'
```

- [ ] **Step 3: Confirmar que zerou**

```bash
cd web/src && grep -rnE 'font-(semibold|bold|extrabold)' . | wc -l
```

Esperado: 0.

- [ ] **Step 4: Conferir hierarquia onde o negrito estava segurando peso**

```bash
cd web && npm run build && npm run dev
```

Percorrer `/pessoas`, `/projetos`, `/agenda`, `/admin/time-entries`, `/admin/reports` e `/performance`. Em cada tela, procurar onde o negrito era o **único** separador entre título e corpo — cabeçalho de coluna, total de rodapé, nome sobre cargo. Onde a hierarquia tiver achatado, recuperá-la por **tamanho ou caixa alta espaçada**, nunca voltando o peso:

```jsx
// antes: <span className="text-sm font-semibold">Total</span>
// depois: <span className="text-[10px] uppercase tracking-[.2em] text-text-secondary">Total</span>
```

Ajustar só onde ficou realmente ilegível. Não é uma passada de redesenho — é conserto pontual.

- [ ] **Step 5: Commit**

```bash
git add web/src
git commit -m "refactor(theme): teto de peso em Medium, conforme brand book 04.1"
```

---

### Task 9: Simulador de performance sem laranja

O `PerformanceSimulator` usa o laranja como cor funcional inteira — chip, checkbox, campo, borda tracejada, legenda, texto e total. São 10 pontos, e é o oposto do que o livro reserva ao laranja. O marrom é cor principal, então aguenta esse peso, e ainda faz `/performance` conversar com o bloco herói das dashboards.

**Files:**
- Modify: `web/src/components/PerformanceSimulator.jsx:200, 258, 273, 296, 311, 342, 343, 349, 360, 420`
- Modify: `web/src/index.css` (remover o alias morto)

- [ ] **Step 1: Trocar o token nas dez ocorrências**

```bash
cd web/src && sed -i 's/--color-accent-2/--color-brown/g' components/PerformanceSimulator.jsx
```

A semântica não muda: marrom continua querendo dizer "isto é projeção, não realizado". O que muda é que a cor agora é uma das duas principais da marca, em vez da que o livro manda usar com conta-gotas.

- [ ] **Step 2: Aposentar o alias**

Depois da Task 4 (que apaga o grafismo decorativo do `Layout`) e deste passo, `--color-accent-2` não tem mais consumidor. Confirmar e remover de `web/src/index.css`:

```bash
cd web/src && grep -rn "accent-2" . | grep -v "index.css"
```

Esperado: nenhum resultado. Então apagar a linha `--color-accent-2: var(--color-orange);` do `:root` e a entrada `'accent-2'` do `web/tailwind.config.js`.

- [ ] **Step 3: Verificar**

```bash
cd web && npm run build && npm run dev
```

Abrir `/performance` e mexer no simulador: a legenda, as células editáveis, o checkbox de fim de semana e o total projetado ficam marrons; nada laranja sobra na página. Comparar lado a lado com `/admin/dashboard` — as duas telas agora usam o mesmo marrom.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/PerformanceSimulator.jsx web/src/index.css web/tailwind.config.js
git commit -m "refactor(performance): simulador em marrom, liberando o laranja para detalhe"
```

---

### Task 10: Telas de autenticação

`/login`, `/forgot-password` e `/reset-password` ficam **fora do `Layout`** (`App.jsx:50-52`), então nenhuma tarefa anterior as alcança. São as únicas telas que 100% dos usuários veem, e hoje usam o `Logo.jsx` improvisado — o SVG aproximado que o `Layout` também usava e que some na Task 4.

O `LoginPage` já acerta mais coisa que o resto do app: o painel esquerdo é `#2E3D38` da paleta, tem a linha diagonal sobre campo sólido, e o título já mistura Funnel com Instrument Serif itálico, que é exatamente a hierarquia 04.3. O que está errado são as cores improvisadas em volta.

**Files:**
- Modify: `web/src/pages/LoginPage.jsx:4, 35, 38-45, 49, 55, 60, 69`
- Modify: `web/src/pages/ForgotPasswordPage.jsx:4, 31`
- Modify: `web/src/pages/ResetPasswordPage.jsx:4, 54`
- Modify: `web/src/pages/TimerPage.jsx:147`
- Modify: `web/src/index.css:10`
- Delete: `web/src/components/Logo.jsx`

- [ ] **Step 1: Trocar o logo improvisado pela assinatura oficial**

Nos quatro pontos (`LoginPage:49` e `:69`, `ForgotPasswordPage:31`, `ResetPasswordPage:54`), trocar o import e o uso. Sobre o painel verde usa-se a versão invertida; sobre branco, a preta:

```jsx
import assinatura from '../assets/studio-vivian-hor.png'

// sobre o painel verde (LoginPage:49) — substitui o <Logo> e o <span> ao lado:
<img src={assinatura} alt="Studio Vivian" className="h-4 w-auto invert" />

// sobre fundo branco (LoginPage:69, ForgotPasswordPage:31, ResetPasswordPage:54):
<img src={assinatura} alt="Studio Vivian" className="h-4 w-auto" />
```

Onde havia `<span>Gestão VOID</span>` ao lado do logo, manter o texto em `font-light`, separado por um fio de 1px, igual à topbar.

- [ ] **Step 2: Corrigir os hex fora da paleta**

- `LoginPage:35` — `color: '#ECE7DF'` vira `color: '#FFFFFF'`. O `#ECE7DF` é um creme que não existe na paleta.
- `LoginPage:55` — `color: '#E4A063'` vira `var(--color-orange)`. Era um laranja clarinho inventado.
- `LoginPage:60` — `rgba(236,231,223,0.6)` vira `rgba(255,255,255,0.6)`.
- `LoginPage:44` — `stroke="rgba(236,231,223,0.12)"` vira `rgba(255,255,255,0.22)`.

O fundo `#2E3D38` (`LoginPage:35`) está certo e fica.

- [ ] **Step 3: Uma linha só, e fora o brilho**

O livro fala em "uma linha contínua" (05.1). Hoje são duas linhas mais um brilho radial laranja. Apagar o `<div>` do gradiente radial (`LoginPage:38-41`) e a segunda `<line>` (`LoginPage:44`), deixando só a primeira, agora com o token:

```jsx
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
            <line x1="-5%" y1="82%" x2="105%" y2="16%" stroke="rgba(255,255,255,0.28)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
```

- [ ] **Step 4: Aposentar a fonte mono**

A marca tem duas fontes: Funnel Sans e Instrument Serif (04.1 e 04.2). Não há mono.

- `LoginPage:60` — tirar `font-mono`, deixando o `tracking-[0.14em]` que já dá o ar de etiqueta.
- `TimerPage:147` — o cronômetro em `text-5xl font-mono font-bold` vira `text-5xl font-light tabular-nums`. A Funnel tem figuras tabulares e a classe `.tabular-nums` já existe (`index.css:63`), então os dígitos continuam sem dançar.
- `index.css:10` — apagar a linha `--font-mono`, e a entrada `mono` de `fontFamily` no `tailwind.config.js`.

- [ ] **Step 5: Apagar o `Logo.jsx`**

Depois da Task 4 e dos passos acima, ninguém mais o importa. Confirmar e apagar:

```bash
cd web/src && grep -rn "components/Logo\|<Logo" . ; rm components/Logo.jsx
```

O `grep` deve não retornar nada antes do `rm`.

- [ ] **Step 6: Verificar**

```bash
cd web && npm run build && npm run dev
```

Abrir `/login` numa janela larga e numa de 375px, mais `/forgot-password` e `/reset-password`. Esperado: assinatura oficial nas quatro aparições; painel esquerdo verde com **uma** linha e sem borrão laranja; "vazio fértil" no laranja da paleta; nada em fonte mono. Conferir também `/timer`: o cronômetro continua alinhado enquanto corre.

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/LoginPage.jsx web/src/pages/ForgotPasswordPage.jsx web/src/pages/ResetPasswordPage.jsx web/src/pages/TimerPage.jsx web/src/index.css web/tailwind.config.js
git rm web/src/components/Logo.jsx
git commit -m "feat(auth): assinatura oficial e paleta correta nas telas de entrada"
```

---

## Verificação final

1. `cd web && npm test` — 7 testes passando.
2. `cd web && npm run build` — sem erro.
3. `cd src && npm run check && npm test` — a API não foi tocada, mas confirma que nada quebrou no repo.
4. Rodar o app e percorrer, em cada um dos três papéis: topbar em todas as páginas, menu de Performance só para admin, sino e avatar funcionando, gaveta em 375px.
5. Varredura de peso: `cd web && grep -rnE "font-(semibold|bold|extrabold)" src/` — esperado: nenhum resultado, no repo inteiro.
6. Varredura de raio: `cd web && grep -rnE "rounded-(md|lg|xl|2xl)" src/components/ui/` — esperado: nenhum resultado. `rounded-full` sobrevive em `Avatar` e `StatusDot`, que são retrato e sinal.
7. Varredura de laranja: `cd web && grep -rn "color-orange\|accent-2\|CB6D31" src/` — esperado: só três consumidores, todos "pequeno detalhe": o ponto de "ao vivo", o contador do sino e o contador de pendências.
8. Varredura de sombra: `cd web && grep -rn "shadow-card" src/` — esperado: nenhum resultado. As demais sombras sobrevivem **só em overlay** (`Modal`, `Toast`, dropdown do `Select`, popovers, `ClockInReminder`, painel do `NotificationBell`); confirmar com `grep -rnoE "shadow-[a-z0-9]+" src/` que nada no fluxo da página tem sombra.

## Fora deste plano

- Migrar as outras ~18 páginas para a linguagem nova. Elas herdam topbar, tokens e primitivos, mas mantêm pesos 600/700 no próprio conteúdo.
- Trocar os PNG da marca por SVG quando a john&hackmann responder, e conferir o arquivo da versão branca.
- `AdminApprovalsPage` continua com as três filas separadas. Se a fila unificada da home funcionar bem, ela é a próxima candidata.
