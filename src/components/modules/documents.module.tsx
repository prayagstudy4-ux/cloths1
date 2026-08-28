"use client"

import { useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, qs } from "@/lib/client/api"
import { canDo } from "@/lib/client/store"
import { PageHeader, StatCard, SectionTitle } from "@/components/shared/basics"
import { DataTable, exportCSV, Column } from "@/components/shared/DataTable"
import { StatusBadge, DateCell, ConfirmDialog, Field, SelectInput, TextInput } from "@/components/shared/fields"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  FolderOpen, UploadCloud, File, FileText, FileImage, FileArchive, FileSpreadsheet,
  Download, Trash2, X, Loader2, HardDrive, Files, CalendarDays,
} from "lucide-react"
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABELS } from "@/lib/constants"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface Doc {
  id: string
  name: string
  category: string
  entityType?: string | null
  entityId?: string | null
  filePath: string
  fileSize: number
  mimeType?: string | null
  uploadedBy?: string | null
  createdAt: string
}

function fmtSize(bytes: number): string {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/** Working file-access endpoint (served by the `files` domain from app-data/) */
function fileUrl(path: string): string {
  return `/api/files/file?path=${encodeURIComponent(path)}`
}

function DocIcon({ doc }: { doc: Doc }) {
  const mime = doc.mimeType ?? ""
  const name = (doc.name ?? "").toLowerCase()
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp)$/.test(name)) {
    return <FileImage className="h-4 w-4 shrink-0 text-emerald-600" />
  }
  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    return <FileText className="h-4 w-4 shrink-0 text-red-500" />
  }
  if (/\.(xlsx?|csv)$/.test(name) || mime.includes("spreadsheet") || mime.includes("excel")) {
    return <FileSpreadsheet className="h-4 w-4 shrink-0 text-green-600" />
  }
  if (/\.(zip|rar|7z)$/.test(name)) {
    return <FileArchive className="h-4 w-4 shrink-0 text-amber-600" />
  }
  return <File className="h-4 w-4 shrink-0 text-muted-foreground" />
}

/** Upload with progress via XHR (api wrapper doesn't expose progress) */
function uploadWithProgress(form: FormData, onProgress: (pct: number) => void): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", "/api/documents")
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300) resolve(data)
        else reject(new Error(data?.error ?? `Upload failed (${xhr.status})`))
      } catch {
        reject(new Error("Upload failed"))
      }
    }
    xhr.onerror = () => reject(new Error("Network error during upload"))
    xhr.send(form)
  })
}

