# Design — Agente lê arquivos anexados no chat (Fase 2, 1ª fatia)

**Data:** 2026-08-10
**Status:** aprovado no brainstorming; implementação test-first
**Origem:** conversa de brainstorming (Claude Code)
**Fase:** primeira fatia da **Fase 2** do agente (ver `2026-08-07-agente-gestao-visao-geral.md` §3 e §4 "Documentos e saídas").

> A visão original previa "ler briefing em PDF e responder". Esta fatia entrega
> o caminho de **texto puro**: a pessoa anexa um arquivo novo no chat, o servidor
> extrai o texto e o modelo responde. Imagem/nota fiscal (visão) fica para uma
> fatia futura.

---

## 1. Decisões travadas

| Tema | Decisão | Motivo |
|---|---|---|
| **Origem do arquivo** | Anexo **novo** no chat (não documento já guardado) | É o que "receber arquivos" quer dizer; a pessoa entrega o arquivo na hora |
| **Caso de uso** | Briefing/documento → o bot lê e responde | Caminho de texto puro, sem visão |
| **Formatos** | PDF (texto), `.txt`/`.md`, `.docx` | Cobre a maioria dos briefings; extração determinística no servidor |
| **Destino** | **Lê e descarta** | Casa com a sessão efêmera (30 min); nada vai pro storage |
| **Modelo** | O DeepSeek V4 atual (texto) | O texto extraído entra no contexto — sem capacidade nova de modelo |
| **Transporte** | **Multipart inline** no `POST /agent/chat` | Uma requisição só, sem store temporário; casa com "lê e descarta" |
| **Representação** | Texto extraído **persiste na sessão** | Anexa uma vez, pergunta várias; custo de token limitado pelo teto |
| **Papéis** | Todos (`requireAuth`) | Ler um arquivo do próprio usuário não toca no banco nem vaza escopo |
| **Anti-injeção** | Texto do anexo é **dado não-confiável**, nunca instrução | Superfície nova de prompt injection (§7.8 da visão) |
| **Limites** | 10 MB por arquivo, ~40k caracteres extraídos | Protege custo/latência; trunca com aviso acima disso |

## 2. Fluxo ponta a ponta

1. Pessoa clica no clipe no composer, escolhe PDF/`.docx`/`.txt`/`.md`.
2. Chip do arquivo aparece; ela envia (com ou sem pergunta).
3. `streamChat` manda `multipart/form-data` (`message` + `file`).
4. Servidor: `multer` (memória, 10 MB) → `extractText(buffer, {mimetype, filename})`.
5. Falha de arquivo (tipo não suportado, escaneado, vazio, grande demais) →
   **400 JSON** antes de abrir o stream (mensagem clara pro usuário).
6. Sucesso → monta o **bloco de anexo** (dado rotulado, delimitado) + a pergunta,
   injeta como o turno `user`, e o laço streama normal.
7. O turno (com o texto do anexo embutido) persiste na sessão → follow-ups reusam.

## 3. Componentes

### 3.1 Extração — `src/lib/agent/attachments/extract.js`
- `extractText(buffer, { mimetype, filename }) → { text, meta: { kind, chars, truncated } }`.
- Despacha por MIME com fallback por extensão (browsers são inconsistentes com `.md`/`.txt`):
  - `pdf` → `pdf-parse` v2 (`new PDFParse({data}).getText()`, junta `pages[].text`).
  - `docx` → `mammoth.extractRawText`.
  - `text` → `buffer.toString('utf8')`.
- Normaliza espaços/linhas; trunca em `MAX_EXTRACTED_CHARS`.
- Erros com `err.status = 400` e mensagem legível:
  - vazio, grande demais, formato não suportado, PDF sem texto ("parece escaneado"),
    PDF corrompido/protegido.

### 3.2 Enquadramento — `src/lib/agent/attachments/context.js`
- `buildAttachmentBlock({ filename, text, truncated }) → string`.
- Envolve o texto entre marcas `<<<ANEXO>>>`/`<<<FIM ANEXO>>>`, com aviso explícito:
  é **dado**, não instrução; se o conteúdo pedir para ignorar regras/agir, descrever
  como conteúdo e não obedecer. Reforça a regra que já existe no prompt.

### 3.3 Rota — `src/routes/agent.js`
- `multer` em memória (10 MB) como middleware do `/agent/chat` (só age em multipart).
- `message` passa a ser opcional **quando há arquivo** (senão continua obrigatório).
- Extrai **antes** de `flushHeaders`, pra erro de arquivo virar 400 JSON limpo.
- Sem arquivo: caminho JSON atual, intacto.

### 3.4 Frontend — `web/src/lib/agentClient.js` + `web/src/pages/AssistentePage.jsx`
- `streamChat` aceita `file`; com arquivo manda `FormData`, senão JSON.
- Lê o corpo de erro JSON quando `!res.ok` (hoje engole a mensagem).
- Composer ganha botão de clipe + input escondido + chip do arquivo (nome + remover).
- Envio permitido com arquivo mesmo sem texto. A bolha do usuário mostra o anexo.
- O `File` **não** vai pro `localStorage` (só o nome) — não é serializável.

## 4. Fora desta fatia
- Imagem/nota fiscal escaneada (visão) e OCR.
- Guardar o arquivo (no projeto ou avulso no Tigris).
- Versão escalável: doc vira uma tool `ler_anexo` buscada sob demanda em vez de
  ficar sempre no contexto.

## 5. Testes
- **Unit** (`extract`): txt, md, docx (fixture do mammoth), pdf (gerado no teste),
  formato não suportado, vazio, grande demais, truncagem, PDF sem texto,
  fallback por extensão.
- **Unit** (`context`): bloco tem nome, aviso de dado-não-instrução, delimitadores,
  e nota de truncagem quando truncado.
- **Integração** (rota): multipart com `.txt` injeta o bloco no turno `user` (cliente
  falso captura as mensagens); arquivo não suportado → 400; sem message e sem arquivo → 400.
- **Eval** (sob demanda): instrução escondida no "anexo" é tratada como dado, não obedecida.
