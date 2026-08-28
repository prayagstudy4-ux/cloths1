"use client"

import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, qs } from "@/lib/client/api"
import { canDo, useApp } from "@/lib/client/store"
import { PageHeader, StatCard, EmptyState } from "@/components/shared/basics"
import { DataTable, exportCSV, Column } from "@/components/shared/DataTable"
import { StatusBadge, Money, DateCell, ConfirmDialog, Field, TextInput, SelectInput, TextArea, NumberInput } from "@/components/shared/fields"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { fmtMoney, fmtDateIST, ymdIST } from "@/lib/format"
import {
  ATTENDANCE_STATUSES, ATTENDANCE_STATUS_LABELS,
  PAYMENT_METHODS, PAYMENT_METHOD_LABELS,
  SALARY_PAYMENT_TYPES, SALARY_PAYMENT_TYPE_LABELS,
  TASK_PRIORITIES, TASK_PRIORITY_LABELS, TASK_PRIORITY_COLORS,
  TASK_STATUSES, TASK_STATUS_LABELS,
} from "@/lib/constants"
import { toast } from "@/hooks/use-toast"
import {
  IdCard, Users, UserCheck, UserX, UserPlus, IndianRupee, CalendarCheck, CalendarDays, CalendarClock,
  ListTodo, Pencil, Trash2, Loader2, Play, CheckCircle2, RotateCcw, Download, Phone, MapPin,
  Briefcase, Wallet, CheckCheck, AlertTriangle, Check, Ban,
} from "lucide-react"

// ==================== Types ====================
interface Employee {
  id: string; code: string; name: string; phone: string | null
  designation: string | null; joiningDate: string | null; salary: number
  status: string; address: string | null; notes: string | null; createdAt: string
  todayAttendance?: string | null
}

interface EmployeeDetail extends Employee {
  attendance?: AttendanceRecord[]
  salaryPayments?: SalaryPayment[]
}

interface AttendanceRecord {
  id: string; employeeId: string; date: string; status: string; note: string | null
}

interface SalaryPayment {
  id: string; employeeId: string; type: string; month: string | null
  amount: number; method: string; date: string; notes: string | null; createdAt: string
}

interface Task {
  id: string; title: string; description: string | null; assignedTo: string | null
  priority: string; dueDate: string | null; status: string
  createdByName: string | null; createdAt: string; completedAt: string | null
}

// ==================== Local style maps ====================
const ATTENDANCE_BADGE_COLORS: Record<string, string> = {
  PRESENT: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  ABSENT: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  HALF_DAY: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  LEAVE: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
}

const ATTENDANCE_DOT_COLORS: Record<string, string> = {
  PRESENT: "bg-emerald-500",
  ABSENT: "bg-red-500",
  HALF_DAY: "bg-amber-500",
  LEAVE: "bg-sky-500",
}

const SALARY_TYPE_BADGE_COLORS: Record<string, string> = {
  SALARY: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  ADVANCE: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  BONUS: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  DEDUCTION: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
}

const TASK_STATUS_BADGE_COLORS: Record<string, string> = {
  PENDING: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  IN_PROGRESS: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  CANCELLED: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
}

// ==================== Helpers ====================
/** Current IST month as YYYY-MM, offset by n months */
function ymIST(offsetMonths = 0): string {
  const [y, m] = ymdIST().split("-").map(Number)
  let year = y, month = m + offsetMonths
  while (month < 1) { month += 12; year -= 1 }
  while (month > 12) { month -= 12; year += 1 }
  return `${year}-${String(month).padStart(2, "0")}`
}

function isTaskOverdue(t: Task): boolean {
  if (!t.dueDate || t.status === "COMPLETED" || t.status === "CANCELLED") return false
  return fmtDateIST(t.dueDate, "yyyy-MM-dd") < ymdIST()
}