export function DocumentsModule() {
  const qc = useQueryClient()
  const [category, setCategory] = useState("")
  const [deleting, setDeleting] = useState<Doc | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["documents", category],
    queryFn: () => api.get(`documents${qs({ category })}`),
  })

  const documents: Doc[] = data?.documents ?? []
  const totalSize = documents.reduce((s, d) => s + (d.fileSize ?? 0), 0)
  const monthAgo = Date.now() - 30 * 24 * 3600 * 1000
  const recentCount = documents.filter((d) => new Date(d.createdAt).getTime() > monthAgo).length
  const categoriesUsed = new Set(documents.map((d) => d.category)).size

  async function del() {
    if (!deleting) return
    try {
      await api.del(`documents/${deleting.id}`)
      toast({ title: "Document deleted", description: deleting.name })
      qc.invalidateQueries({ queryKey: ["documents"] })
      setDeleting(null)
    } catch (e: any) {
      toast({ title: "Cannot delete", description: e.message, variant: "destructive" })
    }
  }

  const columns: Column<Doc>[] = [
    {
      key: "name",
      header: "Document",
      render: (d) => (
        <div className="flex items-center gap-2.5">
          <DocIcon doc={d} />
          <div className="min-w-0">
            <p className="truncate font-medium">{d.name}</p>
            {(d.entityType || d.entityId) && (
              <p className="text-xs text-muted-foreground">
                Linked: {d.entityType ?? "—"}{d.entityId ? ` #${d.entityId.slice(0, 8)}` : ""}
              </p>
            )}
          </div>
        </div>
      ),
      sortValue: (d) => d.name,
    },
    {
      key: "category",
      header: "Category",
      render: (d) => (
        <StatusBadge label={DOCUMENT_CATEGORY_LABELS[d.category] ?? d.category} className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" />
      ),
      sortValue: (d) => DOCUMENT_CATEGORY_LABELS[d.category] ?? d.category,
    },
    { key: "fileSize", header: "Size", align: "right", render: (d) => <span className="tabular-nums">{fmtSize(d.fileSize)}</span>, sortValue: (d) => d.fileSize },
    { key: "uploadedBy", header: "Uploaded By", render: (d) => d.uploadedBy ?? "—" },
    { key: "createdAt", header: "Date", render: (d) => <DateCell value={d.createdAt} />, sortValue: (d) => d.createdAt },
    {
      key: "actions",
      header: "Actions",
      align: "center",
      render: (d) => (
        <div className="flex items-center justify-center gap-1">
          <Button
            variant="ghost" size="icon" className="h-7 w-7" title="Download"
            onClick={(e) => {
              e.stopPropagation()
              window.open(fileUrl(d.filePath), "_blank")
            }}
          >
            <Download className="h-4 w-4" />
          </Button>
          {canDo("documents", "delete") && (
            <Button
              variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:text-red-600" title="Delete"
              onClick={(e) => { e.stopPropagation(); setDeleting(d) }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
      sortValue: undefined,
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<FolderOpen className="h-5 w-5" />}
        title="Documents"
        description="Central vault for supplier bills, purchase invoices, employee documents, contracts and receipts."
        actions={
          <Button
            variant="outline" size="sm"
            onClick={() =>
              exportCSV(
                "documents",
                ["Name", "Category", "Size (bytes)", "Size", "Uploaded By", "Uploaded At"],
                documents.map((d) => [d.name, DOCUMENT_CATEGORY_LABELS[d.category] ?? d.category, d.fileSize, fmtSize(d.fileSize), d.uploadedBy ?? "", d.createdAt]),
              )
            }
          >
            <Download className="mr-1.5 h-4 w-4" /> Export CSV
          </Button>
        }
      />

      {/* ---------- STATS ---------- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Documents" value={documents.length} icon={<Files className="h-4 w-4" />} />
        <StatCard label="Storage Used" value={fmtSize(totalSize)} icon={<HardDrive className="h-4 w-4" />} />
        <StatCard label="Categories in Use" value={categoriesUsed} sub={`of ${DOCUMENT_CATEGORIES.length}`} icon={<FolderOpen className="h-4 w-4" />} />
        <StatCard label="Uploaded (30 days)" value={recentCount} icon={<CalendarDays className="h-4 w-4" />} />
      </div>

      {/* ---------- UPLOAD ---------- */}
      {canDo("documents", "create") && (
        <UploadCard onDone={() => qc.invalidateQueries({ queryKey: ["documents"] })} />
      )}

      {/* ---------- LIST ---------- */}
      <div>
        <SectionTitle>Document Library</SectionTitle>
        <DataTable
          columns={columns}
          rows={documents}
          loading={isLoading}
          searchKeys={["name", "category", "uploadedBy"]}
          searchPlaceholder="Search name, category, uploader…"
          emptyTitle={category ? "No documents in this category" : "No documents yet"}
          emptyDescription="Upload supplier bills, purchase invoices, employee ID proofs, contracts or receipts to keep them handy."
          toolbar={
            <div className="w-[180px]">
              <SelectInput
                value={category}
                onChange={setCategory}
                placeholder="All categories"
                options={DOCUMENT_CATEGORIES.map((c) => ({ value: c, label: DOCUMENT_CATEGORY_LABELS[c] }))}
              />
            </div>
          }
        />
      </div>

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Delete "${deleting?.name ?? ""}"?`}
        description="The file will be permanently removed from storage. This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={del}
      />
    </div>
  )
}

// ==================== UPLOAD CARD ====================
function UploadCard({ onDone }: { onDone: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [category, setCategory] = useState("OTHER")
  const [entityType, setEntityType] = useState("")
  const [entityId, setEntityId] = useState("")
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  function addFiles(list: FileList | null) {
    if (!list?.length) return
    const incoming = Array.from(list)
    const existing = new Set(files.map((f) => `${f.name}:${f.size}`))
    setFiles((prev) => [...prev, ...incoming.filter((f) => !existing.has(`${f.name}:${f.size}`))])
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer.files)
  }

  async function upload() {
    if (!files.length) return
    setUploading(true)
    setProgress(0)
    const form = new FormData()
    for (const f of files) form.append("files", f)
    form.append("category", category)
    if (entityType.trim()) form.append("entityType", entityType.trim())
    if (entityId.trim()) form.append("entityId", entityId.trim())
    try {
      const res = await uploadWithProgress(form, setProgress)
      toast({
        title: `${res?.documents?.length ?? files.length} file${files.length > 1 ? "s" : ""} uploaded`,
        description: `Category: ${DOCUMENT_CATEGORY_LABELS[category] ?? category}`,
      })
      setFiles([])
      setEntityType("")
      setEntityId("")
      onDone()
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" })
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <SectionTitle>Upload Documents</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload files: drag and drop or click to browse"
            onClick={() => !uploading && inputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click() } }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              "flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/40 hover:bg-accent/50",
              uploading && "pointer-events-none opacity-60",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.svg,.csv,.xlsx,.xls,.doc,.docx,.txt,.zip,.rar,.7z"
              onChange={(e) => { addFiles(e.target.files); e.target.value = "" }}
            />
            <UploadCloud className={cn("mb-2 h-8 w-8", dragging ? "text-primary" : "text-muted-foreground")} />
            <p className="text-sm font-medium">
              {dragging ? "Drop files to attach" : "Drag & drop files here, or click to browse"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              PDF, images, spreadsheets, documents & archives — up to 10 MB per file
            </p>
          </div>

          {/* Meta form */}
          <div className="space-y-3">
            <Field label="Category">
              <SelectInput
                value={category}
                onChange={setCategory}
                options={DOCUMENT_CATEGORIES.map((c) => ({ value: c, label: DOCUMENT_CATEGORY_LABELS[c] }))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Entity type" hint="optional">
                <TextInput value={entityType} onChange={setEntityType} placeholder="e.g. supplier" disabled={uploading} />
              </Field>
              <Field label="Entity ID" hint="optional">
                <TextInput value={entityId} onChange={setEntityId} placeholder="record id" disabled={uploading} />
              </Field>
            </div>
          </div>
        </div>

        {/* Selected files */}
        {files.length > 0 && (
          <div className="mt-3 space-y-1.5 rounded-lg border bg-muted/30 p-3">
            {files.map((f, i) => (
              <div key={`${f.name}:${i}`} className="flex items-center gap-2 text-sm">
                <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{fmtSize(f.size)}</span>
                <Button
                  variant="ghost" size="icon" className="h-6 w-6"
                  disabled={uploading}
                  onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Progress + action */}
        {uploading ? (
          <div className="mt-3 space-y-2">
            <Progress value={progress} />
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading {files.length} file{files.length > 1 ? "s" : ""}… {progress}%
            </p>
          </div>
        ) : (
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={upload} disabled={!files.length}>
              <UploadCloud className="mr-1.5 h-4 w-4" /> Upload {files.length > 0 ? `(${files.length})` : ""}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

