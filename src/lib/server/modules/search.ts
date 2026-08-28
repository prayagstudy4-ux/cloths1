import { Ctx, json } from "@/lib/server/router"
import { db } from "@/lib/db"

// Global search across modules
export async function handle(ctx: Ctx) {
  if (ctx.method !== "GET") return null
  const q = (ctx.params.get("q") ?? "").trim()
  if (q.length < 1) return json({ groups: [] })
  const ql = q.toLowerCase()

  const [products, variants, customers, suppliers, sales, orders, quotations, payments, employees, contractors, jobWorks] = await Promise.all([
    db.product.findMany({ where: { OR: [{ name: { contains: q } }, { code: { contains: q } }, { brand: { contains: q } }] }, take: 6 }),
    db.productVariant.findMany({
      where: { OR: [{ sku: { contains: ql } }, { barcode: { contains: ql } }] },
      include: { product: true, size: true, color: true }, take: 6,
    }),
    db.customer.findMany({ where: { OR: [{ name: { contains: q } }, { phone: { contains: q } }, { code: { contains: q } }] }, take: 6 }),
    db.supplier.findMany({ where: { OR: [{ name: { contains: q } }, { company: { contains: q } }, { phone: { contains: q } }] }, take: 5 }),
    db.sale.findMany({ where: { OR: [{ invoiceNumber: { contains: ql } }] }, include: { customer: true }, take: 6 }),
    db.order.findMany({ where: { number: { contains: ql } }, include: { customer: true }, take: 5 }),
    db.quotation.findMany({ where: { number: { contains: ql } }, include: { customer: true }, take: 5 }),
    db.payment.findMany({ where: { OR: [{ number: { contains: ql } }, { transactionId: { contains: ql } }] }, take: 6 }),
    db.employee.findMany({ where: { OR: [{ name: { contains: q } }, { code: { contains: q } }] }, take: 5 }),
    db.contractor.findMany({ where: { name: { contains: q } }, take: 5 }),
    db.jobWork.findMany({ where: { number: { contains: ql } }, take: 5 }),
  ])

  const groups: { module: string; label: string; results: any[] }[] = []

  if (variants.length) {
    groups.push({
      module: "products", label: "Product Variants",
      results: variants.map((v) => ({
        id: v.id, title: `${v.product.name} — ${[v.color?.name, v.size?.name].filter(Boolean).join(" / ") || "Default"}`,
        subtitle: `SKU ${v.sku}${v.barcode ? ` · ${v.barcode}` : ""}`, module: "products", entityId: v.productId,
      })),
    })
  }
  if (products.length) {
    groups.push({
      module: "products", label: "Products",
      results: products.map((p) => ({ id: p.id, title: p.name, subtitle: `${p.code}${p.brand ? ` · ${p.brand}` : ""}`, module: "products", entityId: p.id })),
    })
  }
  if (customers.length) {
    groups.push({
      module: "customers", label: "Customers",
      results: customers.map((c) => ({ id: c.id, title: c.name, subtitle: `${c.code}${c.phone ? ` · ${c.phone}` : ""}`, module: "customers", entityId: c.id })),
    })
  }
  if (sales.length) {
    groups.push({
      module: "sales", label: "Invoices",
      results: sales.map((s) => ({ id: s.id, title: s.invoiceNumber, subtitle: `${s.customer?.name ?? "Walk-in"} · ₹${s.total.toFixed(0)} · ${s.paymentStatus}`, module: "sales", entityId: s.id })),
    })
  }
  if (orders.length) {
    groups.push({
      module: "sales", label: "Orders",
      results: orders.map((o) => ({ id: o.id, title: o.number, subtitle: `${o.customer?.name ?? ""} · ${o.status}`, module: "sales", entityId: o.id, tab: "orders" })),
    })
  }
  if (quotations.length) {
    groups.push({
      module: "sales", label: "Quotations",
      results: quotations.map((q) => ({ id: q.id, title: q.number, subtitle: `${q.customer?.name ?? ""} · ${q.status}`, module: "sales", entityId: q.id, tab: "quotations" })),
    })
  }
  if (payments.length) {
    groups.push({
      module: "payments", label: "Payments",
      results: payments.map((p) => ({ id: p.id, title: p.number, subtitle: `${p.direction === "IN" ? "Received" : "Paid"} ₹${p.amount.toFixed(0)} · ${p.method} · ${p.status}`, module: "payments", entityId: p.id })),
    })
  }
  if (suppliers.length) {
    groups.push({
      module: "suppliers", label: "Suppliers",
      results: suppliers.map((s) => ({ id: s.id, title: s.name, subtitle: s.company ?? s.phone ?? "", module: "suppliers", entityId: s.id })),
    })
  }
  if (employees.length) {
    groups.push({
      module: "staff", label: "Staff",
      results: employees.map((e) => ({ id: e.id, title: e.name, subtitle: `${e.code}${e.designation ? ` · ${e.designation}` : ""}`, module: "staff", entityId: e.id })),
    })
  }
  if (contractors.length) {
    groups.push({
      module: "production", label: "Contractors",
      results: contractors.map((c) => ({ id: c.id, title: c.name, subtitle: c.type, module: "production", entityId: c.id })),
    })
  }
  if (jobWorks.length) {
    groups.push({
      module: "production", label: "Job Works",
      results: jobWorks.map((j) => ({ id: j.id, title: j.number, subtitle: `${j.description} · ${j.status}`, module: "production", entityId: j.id })),
    })
  }

  return json({ groups, query: q })
}
