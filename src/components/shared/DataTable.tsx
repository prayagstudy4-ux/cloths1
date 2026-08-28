"use client"

import { useMemo, useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { ChevronDown, ChevronUp, Download, Search, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { EmptyState } from "@/components/shared/basics"

export interface Column<T> {
  key: string
  header: string
  render?: (row: T) => React.ReactNode
  sortValue?: (row: T) => string | number
  className?: string
  align?: "left" | "right" | "center"
  width?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  /** search across these string fields of the row */
  searchKeys?: (keyof T | string)[]
  searchPlaceholder?: string
  onRowClick?: (row: T) => void
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
  pageSize?: number
  exportName?: string
  toolbar?: React.ReactNode
  rowClassName?: (row: T) => string
  loading?: boolean
  dense?: boolean
}

function getVal(obj: any, path: string): any {
  return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj)
}

export function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: any) => {
    const s = String(v ?? "")
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n")
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function DataTable<T extends Record<string, any>>({
  columns, rows, searchKeys, searchPlaceholder, onRowClick,
  emptyTitle = "No records", emptyDescription, emptyAction,
  pageSize = 15, exportName, toolbar, rowClassName, loading, dense,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("")
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    let out = rows
    if (search && searchKeys?.length) {
      const q = search.toLowerCase()
      out = out.filter((r) => searchKeys.some((k) => String(getVal(r, k as string) ?? "").toLowerCase().includes(q)))
    }
    return out
  }, [rows, search, searchKeys])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    const col = columns.find((c) => c.key === sortKey)
    const sv = col?.sortValue ?? ((r: T) => getVal(r, sortKey))
    return [...filtered].sort((a, b) => {
      const va = sv(a), vb = sv(b)
      if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va
      return sortDir === "asc"
        ? String(va ?? "").localeCompare(String(vb ?? ""), undefined, { numeric: true })
        : String(vb ?? "").localeCompare(String(va ?? ""), undefined, { numeric: true })
    })
  }, [filtered, sortKey, sortDir, columns])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = sorted.slice((safePage - 1) * pageSize, safePage * pageSize)

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("asc") }
  }

  return (
    <div className="space-y-3">
      {(searchKeys || toolbar || exportName) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchKeys && (
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                placeholder={searchPlaceholder ?? "Search…"}
                className="pl-8 h-9"
              />
            </div>
          )}
          {toolbar}
          {exportName && (
            <Button
              variant="outline" size="sm" className="ml-auto h-9"
              onClick={() => exportCSV(
                exportName,
                columns.map((c) => c.header),
                sorted.map((r) => columns.map((c) => {
                  const v = c.sortValue ? c.sortValue(r) : getVal(r, c.key)
                  return typeof v === "number" ? v : String(v ?? "")
                })),
              )}
            >
              <Download className="mr-1.5 h-4 w-4" /> CSV
            </Button>
          )}
        </div>
      )}

      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto thin-scrollbar">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                {columns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={cn(
                      "font-semibold text-xs uppercase tracking-wide",
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      col.width,
                    )}
                  >
                    {(col.sortValue || getVal(rows[0] ?? {}, col.key) !== undefined) && !col.render ? (
                      <button
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => toggleSort(col.key)}
                      >
                        {col.header}
                        {sortKey === col.key ? (
                          sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    ) : col.sortValue ? (
                      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort(col.key)}>
                        {col.header}
                        {sortKey === col.key ? (
                          sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {columns.map((c) => (
                      <TableCell key={c.key}><div className="h-4 w-full animate-pulse rounded bg-muted" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="p-0 border-0">
                    <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
                  </TableCell>
                </TableRow>
              ) : (
                paged.map((row, i) => (
                  <TableRow
                    key={row.id ?? i}
                    className={cn(
                      onRowClick && "cursor-pointer",
                      rowClassName?.(row),
                    )}
                    onClick={() => onRowClick?.(row)}
                  >
                    {columns.map((col) => (
                      <TableCell
                        key={col.key}
                        className={cn(dense && "py-1.5", col.align === "right" && "text-right tabular-nums", col.align === "center" && "text-center", col.className)}
                      >
                        {col.render ? col.render(row) : String(getVal(row, col.key) ?? "—")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {sorted.length > pageSize && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {paged.length > 0 ? (safePage - 1) * pageSize + 1 : 0}–{Math.min(safePage * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 tabular-nums">{safePage} / {totalPages}</span>
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
