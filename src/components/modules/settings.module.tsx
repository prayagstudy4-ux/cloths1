"use client"

import { Fragment, useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import { api, qs } from "@/lib/client/api"
import { useApp, canDo } from "@/lib/client/store"
import { PageHeader, StatCard, SectionTitle, EmptyState } from "@/components/shared/basics"
import { DataTable, exportCSV, Column } from "@/components/shared/DataTable"
import { StatusBadge, DateCell, ConfirmDialog, Field, TextInput, NumberInput, SelectInput, TextArea, SwitchInput } from "@/components/shared/fields"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Settings, Loader2, UserPlus, Info, ChevronLeft, ChevronRight,
  Search, FileClock, HardDriveDownload, Sparkles, KeyRound, Clock, Shield, DatabaseBackup, ScrollText, ImagePlus,
} from "lucide-react"
import { fmtDateIST, fmtDateTimeIST } from "@/lib/format"
import { ROLES, ROLE_LABELS, MODULES } from "@/lib/constants"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

const SETTINGS_TABS = ["business", "users", "payments", "app", "backup", "audit", "security"]

const ROLE_COLORS: Record<string, string> = {
  OWNER: "bg-emerald-600 text-white",
  MANAGER: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  SALES: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  INVENTORY: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  ACCOUNTANT: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
  PRODUCTION: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  WORKER: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
}

const ROLE_INFO: Record<string, string> = {
  OWNER: "Complete access — every module, user management, settings, backups, audit log and finances.",
  MANAGER: "Runs daily operations: sales, purchases, stock, staff, payments, reports and documents.",
  SALES: "POS billing, orders, quotations, customers and payment collection at the counter.",
  INVENTORY: "Products, stock levels, adjustments, transfers, purchases and supplier coordination.",
  ACCOUNTANT: "Payments, expenses, accounts, financial reports and the audit log.",
  PRODUCTION: "Production orders, job work, raw materials and worker tasks.",
  WORKER: "Read-only view of production status and assigned tasks.",
}

const BUSINESS_TYPES = [
  { value: "RETAIL", label: "Retail" },
  { value: "WHOLESALE", label: "Wholesale" },
  { value: "MANUFACTURING", label: "Manufacturing" },
  { value: "RETAIL_WHOLESALE", label: "Retail + Wholesale" },
]

function fmtSize(bytes: number): string {
  if (!bytes) return "—"
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/** Stored logo URLs point at the file-service endpoint — normalise to the working route. */
function resolveFileUrl(url?: string | null): string | undefined {
  if (!url) return undefined
  try {
    const u = new URL(url, "http://localhost")
    const p = u.searchParams.get("path")
    if (p) return `/api/files/file?path=${encodeURIComponent(p)}`
  } catch { /* keep original */ }
  return url
}

export function SettingsModule() {
  const { moduleParams } = useApp()
  const [tab, setTab] = useState<string>(() => {
    const t = (moduleParams?.tab as string) ?? "business"
    return SETTINGS_TABS.includes(t) ? t : "business"
  })

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<Settings className="h-5 w-5" />}
        title="Settings"
        description="Business profile, users and roles, payment configuration, app preferences, backups and the audit trail."
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto flex-wrap h-auto">
          <TabsTrigger value="business" className="flex-none px-3 py-1.5">Business</TabsTrigger>
          {canDo("users", "view") && <TabsTrigger value="users" className="flex-none px-3 py-1.5">Users & Roles</TabsTrigger>}
          <TabsTrigger value="payments" className="flex-none px-3 py-1.5">Payments & QR</TabsTrigger>
          <TabsTrigger value="app" className="flex-none px-3 py-1.5">App & Notifications</TabsTrigger>
          {canDo("backup", "view") && <TabsTrigger value="backup" className="flex-none px-3 py-1.5">Backup</TabsTrigger>}
          {canDo("audit", "view") && <TabsTrigger value="audit" className="flex-none px-3 py-1.5">Audit Log</TabsTrigger>}
          <TabsTrigger value="security" className="flex-none px-3 py-1.5">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="business" className="mt-3"><BusinessTab /></TabsContent>
        <TabsContent value="users" className="mt-3"><UsersTab /></TabsContent>
        <TabsContent value="payments" className="mt-3"><PaymentsTab /></TabsContent>
        <TabsContent value="app" className="mt-3"><AppTab /></TabsContent>
        <TabsContent value="backup" className="mt-3"><BackupTab /></TabsContent>
        <TabsContent value="audit" className="mt-3"><AuditTab /></TabsContent>
        <TabsContent value="security" className="mt-3"><SecurityTab /></TabsContent>
      </Tabs>
    </div>
  )
}

