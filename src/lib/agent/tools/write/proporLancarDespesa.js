// Espelha POST /me/expense-requests (expenses.js:100, requireAuth; intern 403).
// Propõe despesa do próprio usuário. Recibo PDF via 3º arg (anexoBruto), irmão
// do payload — o buffer nunca entra no payload nem no Axiom. Sem recibo é válido.
import { query } from '../../../db.js'
import { parseExpensePayload } from '../../../expenseRequests.js'
import { uploadFile } from '../../../storage.js'

const definition = {
  type: 'function',
  function: {
    name: 'propor_lancar_despesa',
    description: 'Propõe lançar uma despesa do próprio usuário. Requer confirmação. Valor maior que zero, data e título obrigatórios. Comprovante PDF opcional no mesmo turno (usar_comprovante). Sem comprovante é válido.',
    parameters: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'título da despesa' },
        valor: { type: 'number', description: 'valor em reais, maior que zero; converta "R$ 150,00" para 150' },
        data: { type: 'string', description: 'data da despesa, no formato YYYY-MM-DD' },
        descricao: { type: 'string', description: 'descrição, opcional' },
        usar_comprovante: { type: 'boolean', description: 'se true, usa o PDF anexado neste turno como comprovante', default: false },
      },
      required: ['titulo', 'valor', 'data'],
      additionalProperties: false,
    },
  },
}

function validar(args) {
  const parsed = parseExpensePayload({
    title: args?.titulo,
    amount: args?.valor,
    expense_date: args?.data,
    description: args?.descricao,
  })
  if (parsed.error) throw new Error(parsed.error)
  return parsed.data
}

function ePdf(anexo) {
  const mime = String(anexo?.mimetype || '').toLowerCase().split(';')[0].trim()
  const nome = String(anexo?.filename || '').toLowerCase()
  return mime === 'application/pdf' || nome.endsWith('.pdf')
}

async function propose(profile, args, { anexoBruto } = {}) {
  const dadosNegocio = validar(args)
  const usar = !!args?.usar_comprovante

  if (usar && !anexoBruto?.buffer) {
    throw new Error('Anexe o PDF do comprovante nesta mensagem, ou lance sem comprovante.')
  }
  if (usar && !ePdf(anexoBruto)) {
    throw new Error('O comprovante pelo chat precisa ser PDF. Imagem anexe pela tela Despesas, ou lance sem comprovante.')
  }

  const comprovanteNome = usar ? (anexoBruto.filename || null) : null
  return {
    kind: 'lancar_despesa',
    payload: dadosNegocio,
    descricao: `Lançar despesa "${dadosNegocio.title}" de ${dadosNegocio.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} em ${dadosNegocio.expense_date}.`,
    dados: {
      titulo: dadosNegocio.title,
      valor: dadosNegocio.amount,
      data: dadosNegocio.expense_date,
      descricao: dadosNegocio.description,
      comprovante: comprovanteNome,
    },
    ...(usar ? {
      comprovanteBuffer: anexoBruto.buffer,
      comprovanteMime: anexoBruto.mimetype,
      comprovanteNome,
    } : {}),
  }
}

async function execute(profile, payload, { comprovanteBuffer, comprovanteMime } = {}) {
  const parsed = parseExpensePayload(payload)
  if (parsed.error) throw new Error(parsed.error)

  let receiptUrl = null
  if (comprovanteBuffer) {
    const { url } = await uploadFile('receipts', { buffer: comprovanteBuffer, mimetype: comprovanteMime })
    receiptUrl = url
  }

  const { rows } = await query(
    `INSERT INTO expense_requests (user_id, title, description, amount, expense_date, receipt_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id, title, description, amount, expense_date, receipt_url, status, admin_note, decided_at, created_at, updated_at`,
    [profile.id, parsed.data.title, parsed.data.description, parsed.data.amount, parsed.data.expense_date, receiptUrl],
  )
  return { before: null, after: rows[0] }
}

export default {
  kind: 'write',
  espelha: 'POST /me/expense-requests',
  roles: ['admin', 'project_manager', 'employee'],
  definition, propose, execute,
}
