import { useState, useRef, DragEvent, ChangeEvent } from 'react'
import { UploadCloud, FileText, Image as ImageIcon, X, AlertCircle, RefreshCw } from 'lucide-react'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export interface FileUploadZoneProps {
  file: File | null
  onFileSelect: (file: File | null) => void
  error: string | null
  onError: (error: string | null) => void
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

function getFileExtension(filename: string): string {
  const parts = filename.split('.')
  return parts.length > 1 ? parts.pop()?.toUpperCase() || 'FILE' : 'FILE'
}

export default function FileUploadZone({
  file,
  onFileSelect,
  error,
  onError,
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = (selectedFile: File) => {
    if (selectedFile.size > MAX_FILE_SIZE) {
      onError(`File size (${formatBytes(selectedFile.size)}) exceeds the 10MB limit. Please select a smaller file.`)
      onFileSelect(null)
      return
    }

    onError(null)
    onFileSelect(selectedFile)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0]
      handleFile(droppedFile)
    }
  }

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const chosenFile = e.target.files[0]
      handleFile(chosenFile)
    }
  }

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation()
    onFileSelect(null)
    onError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleTriggerPicker = () => {
    fileInputRef.current?.click()
  }

  const isImage = file?.type.startsWith('image/')

  return (
    <div className="w-full">
      {/* Hidden real file input */}
      <input
        ref={fileInputRef}
        type="file"
        id="encra-file-input"
        className="hidden"
        onChange={handleInputChange}
        aria-label="Upload file to encrypt"
      />

      <div
        className={`relative rounded-2xl bg-[#0A1220]/80 backdrop-blur-sm border transition-all duration-300 ${
          isDragging
            ? 'border-[#2997FF] shadow-[0_0_30px_rgba(41,151,255,0.25)]'
            : error
            ? 'border-red-500/60 shadow-[0_0_20px_rgba(239,68,68,0.15)]'
            : 'border-[#202B3D] hover:border-[#202B3D]'
        }`}
      >
        {!file ? (
          /* Empty / Upload State */
          <div
            onClick={handleTriggerPicker}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleTriggerPicker()
              }
            }}
            className={`m-2.5 sm:m-3 border-2 border-dashed rounded-xl p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 flex flex-col items-center justify-center focus:outline-none focus:ring-2 focus:ring-[#2997FF]/50 ${
              isDragging
                ? 'border-[#2997FF] bg-[#2997FF]/10 scale-[0.99]'
                : 'border-[#2997FF]/35 hover:border-[#2997FF]/70 hover:bg-[#2997FF]/5'
            }`}
          >
            {/* Cloud upload icon with subtle pulse on drag */}
            <div
              className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mb-4 transition-all duration-300 ${
                isDragging
                  ? 'bg-[#2997FF]/20 text-[#2997FF] shadow-[0_0_24px_rgba(41,151,255,0.4)] scale-110'
                  : 'bg-[#2997FF]/10 text-[#2997FF] border border-[#2997FF]/20 shadow-[0_0_16px_rgba(41,151,255,0.15)]'
              }`}
            >
              <UploadCloud className="w-7 h-7 sm:w-8 sm:h-8" strokeWidth={1.5} />
            </div>

            <p className="text-base sm:text-lg font-semibold text-[#F5F7FA] mb-1">
              Drag and drop your file here
            </p>
            <p className="text-sm text-[#2997FF] font-medium mb-3">
              or click to browse
            </p>
            <p className="text-xs sm:text-[13px] text-[#8CA4C5] tracking-wide">
              Supports: Images, PDF, Word, Text and more &nbsp;·&nbsp; Max size: 10MB
            </p>
          </div>
        ) : (
          /* File Selected State */
          <div className="p-6 sm:p-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-5 rounded-xl bg-[#050913]/90 border border-[#202B3D]/80">
              <div className="flex items-center gap-4 min-w-0">
                {/* File Icon with glow */}
                <div className="w-12 h-12 rounded-xl bg-[#2997FF]/10 border border-[#2997FF]/25 flex items-center justify-center shrink-0 text-[#2997FF] shadow-[0_0_14px_rgba(41,151,255,0.15)]">
                  {isImage ? (
                    <ImageIcon className="w-6 h-6" strokeWidth={1.5} />
                  ) : (
                    <FileText className="w-6 h-6" strokeWidth={1.5} />
                  )}
                </div>

                {/* File Metadata */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-[15px] font-semibold text-[#F5F7FA] truncate max-w-[240px] sm:max-w-md">
                      {file.name}
                    </p>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#2997FF]/15 text-[#2997FF] border border-[#2997FF]/30 shrink-0">
                      {getFileExtension(file.name)}
                    </span>
                  </div>
                  <p className="text-xs text-[#8CA4C5]">
                    {formatBytes(file.size)} &nbsp;·&nbsp; Ready for encryption
                  </p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                <button
                  type="button"
                  onClick={handleTriggerPicker}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#0A1220] hover:bg-[#111E30] text-[#A1ADBF] hover:text-[#F5F7FA] border border-[#202B3D] text-xs font-medium transition-colors"
                  title="Replace file"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Replace
                </button>
                <button
                  type="button"
                  onClick={handleRemove}
                  className="p-1.5 rounded-lg bg-[#0A1220] hover:bg-red-500/10 text-[#A1ADBF] hover:text-red-400 border border-[#202B3D] hover:border-red-500/30 transition-colors"
                  title="Remove file"
                  aria-label="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Inline Error Message */}
        {error && (
          <div className="px-6 pb-4 pt-1 flex items-center gap-2 text-xs sm:text-sm text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  )
}