// ==================== MAIN MODULE ====================
export function StaffModule() {
  const { moduleParams } = useApp()
  const initialTab =
    moduleParams?.tab === "attendance" || moduleParams?.tab === "tasks" ? String(moduleParams.tab) : "employees"
  const [tab, setTab] = useState(initialTab)
  const [detailId, setDetailId] = useState<string | null>(
    initialTab === "employees" ? ((moduleParams?.entityId as string) ?? null) : null,
  )
  const [creatingEmployee, setCreatingEmployee] = useState<boolean>(!!moduleParams?.new && initialTab === "employees")
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)

  // React to deep links while the module stays mounted (e.g. CommandPalette → "Add Staff").
  // Render-time state adjustment (React-recommended) — no effect needed.
  const [lastParams, setLastParams] = useState(moduleParams)
  if (moduleParams !== lastParams) {
    setLastParams(moduleParams)
    if (moduleParams) {
      const t = moduleParams.tab === "attendance" || moduleParams.tab === "tasks" ? String(moduleParams.tab) : "employees"
      if (moduleParams.entityId || moduleParams.new || t !== "employees") setTab(t)
      if (moduleParams.entityId && t === "employees") setDetailId(String(moduleParams.entityId))
      if (moduleParams.new && t === "employees") setCreatingEmployee(true)
    }
  }

  const { data: staffData, isLoading: staffLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: () => api.get("staff"),
  })

  const employees: Employee[] = staffData?.employees ?? []
  const summary = staffData?.summary as { active: number; presentToday: number } | undefined
  const activeEmployees = useMemo(() => employees.filter((e) => e.status === "ACTIVE"), [employees])
  const monthlySalaryCost = activeEmployees.reduce((s, e) => s + (e.salary ?? 0), 0)
  const activeCount = summary?.active ?? activeEmployees.length
  const presentToday = summary?.presentToday ?? activeEmployees.filter((e) => e.todayAttendance === "PRESENT").length
  const markedToday = activeEmployees.filter((e) => e.todayAttendance).length
  const detailEmployee = detailId ? (employees.find((e) => e.id === detailId) ?? null) : null

  function exportStaffCsv() {
    exportCSV(
      "employees",
      ["Code", "Name", "Designation", "Phone", "Joined", "Salary", "Status", "Today"],
      employees.map((e) => [
        e.code, e.name, e.designation ?? "", e.phone ?? "",
        e.joiningDate ? fmtDateIST(e.joiningDate) : "", e.salary, e.status,
        e.todayAttendance ? (ATTENDANCE_STATUS_LABELS[e.todayAttendance] ?? e.todayAttendance) : "Not Marked",
      ]),
    )
  }

  const columns: Column<Employee>[] = [
    { key: "code", header: "Code", width: "w-16", render: (e) => <span className="text-xs text-muted-foreground">{e.code}</span> },
    {
      key: "name", header: "Employee", render: (e) => (
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {e.name?.[0]?.toUpperCase()}
          </div>
          <span className="truncate font-medium">{e.name}</span>
        </div>
      ),
    },
    { key: "designation", header: "Designation", render: (e) => <span className="text-muted-foreground">{e.designation ?? "—"}</span> },
    { key: "phone", header: "Phone", render: (e) => <span className="tabular-nums">{e.phone ?? "—"}</span> },
    { key: "joiningDate", header: "Joined", sortValue: (e) => e.joiningDate ?? "", render: (e) => <DateCell value={e.joiningDate} /> },
    {
      key: "salary", header: "Salary", align: "right", sortValue: (e) => e.salary,
      render: (e) => (e.salary > 0 ? <Money value={e.salary} /> : <span className="text-muted-foreground">—</span>),
    },
    {
      key: "status", header: "Status", render: (e) => (
        <StatusBadge
          label={e.status === "ACTIVE" ? "Active" : "Inactive"}
          className={e.status === "ACTIVE"
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
            : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}
        />
      ),
    },
    {
      key: "todayAttendance", header: "Today", render: (e) => e.todayAttendance
        ? <StatusBadge label={ATTENDANCE_STATUS_LABELS[e.todayAttendance] ?? e.todayAttendance} className={ATTENDANCE_BADGE_COLORS[e.todayAttendance]} />
        : <span className="text-xs text-muted-foreground">—</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<IdCard className="h-5 w-5" />}
        title="Staff & Workers"
        description="Employee master, daily attendance, salary & advance payouts and the shop task board."
        actions={
          tab === "employees" ? (
            <>
              <Button variant="outline" size="sm" onClick={exportStaffCsv} disabled={employees.length === 0}>
                <Download className="mr-1.5 h-4 w-4" /> Export CSV
              </Button>
              {canDo("staff", "create") && (
                <Button size="sm" onClick={() => setCreatingEmployee(true)}>
                  <UserPlus className="mr-1.5 h-4 w-4" /> New Employee
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full flex-wrap justify-start overflow-x-auto">
          <TabsTrigger value="employees" className="px-3">Employees</TabsTrigger>
          <TabsTrigger value="attendance" className="px-3">Attendance</TabsTrigger>
          <TabsTrigger value="tasks" className="px-3">Tasks</TabsTrigger>
        </TabsList>

        {/* ==================== TAB: EMPLOYEES ==================== */}
        <TabsContent value="employees" className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label="Active Staff"
              value={staffLoading ? "…" : activeCount}
              sub={`${employees.length} on payroll`}
              icon={<Users className="h-4 w-4" />}
            />
            <StatCard
              label="Present Today"
              value={staffLoading ? "…" : presentToday}
              sub={`${markedToday} of ${activeCount} marked`}
              tone="positive"
              icon={<UserCheck className="h-4 w-4" />}
            />
            <StatCard
              label="Monthly Salary Cost"
              value={staffLoading ? "…" : fmtMoney(monthlySalaryCost)}
              sub="active payroll"
              icon={<IndianRupee className="h-4 w-4" />}
            />
            <StatCard
              label="Unmarked Today"
              value={staffLoading ? "…" : Math.max(0, activeCount - markedToday)}
              sub="attendance pending"
              tone={activeCount - markedToday > 0 ? "warning" : "default"}
              icon={<CalendarClock className="h-4 w-4" />}
            />
          </div>

          <DataTable
            columns={columns}
            rows={employees}
            loading={staffLoading}
            searchKeys={["code", "name", "phone", "designation"]}
            searchPlaceholder="Search name, code, phone, designation…"
            onRowClick={(e) => setDetailId(e.id)}
            emptyTitle="No employees yet"
            emptyDescription="Add your first employee to start tracking attendance, salary and advances."
            emptyAction={canDo("staff", "create") ? (
              <Button size="sm" onClick={() => setCreatingEmployee(true)}>
                <UserPlus className="mr-1.5 h-4 w-4" /> New Employee
              </Button>
            ) : undefined}
            rowClassName={(e) => (e.status === "INACTIVE" ? "opacity-60" : "")}
          />
        </TabsContent>

        {/* ==================== TAB: ATTENDANCE ==================== */}
        <TabsContent value="attendance" className="mt-4">
          <AttendanceTab employees={activeEmployees} loading={staffLoading} />
        </TabsContent>

        {/* ==================== TAB: TASKS ==================== */}
        <TabsContent value="tasks" className="mt-4">
          <TasksTab
            employees={activeEmployees}
            focusId={initialTab === "tasks" ? ((moduleParams?.entityId as string) ?? null) : null}
            autoNew={!!moduleParams?.new && initialTab === "tasks"}
          />
        </TabsContent>
      </Tabs>

      {creatingEmployee && <EmployeeForm onClose={() => setCreatingEmployee(false)} />}
      {editingEmployee && <EmployeeForm employee={editingEmployee} onClose={() => setEditingEmployee(null)} />}
      {detailId && (
        <EmployeeDetailSheet
          employeeId={detailId}
          fallbackEmployee={detailEmployee}
          notFound={!staffLoading && !detailEmployee}
          onClose={() => setDetailId(null)}
          onEdit={(e) => { setDetailId(null); setEditingEmployee(e) }}
          onMarkAttendance={() => { setDetailId(null); setTab("attendance") }}
        />
      )}
    </div>
  )
}

// ==================== EMPLOYEE FORM (create / edit) ====================
function EmployeeForm({ employee, onClose }: { employee?: Employee; onClose: () => void }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: employee?.name ?? "",
    phone: employee?.phone ?? "",
    designation: employee?.designation ?? "",
    joiningDate: employee?.joiningDate ? fmtDateIST(employee.joiningDate, "yyyy-MM-dd") : ymdIST(),
    salary: employee?.salary ?? 0,
    address: employee?.address ?? "",
    notes: employee?.notes ?? "",
  })

  async function save() {
    if (!form.name.trim()) return toast({ title: "Name is required", variant: "destructive" })
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        designation: form.designation.trim(),
        joiningDate: form.joiningDate || undefined,
        salary: form.salary,
        address: form.address.trim(),
        notes: form.notes.trim(),
      }
      if (employee) await api.put(`staff/${employee.id}`, payload)
      else await api.post("staff", payload)
      toast({
        title: employee ? "Employee updated" : "Employee created",
        description: `${form.name.trim()}${form.designation.trim() ? ` · ${form.designation.trim()}` : ""}`,
      })
      qc.invalidateQueries({ queryKey: ["staff"] })
      onClose()
    } catch (e: any) {
      toast({ title: "Failed to save employee", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{employee ? `Edit ${employee.name}` : "New Employee"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Full name" required>
              <TextInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Employee name" autoFocus />
            </Field>
          </div>
          <Field label="Phone">
            <TextInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="98XXXXXXXX" />
          </Field>
          <Field label="Designation" hint="e.g. Sales Person, Tailor, Helper">
            <TextInput value={form.designation} onChange={(v) => setForm({ ...form, designation: v })} placeholder="Designation" />
          </Field>
          <Field label="Joining date" hint={employee ? "Server keeps the original joining date for now" : undefined}>
            <TextInput type="date" value={form.joiningDate} onChange={(v) => setForm({ ...form, joiningDate: v })} />
          </Field>
          <Field label="Monthly salary (₹)">
            <NumberInput value={form.salary} onChange={(v) => setForm({ ...form, salary: v })} min={0} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address">
              <TextInput value={form.address} onChange={(v) => setForm({ ...form, address: v })} placeholder="Street, city…" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <TextArea value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} rows={2} placeholder="Remarks, skills, references…" />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== EMPLOYEE DETAIL SHEET ====================
function EmployeeDetailSheet({
  employeeId, fallbackEmployee, notFound, onClose, onEdit, onMarkAttendance,
}: {
  employeeId: string
  fallbackEmployee: Employee | null
  notFound?: boolean
  onClose: () => void
  onEdit: (e: Employee) => void
  onMarkAttendance: () => void
}) {
  const qc = useQueryClient()
  const [payOpen, setPayOpen] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // Canonical detail (contract: GET staff/:id, includes attendance 60 + salaryPayments 50).
  // If that route is unavailable on this deployment, fall back to the documented
  // sub-resource queries below so the sheet still renders live data.
  const detailQuery = useQuery({
    queryKey: ["staff", "detail", employeeId],
    queryFn: () => api.get(`staff/${employeeId}`),
    retry: false,
  })
  const useFallback = !!detailQuery.isError

  const paymentsQuery = useQuery({
    queryKey: ["staff", "payments", employeeId],
    queryFn: () => api.get(`staff/payments${qs({ employeeId })}`),
    enabled: useFallback,
  })

  // Fallback attendance: current + previous month via GET staff/attendance?month=
  const curMonth = useMemo(() => ymIST(0), [])
  const prevMonth = useMemo(() => ymIST(-1), [])
  const attCurQuery = useQuery({
    queryKey: ["staff", "attendance", "month", curMonth],
    queryFn: () => api.get(`staff/attendance${qs({ month: curMonth })}`),
    enabled: useFallback,
  })
  const attPrevQuery = useQuery({
    queryKey: ["staff", "attendance", "month", prevMonth],
    queryFn: () => api.get(`staff/attendance${qs({ month: prevMonth })}`),
    enabled: useFallback,
  })

  const employee: EmployeeDetail | null = detailQuery.data?.employee ?? fallbackEmployee

  const attendanceRecords: AttendanceRecord[] = useMemo(() => {
    if (detailQuery.isSuccess) return detailQuery.data?.employee?.attendance ?? []
    const all: AttendanceRecord[] = [...(attCurQuery.data?.records ?? []), ...(attPrevQuery.data?.records ?? [])]
    return all
      .filter((r) => r.employeeId === employeeId)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 60)
  }, [detailQuery.data, attCurQuery.data, attPrevQuery.data, employeeId])

  const paymentsLoading = detailQuery.isLoading || (useFallback && paymentsQuery.isLoading)
  const payments: SalaryPayment[] = detailQuery.isSuccess
    ? (detailQuery.data?.employee?.salaryPayments ?? [])
    : (paymentsQuery.data?.payments ?? [])

  const presentCount = attendanceRecords.filter((r) => r.status === "PRESENT").length
  const totalPaid = payments.reduce((s, p) => s + Math.max(0, p.amount), 0)
  const advanceTotal = payments.filter((p) => p.type === "ADVANCE").reduce((s, p) => s + p.amount, 0)

  /** DELETE staff/:id deactivates the employee server-side (records preserved). */
  async function deactivate() {
    setBusy(true)
    try {
      await api.del(`staff/${employeeId}`)
      toast({
        title: "Employee deactivated",
        description: `${employee?.name ?? ""} is kept in records for history.`,
      })
      qc.invalidateQueries({ queryKey: ["staff"] })
      onClose()
    } catch (e: any) {
      toast({ title: "Could not deactivate employee", description: e.message, variant: "destructive" })
    } finally {
      setBusy(false)
      setDeactivateOpen(false)
    }
  }

  async function reactivate() {
    setBusy(true)
    try {
      await api.put(`staff/${employeeId}`, { status: "ACTIVE" })
      toast({ title: "Employee reactivated", description: employee?.name ?? "" })
      qc.invalidateQueries({ queryKey: ["staff"] })
    } catch (e: any) {
      toast({ title: "Could not update employee", description: e.message, variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  if (!employee) {
    return (
      <Sheet open onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl thin-scrollbar">
          <SheetHeader className="border-b bg-muted/40 px-5 py-4">
            <SheetTitle>Employee</SheetTitle>
          </SheetHeader>
          <div className="flex items-center justify-center py-24">
            {notFound ? (
              <EmptyState
                title="Employee not found"
                description="This employee may have been removed. Close and refresh the list."
                action={<Button size="sm" variant="outline" onClick={onClose}>Close</Button>}
              />
            ) : (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            )}
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl thin-scrollbar">
        <SheetHeader className="border-b bg-muted/40 px-5 py-4">
          <SheetTitle className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-lg font-bold text-primary-foreground">
              {employee.name?.[0]?.toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{employee.name}</p>
              <p className="text-xs font-normal text-muted-foreground">
                {employee.code}{employee.designation ? ` · ${employee.designation}` : ""}
                {employee.status === "INACTIVE" ? " · Inactive" : ""}
              </p>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-5 p-5">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Monthly Salary" value={fmtMoney(employee.salary)} sub="current rate" />
            <StatCard label="Present Days" value={presentCount} sub={`of ${attendanceRecords.length} records`} tone="positive" />
            <StatCard label="Total Paid Out" value={fmtMoney(totalPaid)} sub={`${payments.length} payments`} />
            <StatCard label="Advances" value={fmtMoney(advanceTotal)} sub="recoverable" tone={advanceTotal > 0 ? "warning" : "default"} />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onMarkAttendance}>
              <CalendarCheck className="mr-1.5 h-4 w-4" /> Mark Attendance
            </Button>
            {canDo("staff", "pay") && (
              <Button size="sm" onClick={() => setPayOpen(true)}>
                <Wallet className="mr-1.5 h-4 w-4" /> Pay Salary / Advance
              </Button>
            )}
            {canDo("staff", "edit") && (
              <Button size="sm" variant="outline" onClick={() => onEdit(employee)}>
                <Pencil className="mr-1.5 h-4 w-4" /> Edit
              </Button>
            )}
            {employee.status === "ACTIVE"
              ? canDo("staff", "delete") && (
                  <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setDeactivateOpen(true)}>
                    <UserX className="mr-1.5 h-4 w-4" /> Deactivate
                  </Button>
                )
              : canDo("staff", "edit") && (
                  <Button size="sm" variant="outline" onClick={reactivate} disabled={busy}>
                    {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <UserCheck className="mr-1.5 h-4 w-4" />} Reactivate
                  </Button>
                )}
          </div>

          {/* Info */}
          <div className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
            <span className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5 shrink-0" /> {employee.phone ?? "—"}</span>
            <span className="flex items-center gap-2 text-muted-foreground"><Briefcase className="h-3.5 w-3.5 shrink-0" /> {employee.designation ?? "—"}</span>
            <span className="flex items-center gap-2 text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" /> Joined <DateCell value={employee.joiningDate} />
            </span>
            <span className="flex items-center gap-2 text-muted-foreground"><IdCard className="h-3.5 w-3.5 shrink-0" /> {employee.code}</span>
            {employee.address && (
              <span className="col-span-2 flex items-start gap-2 text-muted-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {employee.address}
              </span>
            )}
            {employee.notes && <p className="col-span-2 rounded bg-muted p-2 text-xs">{employee.notes}</p>}
          </div>

          {/* Tabs: attendance + payments */}
          <Tabs defaultValue="attendance">
            <TabsList className="w-full justify-start overflow-x-auto flex-wrap h-auto">
              <TabsTrigger value="attendance">Attendance ({attendanceRecords.length})</TabsTrigger>
              <TabsTrigger value="payments">Salary Payments ({payments.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="attendance" className="mt-3">
              {detailQuery.isLoading || (useFallback && (attCurQuery.isLoading || attPrevQuery.isLoading)) ? (
                <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : attendanceRecords.length === 0 ? (
                <EmptyState title="No attendance records" description="Recent attendance for this employee will appear here." />
              ) : (
                <div className="max-h-96 overflow-y-auto rounded-lg border thin-scrollbar">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-muted">
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-semibold">Date</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                        <th className="px-3 py-2 font-semibold">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendanceRecords.map((r) => (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="whitespace-nowrap px-3 py-2 text-xs"><DateCell value={r.date} /></td>
                          <td className="px-3 py-2">
                            <StatusBadge label={ATTENDANCE_STATUS_LABELS[r.status] ?? r.status} className={ATTENDANCE_BADGE_COLORS[r.status]} />
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{r.note ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="payments" className="mt-3 space-y-3">
              {canDo("staff", "pay") && (
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => setPayOpen(true)}>
                    <Wallet className="mr-1.5 h-4 w-4" /> New Payment
                  </Button>
                </div>
              )}
              {paymentsLoading ? (
                <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : payments.length === 0 ? (
                <EmptyState title="No salary payments" description="Pay salary, advance or bonus — it will be recorded here and in accounts." />
              ) : (
                <div className="max-h-96 overflow-y-auto rounded-lg border thin-scrollbar">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-muted">
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-semibold">Date</th>
                        <th className="px-3 py-2 font-semibold">Type</th>
                        <th className="px-3 py-2 font-semibold">Month</th>
                        <th className="px-3 py-2 font-semibold">Method</th>
                        <th className="px-3 py-2 text-right font-semibold">Amount</th>
                        <th className="px-3 py-2 font-semibold">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="whitespace-nowrap px-3 py-2 text-xs"><DateCell value={p.date} /></td>
                          <td className="px-3 py-2">
                            <StatusBadge label={SALARY_PAYMENT_TYPE_LABELS[p.type] ?? p.type} className={SALARY_TYPE_BADGE_COLORS[p.type]} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">{p.month ?? "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</td>
                          <td className="px-3 py-2 text-right"><Money value={p.amount} colored className="font-semibold" /></td>
                          <td className="max-w-[160px] truncate px-3 py-2 text-xs text-muted-foreground" title={p.notes ?? ""}>{p.notes ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>

      {payOpen && <PaySalaryDialog employee={employee} onClose={() => setPayOpen(false)} />}

      <ConfirmDialog
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title={`Deactivate ${employee.name}?`}
        description="The employee stays in records for history but is hidden from attendance marking. Salary history is preserved."
        confirmLabel="Deactivate"
        destructive
        loading={busy}
        onConfirm={deactivate}
      />
    </Sheet>
  )
}

// ==================== PAY SALARY / ADVANCE DIALOG ====================
function PaySalaryDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    type: "SALARY",
    amount: employee.salary || 0,
    method: "CASH",
    month: ymIST(0),
    date: ymdIST(),
    notes: "",
  })

  function changeType(type: string) {
    setForm((f) => ({ ...f, type, amount: type === "SALARY" ? (employee.salary || 0) : f.amount }))
  }

  async function save() {
    if (!form.amount || form.amount <= 0) {
      return toast({ title: "Enter a valid amount", variant: "destructive" })
    }
    setSaving(true)
    try {
      await api.post("staff/payments", { employeeId: employee.id, ...form })
      toast({
        title: `${SALARY_PAYMENT_TYPE_LABELS[form.type] ?? form.type} recorded`,
        description: `${employee.name} — ${fmtMoney(form.amount)} via ${PAYMENT_METHOD_LABELS[form.method] ?? form.method}${form.month ? ` (${form.month})` : ""}`,
      })
      qc.invalidateQueries({ queryKey: ["staff"] })
      qc.invalidateQueries({ queryKey: ["expenses"] })
      qc.invalidateQueries({ queryKey: ["payments"] })
      qc.invalidateQueries({ queryKey: ["accounts"] })
      onClose()
    } catch (e: any) {
      toast({ title: "Payment failed", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pay {employee.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Payment type" required>
            <SelectInput
              value={form.type}
              onChange={changeType}
              options={SALARY_PAYMENT_TYPES.map((t) => ({ value: t, label: SALARY_PAYMENT_TYPE_LABELS[t] }))}
            />
          </Field>
          <Field
            label="Amount (₹)"
            required
            hint={form.type === "SALARY" && employee.salary > 0 ? `Monthly salary: ${fmtMoney(employee.salary)}` : undefined}
          >
            <NumberInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} min={0} />
          </Field>
          <Field label="Method" required>
            <SelectInput
              value={form.method}
              onChange={(v) => setForm({ ...form, method: v })}
              options={PAYMENT_METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))}
            />
          </Field>
          <Field label="Month" hint="Salary period (YYYY-MM)">
            <TextInput type="month" value={form.month} onChange={(v) => setForm({ ...form, month: v })} />
          </Field>
          <Field label="Date" required>
            <TextInput type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <TextArea value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} rows={2} placeholder="Remarks…" />
            </Field>
          </div>
        </div>
        <p className="rounded-md bg-muted/60 p-2.5 text-xs text-muted-foreground">
          Salary &amp; bonus payments also create an expense entry and a money-out payment record. Advances are recoverable and not expensed; deductions reduce take-home.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ==================== ATTENDANCE TAB ====================
interface AttendanceDraft {
  status: string
  note: string
}

function AttendanceTab({ employees, loading: staffLoading }: { employees: Employee[]; loading?: boolean }) {
  const qc = useQueryClient()
  const canEdit = canDo("staff", "edit")
  const [view, setView] = useState<"day" | "month">("day")
  const [date, setDate] = useState(ymdIST())
  const [month, setMonth] = useState(ymIST(0))
  const [entries, setEntries] = useState<Record<string, AttendanceDraft>>({})
  const [saving, setSaving] = useState(false)

  const dayQuery = useQuery({
    queryKey: ["staff", "attendance", "day", date],
    queryFn: () => api.get(`staff/attendance${qs({ date })}`),
    enabled: view === "day" && !!date,
  })

  // Prefill marks + notes from saved records whenever the day data (re)loads
  useEffect(() => {
    const records: AttendanceRecord[] = dayQuery.data?.records ?? []
    setEntries(Object.fromEntries(records.map((r) => [r.employeeId, { status: r.status, note: r.note ?? "" }])))
  }, [dayQuery.data])

  const monthQuery = useQuery({
    queryKey: ["staff", "attendance", "month", month],
    queryFn: () => api.get(`staff/attendance${qs({ month })}`),
    enabled: view === "month" && /^\d{4}-\d{2}$/.test(month),
  })

  // Summary chips
  const counts: Record<string, number> = { PRESENT: 0, ABSENT: 0, HALF_DAY: 0, LEAVE: 0 }
  for (const e of employees) {
    const s = entries[e.id]?.status
    if (s && counts[s] !== undefined) counts[s] += 1
  }
  const marked = ATTENDANCE_STATUSES.reduce((s, k) => s + (counts[k] ?? 0), 0)
  const notMarked = Math.max(0, employees.length - marked)

  function setEntry(id: string, patch: Partial<AttendanceDraft>) {
    setEntries((prev) => ({ ...prev, [id]: { status: prev[id]?.status ?? "", note: prev[id]?.note ?? "", ...patch } }))
  }

  function markAllPresent() {
    setEntries((prev) => Object.fromEntries(employees.map((e) => [e.id, { status: "PRESENT", note: prev[e.id]?.note ?? "" }])))
  }

  async function saveAttendance() {
    const payload = employees
      .filter((e) => entries[e.id]?.status)
      .map((e) => ({
        employeeId: e.id,
        status: entries[e.id].status,
        note: entries[e.id].note?.trim() || undefined,
      }))
    if (payload.length === 0) {
      return toast({ title: "Nothing to save", description: "Mark at least one employee first.", variant: "destructive" })
    }
    setSaving(true)
    try {
      const res = await api.post("staff/attendance", { date, entries: payload })
      const saved: number = res?.records?.length ?? payload.length
      toast({
        title: "Attendance saved",
        description: `${saved} ${saved === 1 ? "employee" : "employees"} marked for ${fmtDateIST(date)}.`,
      })
      qc.invalidateQueries({ queryKey: ["staff"] })
    } catch (e: any) {
      toast({ title: "Failed to save attendance", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // Month matrix helpers
  const [year, mon] = month.split("-").map(Number)
  const daysInMonth = new Date(year, mon, 0).getDate()
  const dayMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of (monthQuery.data?.records ?? []) as AttendanceRecord[]) {
      m.set(`${r.employeeId}|${parseInt(r.date.slice(8), 10)}`, r.status)
    }
    return m
  }, [monthQuery.data])

  function isSunday(day: number) {
    return new Date(Date.UTC(year, mon - 1, day)).getUTCDay() === 0
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {view === "day" ? (
          <div className="relative">
            <CalendarCheck className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="date"
              aria-label="Attendance date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 w-[170px] pl-9"
            />
          </div>
        ) : (
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="month"
              aria-label="Attendance month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-9 w-[170px] pl-9"
            />
          </div>
        )}
        {view === "day" && canEdit && (
          <>
            <Button variant="outline" size="sm" className="h-9" onClick={markAllPresent} disabled={employees.length === 0}>
              <CheckCheck className="mr-1.5 h-4 w-4" /> All Present
            </Button>
            <Button size="sm" className="h-9" onClick={saveAttendance} disabled={saving || !date || employees.length === 0}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CalendarCheck className="mr-1.5 h-4 w-4" />}
              Save Attendance
            </Button>
          </>
        )}
        <div className="ml-auto">
          <Tabs value={view} onValueChange={(v) => setView(v === "month" ? "month" : "day")}>
            <TabsList>
              <TabsTrigger value="day" className="px-4">Day</TabsTrigger>
              <TabsTrigger value="month" className="px-4">Month</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Day view */}
      {view === "day" && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={`Present ${counts.PRESENT}`} className={ATTENDANCE_BADGE_COLORS.PRESENT} />
            <StatusBadge label={`Absent ${counts.ABSENT}`} className={ATTENDANCE_BADGE_COLORS.ABSENT} />
            <StatusBadge label={`Half Day ${counts.HALF_DAY}`} className={ATTENDANCE_BADGE_COLORS.HALF_DAY} />
            <StatusBadge label={`Leave ${counts.LEAVE}`} className={ATTENDANCE_BADGE_COLORS.LEAVE} />
            <StatusBadge label={`Not Marked ${notMarked}`} className="bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400" />
            <span className="ml-auto text-xs text-muted-foreground">
              {employees.length} active employees · {fmtDateIST(date)}
            </span>
          </div>

          <div className="overflow-hidden rounded-lg border bg-card">
            <div className="overflow-x-auto thin-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Employee</th>
                    <th className="hidden px-3 py-2 font-semibold md:table-cell">Designation</th>
                    <th className="hidden px-3 py-2 font-semibold lg:table-cell">Phone</th>
                    <th className="w-[180px] px-3 py-2 font-semibold">Attendance</th>
                    <th className="w-[220px] px-3 py-2 font-semibold">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {dayQuery.isLoading || staffLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td colSpan={5} className="px-3 py-3"><div className="h-5 w-full animate-pulse rounded bg-muted" /></td>
                      </tr>
                    ))
                  ) : employees.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="border-0 p-0">
                        <EmptyState title="No active employees" description="Add employees to start marking daily attendance." />
                      </td>
                    </tr>
                  ) : (
                    employees.map((e) => (
                      <tr key={e.id} className="border-b last:border-0 hover:bg-accent/40">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {e.name?.[0]?.toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium">{e.name}</p>
                              <p className="text-xs text-muted-foreground">{e.code}</p>
                            </div>
                          </div>
                        </td>
                        <td className="hidden px-3 py-2 text-muted-foreground md:table-cell">{e.designation ?? "—"}</td>
                        <td className="hidden px-3 py-2 tabular-nums text-muted-foreground lg:table-cell">{e.phone ?? "—"}</td>
                        <td className="px-3 py-2">
                          <div className="w-[170px]">
                            <SelectInput
                              value={entries[e.id]?.status || "__none"}
                              onChange={(v) => setEntry(e.id, { status: v === "__none" ? "" : v })}
                              disabled={!canEdit}
                              options={[
                                { value: "__none", label: "Not Marked" },
                                ...ATTENDANCE_STATUSES.map((s) => ({ value: s, label: ATTENDANCE_STATUS_LABELS[s] })),
                              ]}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={entries[e.id]?.note ?? ""}
                            onChange={(ev) => setEntry(e.id, { note: ev.target.value })}
                            disabled={!canEdit}
                            placeholder="Optional remark…"
                            aria-label={`Attendance note for ${e.name}`}
                            className="h-8 w-[200px] text-xs"
                            maxLength={200}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Month view */}
      {view === "month" && (
        <>
          {monthQuery.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : employees.length === 0 ? (
            <EmptyState title="No active employees" description="Add employees to see the monthly attendance matrix." />
          ) : (
            <div className="overflow-hidden rounded-lg border bg-card">
              <div className="overflow-x-auto thin-scrollbar">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="sticky left-0 z-10 bg-muted px-3 py-2 text-left font-semibold">Employee</th>
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                        <th
                          key={d}
                          className={cn(
                            "w-7 px-0 py-2 text-center font-semibold tabular-nums",
                            isSunday(d) && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                          )}
                        >
                          {d}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-center font-semibold" title="Days present this month">P</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((e) => {
                      let presentDays = 0
                      for (let d = 1; d <= daysInMonth; d++) {
                        if (dayMap.get(`${e.id}|${d}`) === "PRESENT") presentDays += 1
                      }
                      return (
                        <tr key={e.id} className="border-b last:border-0">
                          <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-1.5">
                            <span className="text-sm font-medium">{e.name}</span>
                            <span className="ml-1.5 text-xs text-muted-foreground">{e.code}</span>
                          </td>
                          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                            const status = dayMap.get(`${e.id}|${d}`)
                            return (
                              <td key={d} className={cn("py-1.5 text-center", isSunday(d) && "bg-amber-500/5")}>
                                {status ? (
                                  <span
                                    title={`${e.name} — ${fmtDateIST(`${month}-${String(d).padStart(2, "0")}`)}: ${ATTENDANCE_STATUS_LABELS[status] ?? status}`}
                                    className={cn("inline-block h-2.5 w-2.5 rounded-full", ATTENDANCE_DOT_COLORS[status] ?? "bg-zinc-400")}
                                  />
                                ) : (
                                  <span className="text-[10px] leading-none text-muted-foreground/40">·</span>
                                )}
                              </td>
                            )
                          })}
                          <td className="px-3 py-1.5 text-center text-xs font-semibold tabular-nums">{presentDays}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            {ATTENDANCE_STATUSES.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className={cn("h-2.5 w-2.5 rounded-full", ATTENDANCE_DOT_COLORS[s])} />
                {ATTENDANCE_STATUS_LABELS[s]}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-dashed border-muted-foreground/60" />Not marked</span>
            <span>Sundays shaded · P = days present</span>
          </div>
        </>
      )}
    </div>
  )
}

// ==================== TASKS TAB ====================
function TasksTab({ employees, focusId, autoNew }: { employees: Employee[]; focusId?: string | null; autoNew?: boolean }) {
  const qc = useQueryClient()
  const canCreate = canDo("tasks", "create")
  const canEdit = canDo("tasks", "edit")
  const canDelete = canDo("tasks", "delete")
  const [creating, setCreating] = useState(!!autoNew)
  const [editing, setEditing] = useState<Task | null>(null)
  const [deleting, setDeleting] = useState<Task | null>(null)
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [busyId, setBusyId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api.get("tasks"),
  })
  const tasks: Task[] = data?.tasks ?? []
  const summary = data?.summary

  // Deep-link focus: scroll the task into view once loaded
  useEffect(() => {
    if (!focusId || tasks.length === 0) return
    const el = document.getElementById(`task-${focusId}`)
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [focusId, tasks])

  const completedCount = tasks.filter((t) => t.status === "COMPLETED").length
  const filtered = statusFilter === "ALL" ? tasks : tasks.filter((t) => t.status === statusFilter)

  async function changeStatus(task: Task, status: string) {
    setBusyId(task.id)
    try {
      await api.put(`tasks/${task.id}`, { status })
      const titles: Record<string, string> = {
        COMPLETED: "Task completed",
        IN_PROGRESS: "Task started",
        PENDING: "Task reopened",
        CANCELLED: "Task cancelled",
      }
      toast({ title: titles[status] ?? "Task updated", description: task.title })
      qc.invalidateQueries({ queryKey: ["tasks"] })
    } catch (e: any) {
      toast({ title: "Could not update task", description: e.message, variant: "destructive" })
    } finally {
      setBusyId(null)
    }
  }

  async function deleteTask() {
    if (!deleting) return
    setBusyId(deleting.id)
    try {
      await api.del(`tasks/${deleting.id}`)
      toast({ title: "Task deleted", description: deleting.title })
      qc.invalidateQueries({ queryKey: ["tasks"] })
      setDeleting(null)
    } catch (e: any) {
      toast({ title: "Could not delete task", description: e.message, variant: "destructive" })
    } finally {
      setBusyId(null)
    }
  }

  const chips = [
    { value: "ALL", label: "All", count: tasks.length },
    ...TASK_STATUSES.map((s) => ({ value: s, label: TASK_STATUS_LABELS[s], count: tasks.filter((t) => t.status === s).length })),
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Pending" value={summary?.pending ?? (isLoading ? "…" : 0)} icon={<ListTodo className="h-4 w-4" />} />
        <StatCard label="In Progress" value={summary?.inProgress ?? (isLoading ? "…" : 0)} tone="warning" icon={<Play className="h-4 w-4" />} />
        <StatCard
          label="Overdue"
          value={summary?.overdue ?? (isLoading ? "…" : 0)}
          tone={(summary?.overdue ?? 0) > 0 ? "negative" : "default"}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
        <StatCard label="Completed" value={isLoading ? "…" : completedCount} tone="positive" icon={<CheckCircle2 className="h-4 w-4" />} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((c) => (
          <button
            key={c.value}
            onClick={() => setStatusFilter(c.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              statusFilter === c.value
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {c.label}
            <span className="tabular-nums opacity-70">{c.count}</span>
          </button>
        ))}
        {canCreate && (
          <Button size="sm" className="ml-auto h-8" onClick={() => setCreating(true)}>
            <ListTodo className="mr-1.5 h-4 w-4" /> New Task
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg border bg-card" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={statusFilter === "ALL" ? "No tasks yet" : `No ${TASK_STATUS_LABELS[statusFilter]?.toLowerCase() ?? statusFilter.toLowerCase()} tasks`}
          description="Create tasks to assign work to your staff with priorities and due dates."
          action={canCreate && statusFilter === "ALL" ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <ListTodo className="mr-1.5 h-4 w-4" /> New Task
            </Button>
          ) : undefined}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => {
            const overdue = isTaskOverdue(t)
            const busy = busyId === t.id
            const done = t.status === "COMPLETED"
            const closed = t.status === "CANCELLED"
            return (
              <div
                key={t.id}
                id={`task-${t.id}`}
                onClick={() => { if (canEdit && !busy) setEditing(t) }}
                className={cn(
                  "rounded-lg border bg-card p-3 shadow-sm transition-shadow",
                  canEdit && !busy && "cursor-pointer hover:shadow-md",
                  focusId === t.id && "ring-2 ring-primary",
                  done && "opacity-75",
                  closed && "opacity-60",
                )}
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  {/* Quick complete checkbox */}
                  <button
                    type="button"
                    aria-label={done ? `Reopen task: ${t.title}` : `Mark task complete: ${t.title}`}
                    title={closed ? "Cancelled task" : done ? "Completed — click to reopen" : "Mark complete"}
                    disabled={closed || !canEdit || busy}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      changeStatus(t, done ? "PENDING" : "COMPLETED")
                    }}
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                      done
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-zinc-300 text-transparent hover:border-primary dark:border-zinc-600",
                      (closed || !canEdit || busy) && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </button>
                  <StatusBadge label={TASK_PRIORITY_LABELS[t.priority] ?? t.priority} className={TASK_PRIORITY_COLORS[t.priority]} />
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm font-medium", (done || closed) && "text-muted-foreground line-through")}>
                      {t.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.assignedTo ? `Assigned to ${t.assignedTo}` : "Unassigned"}
                      {t.createdByName ? ` · by ${t.createdByName}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn("whitespace-nowrap text-xs font-medium", overdue ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
                      {t.dueDate ? (
                        <>
                          <CalendarClock className="mr-1 inline h-3.5 w-3.5" />
                          <DateCell value={t.dueDate} />
                        </>
                      ) : (
                        "No due date"
                      )}
                    </p>
                    {overdue && <p className="text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">Overdue</p>}
                  </div>
                  <StatusBadge label={TASK_STATUS_LABELS[t.status] ?? t.status} className={TASK_STATUS_BADGE_COLORS[t.status]} />
                  {canEdit && (
                    <div className="flex items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
                      {t.status === "PENDING" && (
                        <Button variant="outline" size="sm" className="h-8" disabled={busy} onClick={() => changeStatus(t, "IN_PROGRESS")}>
                          <Play className="mr-1 h-3.5 w-3.5" /> Start
                        </Button>
                      )}
                      {(t.status === "PENDING" || t.status === "IN_PROGRESS") && (
                        <Button variant="outline" size="sm" className="h-8" disabled={busy} onClick={() => changeStatus(t, "COMPLETED")}>
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Complete
                        </Button>
                      )}
                      {(t.status === "PENDING" || t.status === "IN_PROGRESS") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-muted-foreground hover:text-destructive"
                          disabled={busy}
                          onClick={() => changeStatus(t, "CANCELLED")}
                        >
                          <Ban className="mr-1 h-3.5 w-3.5" /> Cancel
                        </Button>
                      )}
                      {(done || closed) && (
                        <Button variant="ghost" size="sm" className="h-8" disabled={busy} onClick={() => changeStatus(t, "PENDING")}>
                          <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reopen
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8" disabled={busy} onClick={() => setEditing(t)} aria-label={`Edit ${t.title}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          disabled={busy}
                          onClick={() => setDeleting(t)}
                          aria-label={`Delete ${t.title}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                {t.description && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{t.description}</p>}
              </div>
            )
          })}
        </div>
      )}

      {creating && <TaskForm employees={employees} onClose={() => setCreating(false)} />}
      {editing && <TaskForm employees={employees} task={editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          open
          onOpenChange={() => setDeleting(null)}
          title="Delete task?"
          description={`"${deleting.title}" will be permanently removed.`}
          confirmLabel="Delete"
          destructive
          loading={busyId === deleting.id}
          onConfirm={deleteTask}
        />
      )}
    </div>
  )
}

// ==================== TASK FORM (create / edit) ====================
function TaskForm({ task, employees, onClose }: { task?: Task; employees: Employee[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: task?.title ?? "",
    description: task?.description ?? "",
    assignedTo: task?.assignedTo ?? "",
    priority: task?.priority ?? "MEDIUM",
    dueDate: task?.dueDate ? fmtDateIST(task.dueDate, "yyyy-MM-dd") : "",
  })

  async function save() {
    if (!form.title.trim()) return toast({ title: "Title is required", variant: "destructive" })
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        assignedTo: form.assignedTo.trim(),
        priority: form.priority,
        dueDate: form.dueDate,
      }
      if (task) await api.put(`tasks/${task.id}`, payload)
      else await api.post("tasks", payload)
      toast({ title: task ? "Task updated" : "Task created", description: form.title.trim() })
      qc.invalidateQueries({ queryKey: ["tasks"] })
      onClose()
    } catch (e: any) {
      toast({ title: "Failed to save task", description: e.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Edit Task" : "New Task"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Title" required>
              <TextInput value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="What needs to be done?" autoFocus />
            </Field>
          </div>
          <Field label="Assign to" hint="Staff name or free text">
            <Input
              list="task-assign-suggestions"
              value={form.assignedTo}
              onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
              placeholder="e.g. Asha Verma"
              className="h-9"
            />
            <datalist id="task-assign-suggestions">
              {employees.map((e) => (
                <option key={e.id} value={e.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Priority">
            <div className="flex items-center gap-2">
              <SelectInput
                value={form.priority}
                onChange={(v) => setForm({ ...form, priority: v })}
                options={TASK_PRIORITIES.map((p) => ({ value: p, label: TASK_PRIORITY_LABELS[p] }))}
              />
              <StatusBadge label={TASK_PRIORITY_LABELS[form.priority] ?? form.priority} className={cn("shrink-0", TASK_PRIORITY_COLORS[form.priority])} />
            </div>
          </Field>
          <Field label="Due date">
            <TextInput type="date" value={form.dueDate} onChange={(v) => setForm({ ...form, dueDate: v })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description / notes">
              <TextArea value={form.description} onChange={(v) => setForm({ ...form, description: v })} rows={3} placeholder="Details, instructions, remarks…" />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} {task ? "Save" : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
