import { Paperclip, X, FileText } from 'lucide-react'

function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|svg|avif|heic|heif)$/i

function isImage(att) {
  if (att?.mime_type?.startsWith('image/')) return true
  return IMAGE_EXT_RE.test(att?.file_name || '')
}

export function AttachmentChip({ att, onRemove }) {
  if (isImage(att)) {
    return (
      <div className="relative group inline-block">
        <a
          href={att.file_url}
          target="_blank"
          rel="noreferrer"
          title={`${att.file_name}${att.file_size ? ` · ${formatSize(att.file_size)}` : ''}`}
          className="block h-20 w-20 rounded-lg overflow-hidden border border-border-subtle bg-surface-alt hover:border-accent transition-colors"
        >
          <img
            src={att.file_url}
            alt={att.file_name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </a>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-rose-500 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow"
            aria-label="Remover"
          >
            <X size={11} />
          </button>
        )}
      </div>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 max-w-full px-2 py-1 rounded-md bg-surface-alt border border-border-subtle text-[11px] text-text-primary">
      <FileText size={12} className="text-text-secondary flex-shrink-0" />
      <a href={att.file_url} target="_blank" rel="noreferrer" className="truncate hover:underline">
        {att.file_name}
      </a>
      {att.file_size != null && (
        <span className="text-text-secondary tabular-nums flex-shrink-0">{formatSize(att.file_size)}</span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-text-secondary hover:text-rose-500 flex-shrink-0"
          aria-label="Remover"
        >
          <X size={11} />
        </button>
      )}
    </span>
  )
}

export function PendingChip({ file, onRemove }) {
  const img = file.type?.startsWith('image/')
  const objectUrl = img ? URL.createObjectURL(file) : null
  if (img) {
    return (
      <div className="relative group inline-block">
        <div
          className="h-20 w-20 rounded-lg overflow-hidden border border-accent/40 bg-accent/5"
          title={`${file.name} · ${formatSize(file.size)}`}
        >
          <img
            src={objectUrl}
            alt={file.name}
            onLoad={() => URL.revokeObjectURL(objectUrl)}
            className="h-full w-full object-cover"
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-rose-500 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center shadow"
          aria-label="Remover"
        >
          <X size={11} />
        </button>
      </div>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 max-w-full px-2 py-1 rounded-md bg-accent/10 border border-accent/30 text-[11px] text-text-primary">
      <Paperclip size={11} className="text-accent flex-shrink-0" />
      <span className="truncate">{file.name}</span>
      <span className="text-text-secondary tabular-nums flex-shrink-0">{formatSize(file.size)}</span>
      <button
        type="button"
        onClick={onRemove}
        className="text-text-secondary hover:text-rose-500 flex-shrink-0"
        aria-label="Remover"
      >
        <X size={11} />
      </button>
    </span>
  )
}
