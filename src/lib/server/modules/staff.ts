import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"
import { AppError, audit, optStr, optNum, parseDate, requireStr, clampInt } from "@/lib/server/helpers"
import { createPayment, SessionInfo } from "@/lib/server/services/core"
import { ymdIST } from "@/lib/format"

export async function handle(ctx: Ctx) {
  const raw1 = ctx.segs[1]
  const SUB_ACTIONS = new Set(["attendance", "payments"])
  const action = raw1 && SUB_ACTIONS.has(raw1) ? raw1 : undefined
  const id = raw1 && !SUB_ACTIONS.has(raw1) ? raw1 : ctx.segs[2]

  // ---------- EMPLOYEES ----------
  if (ctx.method === "GET" && (!action || action === "index")) {
    ctx.requirePerm("staff", "view")
    const q = ctx.params.get("q")?.toLowerCase()
    const where: any = {}
    if (q) where.OR = [{ name: { contains: q } }, { code: { contains: q } }, { phone: { contains: q } }]
    const employees = await db.employee.findMany({ where, orderBy: { createdAt: "desc" } })
    const today = ymdIST()
    const attendanceToday = await db.attendance.findMany({ where: { date: today } })
    const attMap = new Map(attendanceToday.map((a) => [a.employeeId, a.status]))
    return json({
      employees: employees.map((e) => ({ ...e, todayAttendance: attMap.get(e.id) ?? null })),
      summary: {
        active: employees.filter((e) => e.status === "ACTIVE").length,
        presentToday: attendanceToday.filter((a) => a.status === "PRESENT").length,
      },
    })
  }

  if (ctx.method === "POST" && (!action || action === "index")) {
    ctx.requirePerm("staff", "create")
    const b = ctx.body ?? {}
    const employee = await db.$transaction(async (tx) => {
      const count = await tx.employee.count()
      const code = `EMP${String(count + 1).padStart(3, "0")}`
      return tx.employee.create({
        data: {
          code, name: requireStr(b.name, "Employee name", 120),
          phone: optStr(b.phone, 20), designation: optStr(b.designation, 80),
          joiningDate: b.joiningDate ? parseDate(b.joiningDate) : new Date(),
          salary: optNum(b.salary, 0),
          address: optStr(b.address, 400),
          notes: optStr(b.notes, 500),
        },
      })
    }, { timeout: 60000, maxWait: 20000 })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "staff", "CREATE", employee.id, { name: employee.name, code: employee.code }))
    return json({ employee })
  }

  if (ctx.method === "GET" && id && !action) {
    ctx.requirePerm("staff", "view")
    const employee = await db.employee.findUnique({
      where: { id },
      include: {
        attendance: { orderBy: { date: "desc" }, take: 60 },
        salaryPayments: { orderBy: { date: "desc" }, take: 50 },
      },
    })
    if (!employee) throw new AppError("Employee not found", 404)
    return json({ employee })
  }

  if (ctx.method === "PUT" && id && !action) {
    ctx.requirePerm("staff", "edit")
    const existing = await db.employee.findUnique({ where: { id } })
    if (!existing) throw new AppError("Employee not found", 404)
    const b = ctx.body ?? {}
    const employee = await db.employee.update({
      where: { id },
      data: {
        name: optStr(b.name) ?? existing.name,
        phone: b.phone !== undefined ? optStr(b.phone, 20) : existing.phone,
        designation: b.designation !== undefined ? optStr(b.designation, 80) : existing.designation,
        salary: b.salary !== undefined ? optNum(b.salary, existing.salary) : existing.salary,
        status: ["ACTIVE", "INACTIVE"].includes(b.status) ? b.status : existing.status,
        address: b.address !== undefined ? optStr(b.address, 400) : existing.address,
        notes: b.notes !== undefined ? optStr(b.notes, 500) : existing.notes,
      },
    })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "staff", "UPDATE", id, { fields: Object.keys(b) }))
    return json({ employee })
  }

  if (ctx.method === "DELETE" && id && !action) {
    ctx.requirePerm("staff", "delete")
    await db.employee.update({ where: { id }, data: { status: "INACTIVE" } })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "staff", "DELETE", id, { action: "deactivated" }))
    return json({ ok: true })
  }

  // ---------- ATTENDANCE ----------
  if (ctx.method === "GET" && action === "attendance") {
    ctx.requirePerm("staff", "view")
    const date = ctx.params.get("date") ?? ymdIST()
    const month = ctx.params.get("month") // YYYY-MM
    let where: any
    if (month) where = { date: { startsWith: month } }
    else where = { date }
    const records = await db.attendance.findMany({ where, include: { employee: true } })
    return json({ records, date })
  }

  if (ctx.method === "POST" && action === "attendance") {
    ctx.requirePerm("staff", "edit")
    const b = ctx.body ?? {}
    const date = optStr(b.date, 10) ?? ymdIST()
    const entries = Array.isArray(b.entries) ? b.entries : []
    if (!entries.length) throw new AppError("No attendance entries provided")
    const result = await db.$transaction(async (tx) => {
      const out: any[] = []
      for (const e of entries) {
        if (!["PRESENT", "ABSENT", "HALF_DAY", "LEAVE"].includes(e.status)) continue
        const rec = await tx.attendance.upsert({
          where: { employeeId_date: { employeeId: e.employeeId, date } },
          update: { status: e.status, note: optStr(e.note, 200) },
          create: { employeeId: e.employeeId, date, status: e.status, note: optStr(e.note, 200) },
        })
        out.push(rec)
      }
      return out
    }, { timeout: 60000, maxWait: 20000 })
    await db.$transaction(async (tx) => audit(tx, ctx.user, "staff", "UPDATE", null, { action: "attendance_marked", date, count: result.length }))
    return json({ records: result })
  }

  // ---------- SALARY / ADVANCE PAYMENTS ----------
  if (ctx.method === "GET" && action === "payments") {
    ctx.requirePerm("staff", "view")
    const employeeId = ctx.params.get("employeeId")
    const where: any = {}
    if (employeeId) where.employeeId = employeeId
    const payments = await db.salaryPayment.findMany({ where, orderBy: { date: "desc" }, take: 200, include: { employee: true } })
    return json({ payments })
  }

  if (ctx.method === "POST" && action === "payments") {
    ctx.requirePerm("staff", "pay")
    const b = ctx.body ?? {}
    const employeeId = requireStr(b.employeeId, "Employee")
    const amount = optNum(b.amount, 0)
    if (amount <= 0) throw new AppError("Amount must be greater than zero")
    const type = ["SALARY", "ADVANCE", "BONUS", "DEDUCTION"].includes(b.type) ? b.type : "SALARY"
    const method = ["CASH", "UPI", "CARD", "BANK"].includes(b.method) ? b.method : "CASH"
    const date = b.date ? parseDate(b.date) : new Date()

    const result = await db.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({ where: { id: employeeId } })
      if (!employee) throw new AppError("Employee not found", 404)

      const payment = await createPayment(tx, {
        direction: "OUT", method, category: type === "ADVANCE" ? "ADVANCE" : "SALARY",
        amount, date, employeeId,
        notes: optStr(b.notes, 300) ?? `${type} — ${employee.name}${b.month ? ` (${b.month})` : ""}`,
      }, ctx.user as SessionInfo)

      const sp = await tx.salaryPayment.create({
        data: {
          employeeId, type, month: optStr(b.month, 7),
          amount: type === "DEDUCTION" ? -amount : amount,
          method, date, notes: optStr(b.notes, 300),
          paymentId: payment.id,
        },
      })

      // Salaries and bonuses are operating expenses; advances are not (they are recoverable)
      if (type === "SALARY" || type === "BONUS") {
        await tx.expense.create({
          data: {
            category: type === "SALARY" ? "SALARY" : "OTHER",
            description: `${type === "SALARY" ? "Salary" : "Bonus"} — ${employee.name}${b.month ? ` (${b.month})` : ""}`,
            amount, date, method, paidTo: employee.name,
            paymentId: payment.id, createdByName: ctx.user?.fullName ?? "System",
          },
        })
      }
      await audit(tx, ctx.user, "staff", "PAY", sp.id, { employee: employee.name, type, amount })
      return sp
    }, { timeout: 60000, maxWait: 20000 })
    return json({ payment: result })
  }

  return null
}
