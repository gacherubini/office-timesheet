import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { Link } from 'react-router-dom'
import { hrefPermitido } from '../../lib/agentLinks.js'

const schema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames || []).filter((t) => t !== 'img' && t !== 'iframe' && t !== 'script'),
}

function temTabela(texto) {
  return /(^|\n)\s*\|/.test(String(texto || ''))
}

function Anchor({ href, children }) {
  if (hrefPermitido(href) && typeof href === 'string' && href.startsWith('/')) {
    return <Link to={href}>{children}</Link>
  }
  if (hrefPermitido(href) && typeof href === 'string' && href.startsWith('https:')) {
    return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
  }
  return <>{children}</>
}

export function BolhaMarkdown({ texto, cursor = false }) {
  const largo = temTabela(texto)
  return (
    <div className={`break-words leading-relaxed text-text-primary ${cursor ? 'bolha-digitando' : ''} ${largo ? 'max-w-[46rem]' : 'max-w-[46ch]'}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        components={{
          a: Anchor,
          strong: ({ children }) => <strong className="font-medium text-text-primary">{children}</strong>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5 leading-relaxed">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5 leading-relaxed">{children}</ol>,
          table: ({ children }) => (
            <table className="w-full border-collapse border border-border-subtle tabular-nums">{children}</table>
          ),
          th: ({ children }) => (
            <th className="border border-border-subtle px-2 py-1.5 text-left text-[10px] uppercase tracking-wider text-text-secondary">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border-subtle px-2 py-1.5">{children}</td>
          ),
        }}
      >
        {texto || ''}
      </ReactMarkdown>
    </div>
  )
}