// ============================================================
// TAB: BUSINESS
// ============================================================
function BusinessTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["business"],
    queryFn: () => api.get("business"),
  })
  const b = data?.business
  const counts: Record<string, number> = data?.counts ?? {}
  const { setActiveModule } = useApp()

  if (isLoading) return <div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-96" /></div>
  if (!b) return <EmptyState title="No business profile" description="Complete the setup wizard first." />

  const countCards = [
    { key: "products", label: "Products", module: "products" },
    { key: "variants", label: "Variants", module: "products" },
    { key: "customers", label: "Customers", module: "customers" },
    { key: "suppliers", label: "Suppliers", module: "suppliers" },
    { key: "sales", label: "Invoices", module: "sales" },
    { key: "purchases", label: "Purchases", module: "purchases" },
    { key: "employees", label: "Employees", module: "staff" },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {countCards.map((c) => (
          <StatCard key={c.key} label={c.label} value={counts[c.key] ?? 0} onClick={() => setActiveModule(c.module)} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <BusinessForm business={b} />
        <LogoUpload business={b} />
      </div>
    </div>
  )
}

function BusinessForm({ business: b }: { business: any }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: b.name ?? "",
    brandName: b.brandName ?? "",
    address: b.address ?? "",
    city: b.city ?? "",
    state: b.state ?? "",
    pincode: b.pincode ?? "",
    phone: b.phone ?? "",
    email: b.email ?? "",
    website: b.website ?? "",
    gstin: b.gstin ?? "",
    pan: b.pan ?? "",
    businessType: b.businessType ?? "RETAIL",
    bankName: b.bankName ?? "",
    bankAccount: b.bankAccount ?? "",
    bankIfsc: b.bankIfsc ?? "",
    invoicePrefix: b.invoicePrefix ?? "INV",
    quotationPrefix: b.quotationPrefix ?? "QUO",
    orderPrefix: b.orderPrefix ?? "ORD",
    purchasePrefix: b.purchasePrefix ?? "PUR",
    returnPrefix: b.returnPrefix ?? "RET",
    jobworkPrefix: b.jobworkPrefix ?? "JW",
    productionPrefix: b.productionPrefix ?? "PRO",
    payPrefix: b.payPrefix ?? "PAY",
    defaultTaxRate: b.defaultTaxRate ?? 5,
    taxEnabled: b.taxEnabled ?? true,
    invoiceTerms: b.invoiceTerms ?? "",
    invoiceFooter: b.invoiceFooter ?? "",
  })
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))
  const canEdit = canDo("business", "edit")

  async function save() {
    if (!form.name.trim()) return toast({ title: "Business name is required", variant: "destructive" })
    setSaving(true)
    try {
      await api.put("business", form)
      toast({ title: "Business profile saved" })
      qc.invalidateQueries({ queryKey: ["business"] })
    } catch (e: any) {
      toast({ title: "Failed to save", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-5 p-4">
        <div>
          <SectionTitle>Business Profile</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Business name" required><TextInput value={form.name} onChange={(v) => set("name", v)} disabled={!canEdit} /></Field>
            <Field label="Brand name" hint="Shown on invoices and the app title"><TextInput value={form.brandName} onChange={(v) => set("brandName", v)} disabled={!canEdit} /></Field>
            <Field label="Business type">
              <SelectInput value={form.businessType} onChange={(v) => set("businessType", v)} options={BUSINESS_TYPES} disabled={!canEdit} />
            </Field>
            <Field label="Phone"><TextInput value={form.phone} onChange={(v) => set("phone", v)} disabled={!canEdit} /></Field>
            <Field label="Email"><TextInput value={form.email} onChange={(v) => set("email", v)} disabled={!canEdit} /></Field>
            <Field label="Website"><TextInput value={form.website} onChange={(v) => set("website", v)} placeholder="https://" disabled={!canEdit} /></Field>
            <div className="sm:col-span-2"><Field label="Address"><TextInput value={form.address} onChange={(v) => set("address", v)} disabled={!canEdit} /></Field></div>
            <Field label="City"><TextInput value={form.city} onChange={(v) => set("city", v)} disabled={!canEdit} /></Field>
            <Field label="State"><TextInput value={form.state} onChange={(v) => set("state", v)} disabled={!canEdit} /></Field>
            <Field label="PIN code"><TextInput value={form.pincode} onChange={(v) => set("pincode", v)} disabled={!canEdit} /></Field>
          </div>
        </div>

        <div>
          <SectionTitle>Tax & Legal</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="GSTIN"><TextInput value={form.gstin} onChange={(v) => set("gstin", v)} placeholder="27ABCDE1234F1Z5" disabled={!canEdit} /></Field>
            <Field label="PAN"><TextInput value={form.pan} onChange={(v) => set("pan", v)} disabled={!canEdit} /></Field>
          </div>
        </div>

        <div>
          <SectionTitle>Bank Details</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Bank name"><TextInput value={form.bankName} onChange={(v) => set("bankName", v)} disabled={!canEdit} /></Field>
            <Field label="Account number"><TextInput value={form.bankAccount} onChange={(v) => set("bankAccount", v)} disabled={!canEdit} /></Field>
            <Field label="IFSC code"><TextInput value={form.bankIfsc} onChange={(v) => set("bankIfsc", v)} disabled={!canEdit} /></Field>
          </div>
        </div>

        <div>
          <SectionTitle>Invoice & Document Settings</SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Invoice prefix" hint="INV-0001"><TextInput value={form.invoicePrefix} onChange={(v) => set("invoicePrefix", v.toUpperCase())} disabled={!canEdit} /></Field>
            <Field label="Quotation prefix"><TextInput value={form.quotationPrefix} onChange={(v) => set("quotationPrefix", v.toUpperCase())} disabled={!canEdit} /></Field>
            <Field label="Order prefix"><TextInput value={form.orderPrefix} onChange={(v) => set("orderPrefix", v.toUpperCase())} disabled={!canEdit} /></Field>
            <Field label="Purchase prefix"><TextInput value={form.purchasePrefix} onChange={(v) => set("purchasePrefix", v.toUpperCase())} disabled={!canEdit} /></Field>
            <Field label="Return prefix"><TextInput value={form.returnPrefix} onChange={(v) => set("returnPrefix", v.toUpperCase())} disabled={!canEdit} /></Field>
            <Field label="Job work prefix"><TextInput value={form.jobworkPrefix} onChange={(v) => set("jobworkPrefix", v.toUpperCase())} disabled={!canEdit} /></Field>
            <Field label="Production prefix"><TextInput value={form.productionPrefix} onChange={(v) => set("productionPrefix", v.toUpperCase())} disabled={!canEdit} /></Field>
            <Field label="Payment prefix"><TextInput value={form.payPrefix} onChange={(v) => set("payPrefix", v.toUpperCase())} disabled={!canEdit} /></Field>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Default tax rate (%)" hint="Applied to new products and invoices"><NumberInput value={form.defaultTaxRate} onChange={(v) => set("defaultTaxRate", v)} min={0} disabled={!canEdit} /></Field>
            <Field label="Tax enabled" hint="Charge GST on invoices">
              <div className="flex h-9 items-center"><SwitchInput checked={form.taxEnabled} onChange={(v) => set("taxEnabled", v)} label={form.taxEnabled ? "GST charges enabled" : "No tax"} /></div>
            </Field>
            <div className="sm:col-span-2"><Field label="Invoice terms & conditions"><TextArea value={form.invoiceTerms} onChange={(v) => set("invoiceTerms", v)} rows={2} placeholder="e.g. Goods once sold will not be taken back…" /></Field></div>
            <div className="sm:col-span-2"><Field label="Invoice footer note"><TextArea value={form.invoiceFooter} onChange={(v) => set("invoiceFooter", v)} rows={2} placeholder="e.g. Thank you for shopping with us!" /></Field></div>
          </div>
        </div>

        <div className="flex justify-end border-t pt-4">
          <Button onClick={save} disabled={saving || !canEdit}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Business Profile
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function LogoUpload({ business: b }: { business: any }) {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function onFile(f: File | null) {
    if (!f) return
    if (!f.type.startsWith("image/")) return toast({ title: "Please choose an image file (PNG, JPG, WebP…)", variant: "destructive" })
    setUploading(true)
    const form = new FormData()
    form.append("file", f)
    try {
      const res = await api.upload("business/logo", form)
      toast({ title: "Logo updated" })
      qc.invalidateQueries({ queryKey: ["business"] })
      const cur = useApp.getState().business
      if (cur) {
        const resolved = resolveFileUrl(res?.logo) ?? cur.logo
        useApp.getState().setBusiness({ ...cur, logo: resolved })
      }
    } catch (e: any) {
      toast({ title: "Logo upload failed", description: e.message, variant: "destructive" })
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card className="h-fit">
      <CardContent className="p-4">
        <SectionTitle>Business Logo</SectionTitle>
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-5">
          {b.logo ? (
            <img src={resolveFileUrl(b.logo)} alt="Business logo" className="h-24 w-24 rounded-lg border object-contain" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-muted text-3xl font-bold text-muted-foreground">
              {(b.name ?? "?")[0]?.toUpperCase()}
            </div>
          )}
          <p className="text-center text-xs text-muted-foreground">
            {b.logo ? "Current logo" : "No logo yet"} — shown on invoices, quotations and the app title.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.target.value = "" }}
          />
          <Button
            variant="outline" size="sm"
            disabled={uploading || !canDo("business", "edit")}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ImagePlus className="mr-1.5 h-4 w-4" />}
            {b.logo ? "Change Logo" : "Upload Logo"}
          </Button>
          <p className="text-[11px] text-muted-foreground">PNG / JPG up to 2 MB</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// TAB: USERS & ROLES
// ============================================================
interface UserRow {
  id: string
  username: string
  fullName: string
  role: string
  phone?: string | null
  active: boolean
  createdAt: string
}

function UsersTab() {
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [creating, setCreating] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get("users"),
  })
  const users: UserRow[] = data?.users ?? []

  const columns: Column<UserRow>[] = [
    {
      key: "username", header: "Username",
      render: (u) => (
        <div className="flex items-center gap-2.5">
          <div className={cn("flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold", u.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
            {u.fullName?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div>
            <p className="font-medium">{u.fullName}</p>
            <p className="text-xs text-muted-foreground">@{u.username}</p>
          </div>
        </div>
      ),
      sortValue: (u) => u.fullName,
    },
    { key: "phone", header: "Phone", render: (u) => <span className="tabular-nums">{u.phone ?? "—"}</span> },
    {
      key: "role", header: "Role",
      render: (u) => <StatusBadge label={ROLE_LABELS[u.role] ?? u.role} className={ROLE_COLORS[u.role]} />,
      sortValue: (u) => ROLE_LABELS[u.role] ?? u.role,
    },
    {
      key: "active", header: "Status", align: "center",
      render: (u) => (
        <StatusBadge
          label={u.active ? "Active" : "Disabled"}
          className={u.active
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}
        />
      ),
      sortValue: (u) => (u.active ? 1 : 0),
    },
    { key: "createdAt", header: "Created", render: (u) => <DateCell value={u.createdAt} />, sortValue: (u) => u.createdAt },
  ]

  return (
    <div className="space-y-4">
      {/* Role capabilities info */}
      <Card>
        <CardContent className="p-4">
          <SectionTitle>Role Capabilities</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ROLES.map((r) => (
              <div key={r} className="flex items-start gap-2.5 rounded-lg border p-3">
                <StatusBadge label={ROLE_LABELS[r]} className={cn("shrink-0", ROLE_COLORS[r])} />
                <p className="text-xs leading-relaxed text-muted-foreground">{ROLE_INFO[r]}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <SectionTitle
            action={
              canDo("users", "create") && (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <UserPlus className="mr-1.5 h-4 w-4" /> New User
                </Button>
              )
            }
          >
            User Accounts ({users.length})
          </SectionTitle>
          <DataTable
            columns={columns}
            rows={users}
            loading={isLoading}
            onRowClick={(u) => canDo("users", "edit") && setEditing(u)}
            searchKeys={["username", "fullName", "phone"]}
            searchPlaceholder="Search users…"
            emptyTitle="No users found"
            emptyDescription="Create staff accounts so each person signs in with their own role."
            emptyAction={
              canDo("users", "create") && (
                <Button size="sm" onClick={() => setCreating(true)}><UserPlus className="mr-1.5 h-4 w-4" /> New User</Button>
              )
            }
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Click a user to edit their name, role, password or account status.
          </p>
        </CardContent>
      </Card>

      {creating && <UserForm onClose={() => setCreating(false)} />}
      {editing && <UserForm user={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function UserForm({ user, onClose }: { user?: UserRow; onClose: () => void }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const currentUser = useApp((s) => s.user)
  const [form, setForm] = useState({
    username: user?.username ?? "",
    password: "",
    fullName: user?.fullName ?? "",
    role: user?.role ?? "SALES",
    phone: user?.phone ?? "",
    active: user?.active ?? true,
  })
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))

  async function save() {
    if (!form.fullName.trim()) return toast({ title: "Full name is required", variant: "destructive" })
    if (!user && form.password.length < 4) return toast({ title: "Password must be at least 4 characters", variant: "destructive" })
    setSaving(true)
    try {
      if (user) {
        const body: Record<string, unknown> = {
          fullName: form.fullName,
          role: form.role,
          phone: form.phone,
          active: form.active,
        }
        if (form.password) body.password = form.password
        await api.put(`users/${user.id}`, body)
        toast({ title: "User updated", description: `@${user.username}` })
      } else {
        await api.post("users", {
          username: form.username,
          password: form.password,
          fullName: form.fullName,
          role: form.role,
          phone: form.phone,
        })
        toast({ title: "User created", description: `@${form.username.toLowerCase()} can now sign in` })
      }
      qc.invalidateQueries({ queryKey: ["users"] })
      onClose()
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  async function deactivate() {
    if (!user) return
    setDeactivating(true)
    try {
      await api.del(`users/${user.id}`)
      toast({ title: "User deactivated", description: `@${user.username} can no longer sign in` })
      qc.invalidateQueries({ queryKey: ["users"] })
      setConfirmDeactivate(false)
      onClose()
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" })
    } finally {
      setDeactivating(false)
    }
  }

  return (
    <>
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{user ? `Edit @${user.username}` : "New User"}</DialogTitle>
            <DialogDescription>
              {user ? "Update name, role, contact or reset the password." : "Create a staff account with an appropriate role."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Username" required hint={user ? "Cannot be changed" : "Used to sign in"}>
              <TextInput value={form.username} onChange={(v) => set("username", v)} disabled={!!user} placeholder="e.g. ramesh" autoFocus={!user} />
            </Field>
            <Field label="Full name" required><TextInput value={form.fullName} onChange={(v) => set("fullName", v)} autoFocus={!!user} /></Field>
            <Field label={user ? "New password" : "Password"} required={!user} hint={user ? "Leave blank to keep current" : "Minimum 4 characters"}>
              <TextInput type="password" value={form.password} onChange={(v) => set("password", v)} placeholder={user ? "••••" : "Password"} />
            </Field>
            <Field label="Role">
              <SelectInput value={form.role} onChange={(v) => set("role", v)} options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
            </Field>
            <Field label="Phone"><TextInput value={form.phone} onChange={(v) => set("phone", v)} placeholder="98XXXXXXXX" /></Field>
            {user && (
              <Field label="Account status" hint={form.active ? "User can sign in" : "Sign-in blocked"}>
                <div className="flex h-9 items-center"><SwitchInput checked={form.active} onChange={(v) => set("active", v)} label={form.active ? "Active" : "Disabled"} /></div>
              </Field>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {user && user.role !== "OWNER" && user.id !== currentUser?.id && canDo("users", "delete") && (
              <Button variant="outline" className="mr-auto text-red-600 hover:text-red-600" onClick={() => setConfirmDeactivate(true)}>
                Deactivate
              </Button>
            )}
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {user ? "Save Changes" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeactivate}
        onOpenChange={setConfirmDeactivate}
        title={`Deactivate @${user?.username}?`}
        description="The account will be disabled and can no longer sign in. Their history in the audit log is preserved. You can re-enable it later."
        confirmLabel="Deactivate"
        destructive
        loading={deactivating}
        onConfirm={deactivate}
      />
    </>
  )
}

// ============================================================
// TAB: PAYMENTS & QR
// ============================================================
function PaymentsTab() {
  const businessQ = useQuery({ queryKey: ["business"], queryFn: () => api.get("business") })
  const settingsQ = useQuery({ queryKey: ["settings"], queryFn: () => api.get("settings") })

  if (businessQ.isLoading || settingsQ.isLoading) {
    return <div className="space-y-3"><Skeleton className="h-48" /><Skeleton className="h-64" /></div>
  }

  return (
    <div className="space-y-4">
      <UpiSection business={businessQ.data?.business} />
      <RazorpaySection settings={settingsQ.data?.settings ?? {}} />

      {/* Explainer */}
      <Card>
        <CardContent className="flex gap-3 p-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <Info className="h-4 w-4" />
          </div>
          <div className="text-sm">
            <p className="font-medium">How payment verification works</p>
            <p className="mt-1 leading-relaxed text-muted-foreground">
              Configure Razorpay credentials to enable automatic payment verification via the payment provider API.
              Without a provider, payments are verified manually by staff after checking their UPI/bank app — this is the honest default.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function UpiSection({ business: b }: { business: any }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    upiId: b?.upiId ?? "",
    upiPayeeName: b?.upiPayeeName ?? "",
  })
  const canEdit = canDo("business", "edit")

  async function save() {
    setSaving(true)
    try {
      await api.put("business", form)
      toast({ title: "UPI settings saved" })
      qc.invalidateQueries({ queryKey: ["business"] })
    } catch (e: any) {
      toast({ title: "Failed to save", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <SectionTitle>UPI Collection (QR Payments)</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="UPI ID" hint="Money is collected into this account">
            <TextInput value={form.upiId} onChange={(v) => setForm({ ...form, upiId: v })} placeholder="yourshop@upi" disabled={!canEdit} />
          </Field>
          <Field label="Payee name" hint="Shown under the QR code on invoices">
            <TextInput value={form.upiPayeeName} onChange={(v) => setForm({ ...form, upiPayeeName: v })} placeholder="VastraCo Clothing" disabled={!canEdit} />
          </Field>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Used by the Payments module to generate dynamic UPI QR codes for customers.</p>
          <Button size="sm" onClick={save} disabled={saving || !canEdit}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save UPI
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function RazorpaySection({ settings }: { settings: Record<string, string> }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(settings.razorpay_enabled === "1")
  const [keyId, setKeyId] = useState(settings.razorpay_key_id ?? "")
  const [secret, setSecret] = useState(settings.razorpay_key_secret ?? "")
  const originalSecret = settings.razorpay_key_secret ?? ""
  const [webhookSecret, setWebhookSecret] = useState(settings.razorpay_webhook_secret ?? "")
  const originalWebhookSecret = settings.razorpay_webhook_secret ?? ""
  const canEdit = canDo("settings", "edit")

  async function save() {
    setSaving(true)
    try {
      const body: Record<string, string> = {
        razorpay_enabled: enabled ? "1" : "0",
        razorpay_key_id: keyId.trim(),
      }
      // Only send the secret when the user actually changed it (server masks it)
      if (secret && secret !== originalSecret && !secret.includes("••")) {
        body.razorpay_key_secret = secret.trim()
      }
      if (webhookSecret && webhookSecret !== originalWebhookSecret && !webhookSecret.includes("••")) {
        body.razorpay_webhook_secret = webhookSecret.trim()
      }
      await api.put("settings", body)
      toast({ title: "Razorpay settings saved" })
      qc.invalidateQueries({ queryKey: ["settings"] })
    } catch (e: any) {
      toast({ title: "Failed to save", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <SectionTitle>Razorpay (Automatic Verification)</SectionTitle>
        <SettingRow
          title="Enable Razorpay"
          description="Verify payments automatically through the Razorpay API instead of manual staff confirmation."
        >
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!canEdit} aria-label="Enable Razorpay" />
        </SettingRow>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Key ID" hint="From your Razorpay dashboard (Dashboard → API Keys)">
            <TextInput value={keyId} onChange={setKeyId} placeholder="rzp_live_XXXXXXXXXX" disabled={!canEdit} />
          </Field>
          <Field label="Key secret" hint="Stored masked — type a new value only when changing it">
            <TextInput type="password" value={secret} onChange={setSecret} placeholder={originalSecret || "rzp_secret"} disabled={!canEdit} />
          </Field>
          <Field label="Webhook secret" hint="Same secret you enter in Razorpay Dashboard → Settings → Webhooks">
            <TextInput type="password" value={webhookSecret} onChange={setWebhookSecret} placeholder={originalWebhookSecret || "whsec_..."} disabled={!canEdit} />
          </Field>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Webhook URL to configure in Razorpay Dashboard: <code className="rounded bg-muted px-1 py-0.5">https://YOUR-DOMAIN/api/razorpay-webhook</code> — enable the <b>payment.captured</b> event.
        </p>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Status: {enabled ? <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">Enabled</Badge> : <Badge variant="secondary">Disabled — manual verification</Badge>}
          </p>
          <Button size="sm" onClick={save} disabled={saving || !canEdit}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Razorpay
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function SettingRow({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  )
}

// ============================================================
// TAB: APP & NOTIFICATIONS
// ============================================================
function AppTab() {
  const { data, isLoading } = useQuery({ queryKey: ["settings"], queryFn: () => api.get("settings") })
  if (isLoading) return <div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>
  if (!data?.settings) return <EmptyState title="Settings unavailable" />
  return <AppSettingsForm settings={data.settings} />
}

function AppSettingsForm({ settings: s }: { settings: Record<string, string> }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    notify_low_stock: s.notify_low_stock !== "0",
    notify_payment: s.notify_payment !== "0",
    notify_due: s.notify_due !== "0",
    default_invoice_print: s.default_invoice_print || "A4",
    allow_negative_stock: s.allow_negative_stock === "1",
  })
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))
  const canEdit = canDo("settings", "edit")

  async function save() {
    setSaving(true)
    try {
      await api.put("settings", {
        notify_low_stock: form.notify_low_stock ? "1" : "0",
        notify_payment: form.notify_payment ? "1" : "0",
        notify_due: form.notify_due ? "1" : "0",
        default_invoice_print: form.default_invoice_print,
        allow_negative_stock: form.allow_negative_stock ? "1" : "0",
      })
      toast({ title: "App settings saved" })
      qc.invalidateQueries({ queryKey: ["settings"] })
    } catch (e: any) {
      toast({ title: "Failed to save", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionTitle>Notifications</SectionTitle>
          <SettingRow title="Low stock alerts" description="Notify when a variant falls below its minimum stock level.">
            <Switch checked={form.notify_low_stock} onCheckedChange={(v) => set("notify_low_stock", v)} disabled={!canEdit} aria-label="Low stock alerts" />
          </SettingRow>
          <SettingRow title="Payment alerts" description="Notify when a payment is received or an unmatched UPI payment arrives.">
            <Switch checked={form.notify_payment} onCheckedChange={(v) => set("notify_payment", v)} disabled={!canEdit} aria-label="Payment alerts" />
          </SettingRow>
          <SettingRow title="Payment due reminders" description="Notify about long-pending customer dues and udhaar.">
            <Switch checked={form.notify_due} onCheckedChange={(v) => set("notify_due", v)} disabled={!canEdit} aria-label="Payment due reminders" />
          </SettingRow>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionTitle>Billing & Stock</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Default invoice print size" hint="Paper size used when printing invoices">
              <SelectInput
                value={form.default_invoice_print}
                onChange={(v) => set("default_invoice_print", v)}
                options={[
                  { value: "A4", label: "A4 Sheet" },
                  { value: "80mm", label: "80mm Thermal" },
                  { value: "58mm", label: "58mm Thermal" },
                ]}
                disabled={!canEdit}
              />
            </Field>
          </div>
          <SettingRow title="Allow negative stock" description="Let the counter sell beyond available stock. Not recommended — stock goes negative and must be reconciled later.">
            <Switch checked={form.allow_negative_stock} onCheckedChange={(v) => set("allow_negative_stock", v)} disabled={!canEdit} aria-label="Allow negative stock" />
          </SettingRow>
          <div className="flex justify-end pt-2">
            <Button onClick={save} disabled={saving || !canEdit}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save App Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================
// TAB: BACKUP
// ============================================================
function BackupTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ["backup"], queryFn: () => api.get("backup") })
  const [restoring, setRestoring] = useState<BackupFile | null>(null)
  const [confirmDemo, setConfirmDemo] = useState(false)
  const demoQ = useQuery({ queryKey: ["demo-data-status"], queryFn: () => api.get("demo-data/status") })

  const backupNow = useMutation({
    mutationFn: () => api.post("backup"),
    onSuccess: (res: any) => {
      toast({ title: "Backup created", description: res?.backup?.name ?? "Database snapshot saved" })
      qc.invalidateQueries({ queryKey: ["backup"] })
    },
    onError: (e: any) => toast({ title: "Backup failed", description: e.message, variant: "destructive" }),
  })

  const restore = useMutation({
    mutationFn: (filename: string) => api.post("backup/restore", { filename }),
    onSuccess: (res: any) => {
      toast({ title: "Database restored", description: res?.message ?? "Data is now from the selected backup." })
      setRestoring(null)
      qc.invalidateQueries() // everything changed — refetch all
    },
    onError: (e: any) => toast({ title: "Restore failed", description: e.message, variant: "destructive" }),
  })

  const loadDemo = useMutation({
    mutationFn: () => api.post("demo-data/load"),
    onSuccess: () => {
      toast({ title: "Demo data loaded", description: "Sample products, customers and 30 days of sales were added." })
      setConfirmDemo(false)
      qc.invalidateQueries()
      qc.invalidateQueries({ queryKey: ["demo-data-status"] })
    },
    onError: (e: any) => toast({ title: "Failed to load demo data", description: e.message, variant: "destructive" }),
  })

  if (isLoading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>

  const backups: BackupFile[] = data?.backups ?? []
  const settings = data?.settings ?? { autoBackup: true, retentionDays: 30 }
  const canRestore = canDo("backup", "approve")

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Backups Stored" value={backups.length} icon={<DatabaseBackup className="h-4 w-4" />} />
        <StatCard
          label="Latest Backup"
          value={backups[0] ? fmtDateIST(backups[0].createdAt) : "None"}
          sub={backups[0] ? fmtSize(backups[0].size) : "Run your first backup"}
          icon={<FileClock className="h-4 w-4" />}
          tone={backups[0] ? "default" : "warning"}
        />
        <StatCard label="Auto Backup" value={settings.autoBackup ? "On" : "Off"} tone={settings.autoBackup ? "positive" : "warning"} icon={<Clock className="h-4 w-4" />} />
        <StatCard label="Retention" value={`${settings.retentionDays} days`} icon={<HardDriveDownload className="h-4 w-4" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardContent className="p-4">
            <SectionTitle
              action={
                <Button size="sm" onClick={() => backupNow.mutate()} disabled={backupNow.isPending}>
                  {backupNow.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <DatabaseBackup className="mr-1.5 h-4 w-4" />}
                  Backup Now
                </Button>
              }
            >
              Backup Files
            </SectionTitle>
            {backups.length === 0 ? (
              <EmptyState
                title="No backups yet"
                description="Create a snapshot of your database before making big changes — restores take one click."
                icon={<DatabaseBackup className="h-6 w-6" />}
              />
            ) : (
              <div className="max-h-96 overflow-y-auto thin-scrollbar">
                <table className="w-full text-sm">
                  <thead className="sticky top-0">
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-semibold">File</th>
                      <th className="px-3 py-2 text-right font-semibold">Size</th>
                      <th className="px-3 py-2 font-semibold">Created</th>
                      <th className="px-3 py-2 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backups.map((b) => (
                      <tr key={b.name} className="border-b last:border-0 hover:bg-accent/50">
                        <td className="px-3 py-2 font-mono text-xs">{b.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtSize(b.size)}</td>
                        <td className="px-3 py-2"><DateCell value={b.createdAt} withTime /></td>
                        <td className="px-3 py-2 text-right">
                          {canRestore ? (
                            <Button variant="outline" size="sm" className="h-7" onClick={() => setRestoring(b)}>
                              <HardDriveDownload className="mr-1 h-3.5 w-3.5" /> Restore
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Owner only</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {data?.dbPath && (
              <p className="mt-3 text-xs text-muted-foreground">Database file: <span className="font-mono">{data.dbPath}</span></p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <AutoBackupSettings settings={settings} />
          <Card>
            <CardContent className="p-4">
              <SectionTitle>Demo Data</SectionTitle>
              {demoQ.isLoading ? (
                <Skeleton className="h-10" />
              ) : demoQ.data?.loaded ? (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
                  <Sparkles className="h-4 w-4" /> Demo data already loaded
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Populate the database with a sample catalog (9 products), customers, suppliers and 30 days of sales history — great for exploring reports.
                  </p>
                  <Button
                    variant="outline" size="sm" className="mt-3"
                    onClick={() => setConfirmDemo(true)}
                    disabled={loadDemo.isPending || !canDo("settings", "edit")}
                  >
                    {loadDemo.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
                    Load Demo Data
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={!!restoring}
        onOpenChange={(v) => !v && setRestoring(null)}
        title="Restore this backup?"
        destructive
        confirmLabel="Restore Database"
        loading={restore.isPending}
        onConfirm={() => restoring && restore.mutate(restoring.name)}
        description={
          <>
            The entire database will be replaced with <span className="font-mono text-xs">{restoring?.name}</span>.
            All data created after this backup will be lost. A safety snapshot of the current state is saved first
            as <span className="font-mono text-xs">pre-restore-…</span>.
          </>
        }
      />

      <ConfirmDialog
        open={confirmDemo}
        onOpenChange={setConfirmDemo}
        title="Load demo data?"
        description="Sample products, customers, suppliers, purchases and 30 days of sales history will be added to your current database. This cannot be undone."
        confirmLabel="Load Demo Data"
        loading={loadDemo.isPending}
        onConfirm={() => loadDemo.mutate()}
      />
    </div>
  )
}

interface BackupFile {
  name: string
  size: number
  createdAt: string
}

function AutoBackupSettings({ settings }: { settings: { autoBackup: boolean; retentionDays: number } }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [autoBackup, setAutoBackup] = useState(settings.autoBackup)
  const [retentionDays, setRetentionDays] = useState(settings.retentionDays)
  const canEdit = canDo("settings", "edit")

  async function save() {
    setSaving(true)
    try {
      await api.put("settings", {
        auto_backup: autoBackup ? "1" : "0",
        backup_retention_days: String(Math.max(1, Math.round(retentionDays))),
      })
      toast({ title: "Backup settings saved" })
      qc.invalidateQueries({ queryKey: ["backup"] })
      qc.invalidateQueries({ queryKey: ["settings"] })
    } catch (e: any) {
      toast({ title: "Failed to save", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <SectionTitle>Auto Backup</SectionTitle>
        <SettingRow title="Daily auto backup" description="Runs automatically when the app is opened each day.">
          <Switch checked={autoBackup} onCheckedChange={setAutoBackup} disabled={!canEdit} aria-label="Daily auto backup" />
        </SettingRow>
        <div className="mt-3">
          <Field label="Retention (days)" hint="Backups older than this are deleted automatically">
            <NumberInput value={retentionDays} onChange={setRetentionDays} min={1} step="1" disabled={!canEdit} />
          </Field>
        </div>
        <Button size="sm" className="mt-3" onClick={save} disabled={saving || !canEdit}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Backup Settings
        </Button>
      </CardContent>
    </Card>
  )
}

// ============================================================
// TAB: AUDIT LOG
// ============================================================
const AUDIT_ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  UPDATE: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  VOID: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  LOGIN: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  RESTORE: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
}

interface AuditLog {
  id: string
  userName: string
  userRole: string
  module: string
  action: string
  entityId?: string | null
  details?: string | null
  createdAt: string
}

function prettyDetails(d?: string | null): string {
  if (!d) return "—"
  try {
    return JSON.stringify(JSON.parse(d), null, 2)
  } catch {
    return d
  }
}

function AuditTab() {
  const [page, setPage] = useState(1)
  const [moduleFilter, setModuleFilter] = useState("")
  const [q, setQ] = useState("")
  const [debouncedQ, setDebouncedQ] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [q])

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["audit-logs", page, moduleFilter, debouncedQ],
    queryFn: () => api.get(`audit-logs${qs({ page, pageSize: 50, module: moduleFilter, q: debouncedQ })}`),
  })

  const logs: AuditLog[] = data?.logs ?? []
  const total: number = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / 50))

  function exportLogs() {
    exportCSV(
      "audit-logs",
      ["Date", "User", "Role", "Module", "Action", "Entity", "Details"],
      logs.map((l) => [
        fmtDateTimeIST(l.createdAt),
        l.userName,
        ROLE_LABELS[l.userRole] ?? l.userRole,
        l.module,
        l.action,
        l.entityId ?? "",
        l.details ?? "",
      ]),
    )
  }

  return (
    <Card>
      <CardContent className="p-4">
        <SectionTitle
          action={
            <Button variant="outline" size="sm" onClick={exportLogs} disabled={!logs.length}>
              Export CSV (page)
            </Button>
          }
        >
          Audit Trail {total > 0 && <span className="ml-1 font-normal normal-case">— {total} events</span>}
        </SectionTitle>

        {/* Filters */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search user, action, details…"
              className="h-9 pl-8"
            />
          </div>
          <div className="w-[180px]">
            <SelectInput
              value={moduleFilter}
              onChange={(v) => { setModuleFilter(v); setPage(1) }}
              placeholder="All modules"
              options={MODULES.map((m) => ({ value: m, label: m }))}
            />
          </div>
          {isFetching && <span className="text-xs text-muted-foreground">loading…</span>}
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-lg border">
          <div className="overflow-x-auto thin-scrollbar">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Date & Time</th>
                  <th className="px-3 py-2 font-semibold">User</th>
                  <th className="px-3 py-2 font-semibold">Module</th>
                  <th className="px-3 py-2 font-semibold">Action</th>
                  <th className="px-3 py-2 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-3 py-2.5"><div className="h-4 w-full animate-pulse rounded bg-muted" /></td>
                      ))}
                    </tr>
                  ))
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="border-0 p-0">
                      <EmptyState
                        title={q || moduleFilter ? "No matching audit events" : "No audit events yet"}
                        description="Every create, update, delete, payment and login is recorded here."
                        icon={<ScrollText className="h-6 w-6" />}
                      />
                    </td>
                  </tr>
                ) : (
                  logs.map((l) => (
                    <Fragment key={l.id}>
                      <tr
                        className="cursor-pointer border-b last:border-0 hover:bg-accent/50"
                        onClick={() => setExpanded(expanded === l.id ? null : l.id)}
                      >
                        <td className="whitespace-nowrap px-3 py-2 text-xs"><DateCell value={l.createdAt} withTime /></td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{l.userName}</span>
                            <StatusBadge label={ROLE_LABELS[l.userRole] ?? l.userRole} className={ROLE_COLORS[l.userRole] ?? ""} />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge label={l.module} className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" />
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge label={l.action} className={AUDIT_ACTION_COLORS[l.action] ?? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"} />
                        </td>
                        <td className="max-w-[320px] truncate px-3 py-2 text-xs text-muted-foreground">
                          {l.details ?? (l.entityId ? `id: ${l.entityId.slice(0, 12)}…` : "—")}
                        </td>
                      </tr>
                      {expanded === l.id && (
                        <tr className="border-b bg-muted/30 last:border-0">
                          <td colSpan={5} className="px-3 py-3">
                            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Event details {l.entityId && <span className="font-mono normal-case"> · entity {l.entityId}</span>}
                            </p>
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border bg-card p-3 text-xs thin-scrollbar">
                              {prettyDetails(l.details)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
          <span>{total > 0 ? `${(page - 1) * 50 + 1}–${Math.min(page * 50, total)} of ${total} events` : "No events"}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 tabular-nums">{page} / {totalPages}</span>
            <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages} onClick={() => setPage(page + 1)} aria-label="Next page">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================
// TAB: SECURITY
// ============================================================
function SecurityTab() {
  const { user } = useApp()
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => api.get("settings") })
  const s = data?.settings ?? {}
  const requireLogin = s.require_login !== "0"
  const timeoutHours = s.session_timeout_hours || "24"

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionTitle>Password</SectionTitle>
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <KeyRound className="h-4 w-4" />
            </div>
            <div className="text-sm">
              <p className="font-medium">Change your password</p>
              <p className="mt-0.5 text-muted-foreground">
                Open the <b>user menu</b> at the top-right corner of the app (your name → <i>Change Password</i>).
                Passwords are stored as salted scrypt hashes — plain-text passwords are never saved.
              </p>
            </div>
          </div>
          <div className="rounded-lg border p-3 text-sm">
            <p className="font-medium">Signed in as</p>
            <p className="mt-0.5 text-muted-foreground">
              {user ? `${user.fullName} (@${user.username}) — ${ROLE_LABELS[user.role] ?? user.role}` : "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionTitle>Access Control</SectionTitle>
          <SettingRow title="Login required" description="Everyone must sign in with a user account before using the app.">
            <StatusBadge
              label={requireLogin ? "Enabled" : "Disabled"}
              className={requireLogin
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"}
            />
          </SettingRow>
          <SettingRow title="Session timeout" description={`Idle sessions expire after ${timeoutHours} hour(s).`}>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Clock className="h-4 w-4" /> {timeoutHours}h</span>
          </SettingRow>
          <div className="flex items-start gap-3 rounded-lg border p-3 text-sm">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Shield className="h-4 w-4" />
            </div>
            <p className="text-muted-foreground">
              Sessions use HMAC-signed, HTTP-only cookies — they cannot be read by scripts or other sites.
              Every sign-in, edit, void and payment is written to the <b>Audit Log</b> for full traceability.
              All data lives on this machine in a single SQLite database file.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
