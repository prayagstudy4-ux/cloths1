"use client"

import { useState } from "react"
import { api } from "@/lib/client/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Field } from "@/components/shared/fields"
import { Loader2, ArrowLeft, ArrowRight, Building2, UserCog, Receipt, Percent, Smartphone, HardDriveDownload, CheckCircle2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

const STEPS = [
  { id: 1, title: "Business Information", icon: Building2 },
  { id: 2, title: "Owner Account", icon: UserCog },
  { id: 3, title: "Invoice Settings", icon: Receipt },
  { id: 4, title: "Tax Settings", icon: Percent },
  { id: 5, title: "Payment / UPI Settings", icon: Smartphone },
  { id: 6, title: "Backup Settings", icon: HardDriveDownload },
  { id: 7, title: "Finish", icon: CheckCircle2 },
]

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    businessName: "", brandName: "", phone: "", email: "", address: "", city: "", state: "", pincode: "",
    gstin: "", businessType: "RETAIL",
    ownerName: "", username: "", password: "",
    invoicePrefix: "INV", invoiceTerms: "Goods once sold will not be taken back.", invoiceFooter: "Thank you for your business!",
    taxEnabled: true, defaultTaxRate: 5,
    upiId: "", upiPayeeName: "", bankName: "", bankAccount: "", bankIfsc: "",
    autoBackup: true, loadDemo: false,
  })

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }))

  function next() {
    if (step === 1 && !form.businessName.trim()) return toast({ title: "Business name is required", variant: "destructive" })
    if (step === 2) {
      if (!form.ownerName.trim()) return toast({ title: "Owner name is required", variant: "destructive" })
      if (!form.username.trim()) return toast({ title: "Username is required", variant: "destructive" })
      if (form.password.length < 4) return toast({ title: "Password must be at least 4 characters", variant: "destructive" })
    }
    setStep((s) => Math.min(7, s + 1))
  }

  async function finish() {
    setLoading(true)
    try {
      await api.post("setup/complete", form)
      if (form.loadDemo) {
        try {
          // login first then load demo
          const login = await api.post("auth/login", { username: form.username, password: form.password })
          await api.post("demo-data/load")
        } catch (e: any) {
          toast({ title: "Demo data could not load", description: e.message, variant: "destructive" })
        }
      }
      toast({ title: "Setup complete!", description: "Sign in with your new account." })
      onComplete()
    } catch (e: any) {
      toast({ title: "Setup failed", description: e.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-950 dark:to-zinc-900 p-4">
      <div className="mx-auto max-w-2xl pt-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-2xl font-bold text-primary-foreground">V</div>
          <h1 className="text-2xl font-bold">Welcome to Clothing Business Manager</h1>
          <p className="mt-1 text-sm text-muted-foreground">Set up your business in a few quick steps</p>
        </div>

        {/* Stepper */}
        <div className="mb-6 flex items-center justify-between gap-1 overflow-x-auto pb-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const active = step === s.id
            const done = step > s.id
            return (
              <div key={s.id} className="flex items-center">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors",
                    done ? "border-primary bg-primary text-primary-foreground" : active ? "border-primary text-primary" : "border-muted-foreground/30 text-muted-foreground",
                  )}
                  title={s.title}
                >
                  {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                {i < STEPS.length - 1 && <div className={cn("h-0.5 w-4 sm:w-8", done ? "bg-primary" : "bg-muted-foreground/20")} />}
              </div>
            )
          })}
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-lg">
          <h2 className="mb-1 text-lg font-semibold">{STEPS[step - 1].title}</h2>
          <p className="mb-5 text-sm text-muted-foreground">Step {step} of {STEPS.length}</p>

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label="Business name" required><Input value={form.businessName} onChange={(e) => set("businessName", e.target.value)} placeholder="e.g. VastraCo Clothing" className="h-10" /></Field></div>
              <Field label="Brand name"><Input value={form.brandName} onChange={(e) => set("brandName", e.target.value)} placeholder="e.g. VastraCo" className="h-10" /></Field>
              <Field label="Business type">
                <select value={form.businessType} onChange={(e) => set("businessType", e.target.value)} className="h-10 w-full rounded-md border bg-transparent px-3 text-sm">
                  <option value="RETAIL">Retail</option>
                  <option value="WHOLESALE">Wholesale</option>
                  <option value="MANUFACTURING">Manufacturing</option>
                  <option value="RETAIL_WHOLESALE">Retail + Wholesale</option>
                </select>
              </Field>
              <Field label="Phone"><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="98XXXXXXXX" className="h-10" /></Field>
              <Field label="Email"><Input value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="business@email.com" className="h-10" /></Field>
              <div className="sm:col-span-2"><Field label="Address"><Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Shop address" className="h-10" /></Field></div>
              <Field label="City"><Input value={form.city} onChange={(e) => set("city", e.target.value)} className="h-10" /></Field>
              <Field label="State"><Input value={form.state} onChange={(e) => set("state", e.target.value)} className="h-10" /></Field>
              <Field label="GSTIN (optional)"><Input value={form.gstin} onChange={(e) => set("gstin", e.target.value)} placeholder="27AABCS1429B1Z1" className="h-10" /></Field>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2"><Field label="Owner full name" required><Input value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} placeholder="Your name" className="h-10" /></Field></div>
              <Field label="Username" required hint="Used to sign in — e.g. owner"><Input value={form.username} onChange={(e) => set("username", e.target.value.toLowerCase())} placeholder="owner" className="h-10" /></Field>
              <Field label="Password" required hint="Minimum 4 characters"><Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} className="h-10" /></Field>
              <p className="sm:col-span-2 rounded-md bg-muted p-3 text-xs text-muted-foreground">
                The owner account has full access to every module: business, products, inventory, sales, purchases,
                payments, production, staff, accounts, reports, settings, users and backups.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Invoice number prefix"><Input value={form.invoicePrefix} onChange={(e) => set("invoicePrefix", e.target.value.toUpperCase())} className="h-10" /></Field>
              <div className="hidden sm:block" />
              <div className="sm:col-span-2"><Field label="Invoice terms"><Input value={form.invoiceTerms} onChange={(e) => set("invoiceTerms", e.target.value)} className="h-10" /></Field></div>
              <div className="sm:col-span-2"><Field label="Invoice footer note"><Input value={form.invoiceFooter} onChange={(e) => set("invoiceFooter", e.target.value)} className="h-10" /></Field></div>
              <p className="sm:col-span-2 rounded-md bg-muted p-3 text-xs text-muted-foreground">
                Invoices support A4, Thermal 80mm and Thermal 58mm print formats. You can upload your logo later in Business Profile.
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-md border p-3">
                <Switch checked={form.taxEnabled} onCheckedChange={(v) => set("taxEnabled", v)} />
                <div>
                  <p className="text-sm font-medium">Enable GST / Tax</p>
                  <p className="text-xs text-muted-foreground">Add tax to invoices automatically</p>
                </div>
              </div>
              <Field label="Default tax rate (%)"><Input type="number" value={form.defaultTaxRate} onChange={(e) => set("defaultTaxRate", parseFloat(e.target.value) || 0)} className="h-10" /></Field>
              <p className="sm:col-span-2 rounded-md bg-muted p-3 text-xs text-muted-foreground">
                Common rates: 5% (garments under ₹1,000), 12% (garments above ₹1,000). Each product can override this.
              </p>
            </div>
          )}

          {step === 5 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="UPI ID (VPA)" hint="Used for dynamic payment QR codes — e.g. yourshop@ybl">
                  <Input value={form.upiId} onChange={(e) => set("upiId", e.target.value)} placeholder="yourshop@okhdfcbank" className="h-10" />
                </Field>
              </div>
              <Field label="Payee name (shown in UPI apps)"><Input value={form.upiPayeeName} onChange={(e) => set("upiPayeeName", e.target.value)} placeholder={form.businessName} className="h-10" /></Field>
              <div className="hidden sm:block" />
              <Field label="Bank name"><Input value={form.bankName} onChange={(e) => set("bankName", e.target.value)} className="h-10" /></Field>
              <Field label="Account number"><Input value={form.bankAccount} onChange={(e) => set("bankAccount", e.target.value)} className="h-10" /></Field>
              <Field label="IFSC"><Input value={form.bankIfsc} onChange={(e) => set("bankIfsc", e.target.value.toUpperCase())} className="h-10" /></Field>
              <p className="sm:col-span-2 rounded-md bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
                Payments are never auto-marked as received. When a customer pays via your QR, you verify the money
                arrived in your UPI app / bank, then confirm it in the app — or configure a payment provider
                (Razorpay) later in Settings → Payments for automatic verification.
              </p>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-md border p-3">
                <Switch checked={form.autoBackup} onCheckedChange={(v) => set("autoBackup", v)} />
                <div>
                  <p className="text-sm font-medium">Automatic daily backup</p>
                  <p className="text-xs text-muted-foreground">A verified copy of the database is saved locally each day (30-day retention)</p>
                </div>
              </div>
              <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                Backups are stored in the app data folder (<code>app-data/backups</code>). You can create, verify,
                download and restore backups anytime from Settings → Backup.
              </p>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <h3 className="font-medium">{form.businessName || "My Clothing Business"}</h3>
                <p className="text-sm text-muted-foreground">{form.city}{form.city && form.state ? ", " : ""}{form.state}</p>
                <div className="mt-3 grid gap-1 text-sm text-muted-foreground">
                  <span>Owner: <b className="text-foreground">{form.ownerName}</b> (@{form.username})</span>
                  <span>Tax: {form.taxEnabled ? `Enabled (${form.defaultTaxRate}%)` : "Disabled"}</span>
                  <span>UPI: {form.upiId || "Not set (add later in settings)"}</span>
                  <span>Auto-backup: {form.autoBackup ? "Daily" : "Manual only"}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-md border border-dashed p-3">
                <Switch checked={form.loadDemo} onCheckedChange={(v) => set("loadDemo", v)} />
                <div>
                  <p className="text-sm font-medium">Load demo data (optional)</p>
                  <p className="text-xs text-muted-foreground">Sample products, customers, 30 days of sales, purchases & production — great for exploring. You can start fresh anytime by not ticking this.</p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1 || loading}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back
            </Button>
            {step < 7 ? (
              <Button onClick={next}>Next <ArrowRight className="ml-1 h-4 w-4" /></Button>
            ) : (
              <Button onClick={finish} disabled={loading} className="min-w-40">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Create Business
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
