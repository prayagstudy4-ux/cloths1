// Shared constants for Clothing Business Manager (client + server safe)

export const APP_NAME = "Clothing Business Manager"
export const APP_VERSION = "1.0.0"

// ---------- Roles ----------
export const ROLES = ["OWNER", "MANAGER", "SALES", "INVENTORY", "ACCOUNTANT", "PRODUCTION", "WORKER"] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  SALES: "Sales Staff",
  INVENTORY: "Inventory Staff",
  ACCOUNTANT: "Accountant",
  PRODUCTION: "Production Manager",
  WORKER: "Worker",
}

// ---------- Modules (permission subjects) ----------
export const MODULES = [
  "dashboard", "business", "customers", "suppliers", "products", "inventory",
  "sales", "orders", "purchases", "payments", "production", "staff",
  "expenses", "accounts", "reports", "documents", "notifications",
  "settings", "users", "audit", "backup", "search", "tasks",
] as const
export type AppModule = (typeof MODULES)[number]

// ---------- Customer ----------
export const CUSTOMER_TYPES = ["RETAIL", "WHOLESALE", "DISTRIBUTOR", "VIP", "REGULAR"] as const
export const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  RETAIL: "Retail", WHOLESALE: "Wholesale", DISTRIBUTOR: "Distributor", VIP: "VIP", REGULAR: "Regular",
}

// ---------- Order ----------
export const ORDER_STATUSES = ["DRAFT", "CONFIRMED", "PROCESSING", "PACKED", "READY", "DISPATCHED", "DELIVERED", "CANCELLED", "RETURNED"] as const
export const ORDER_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft", CONFIRMED: "Confirmed", PROCESSING: "Processing", PACKED: "Packed",
  READY: "Ready", DISPATCHED: "Dispatched", DELIVERED: "Delivered", CANCELLED: "Cancelled", RETURNED: "Returned",
}
export const ORDER_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  CONFIRMED: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  PROCESSING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  PACKED: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  READY: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  DISPATCHED: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  DELIVERED: "bg-emerald-600 text-white",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  RETURNED: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
}

export const DELIVERY_STATUSES = ["PENDING", "PACKED", "DISPATCHED", "IN_TRANSIT", "DELIVERED", "FAILED", "RETURNED"] as const
export const DELIVERY_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending", PACKED: "Packed", DISPATCHED: "Dispatched", IN_TRANSIT: "In Transit",
  DELIVERED: "Delivered", FAILED: "Failed", RETURNED: "Returned",
}

// ---------- Payment ----------
export const PAYMENT_METHODS = ["CASH", "UPI", "CARD", "BANK"] as const
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash", UPI: "UPI", CARD: "Card", BANK: "Bank Transfer",
}
export const PAYMENT_STATUSES = ["PENDING", "VERIFIED", "UNMATCHED", "FAILED", "VOID"] as const
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending", VERIFIED: "Verified", UNMATCHED: "Unmatched", FAILED: "Failed", VOID: "Void",
}
export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  VERIFIED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  UNMATCHED: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  VOID: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
}
export const PAYMENT_CATEGORIES = ["SALE_RECEIPT", "CUSTOMER_PAYMENT", "SUPPLIER_PAYMENT", "EXPENSE", "SALARY", "CONTRACTOR_PAYMENT", "REFUND", "ADVANCE"] as const
export const PAYMENT_CATEGORY_LABELS: Record<string, string> = {
  SALE_RECEIPT: "Sale Receipt", CUSTOMER_PAYMENT: "Customer Payment", SUPPLIER_PAYMENT: "Supplier Payment",
  EXPENSE: "Expense", SALARY: "Salary", CONTRACTOR_PAYMENT: "Contractor Payment", REFUND: "Refund", ADVANCE: "Advance",
}

// ---------- Sale ----------
export const SALE_PAYMENT_STATUSES = ["PAID", "PARTIAL", "UNPAID", "VOID"] as const
export const SALE_PAYMENT_STATUS_COLORS: Record<string, string> = {
  PAID: "bg-emerald-600 text-white",
  PARTIAL: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  UNPAID: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  VOID: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
}

// ---------- Purchase ----------
export const PURCHASE_STATUSES = ["ORDERED", "RECEIVED", "PARTIAL_RECEIVED", "CANCELLED"] as const
export const PURCHASE_STATUS_LABELS: Record<string, string> = {
  ORDERED: "Ordered (PO)", RECEIVED: "Received", PARTIAL_RECEIVED: "Partially Received", CANCELLED: "Cancelled",
}
export const PURCHASE_STATUS_COLORS: Record<string, string> = {
  ORDERED: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  RECEIVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  PARTIAL_RECEIVED: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  CANCELLED: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
}

// ---------- Quotation ----------
export const QUOTATION_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED"] as const
export const QUOTATION_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft", SENT: "Sent", ACCEPTED: "Accepted", REJECTED: "Rejected", EXPIRED: "Expired", CONVERTED: "Converted",
}
export const QUOTATION_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  SENT: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  ACCEPTED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  EXPIRED: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  CONVERTED: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
}

// ---------- Inventory ----------
export const MOVEMENT_TYPES = ["OPENING", "PURCHASE", "SALE", "SALE_RETURN", "DAMAGE", "LOSS", "TRANSFER_IN", "TRANSFER_OUT", "ADJUSTMENT", "PRODUCTION_IN", "PRODUCTION_CONSUME", "SUPPLIER_RETURN"] as const
export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  OPENING: "Opening Stock", PURCHASE: "Purchase", SALE: "Sale", SALE_RETURN: "Sale Return",
  DAMAGE: "Damage", LOSS: "Loss", TRANSFER_IN: "Transfer In", TRANSFER_OUT: "Transfer Out",
  ADJUSTMENT: "Adjustment", PRODUCTION_IN: "Production In", PRODUCTION_CONSUME: "Production Consume", SUPPLIER_RETURN: "Supplier Return",
}
export const WAREHOUSE_TYPES = ["SHOP", "WAREHOUSE", "FACTORY", "BRANCH"] as const
export const WAREHOUSE_TYPE_LABELS: Record<string, string> = {
  SHOP: "Shop", WAREHOUSE: "Warehouse", FACTORY: "Factory", BRANCH: "Branch",
}

// ---------- Production ----------
export const PRODUCTION_STAGES = ["DESIGN", "RAW_MATERIAL", "CUTTING", "STITCHING", "PRINTING", "FINISHING", "QC", "PACKAGING", "COMPLETED"] as const
export const PRODUCTION_STAGE_LABELS: Record<string, string> = {
  DESIGN: "Design", RAW_MATERIAL: "Raw Material", CUTTING: "Cutting", STITCHING: "Stitching",
  PRINTING: "Printing / Embroidery", FINISHING: "Finishing", QC: "Quality Check", PACKAGING: "Packaging", COMPLETED: "Completed",
}
export const CONTRACTOR_TYPES = ["TAILOR", "STITCHING", "PRINTING", "EMBROIDERY", "JOB_WORKER", "FABRIC_SUPPLIER", "OTHER"] as const
export const CONTRACTOR_TYPE_LABELS: Record<string, string> = {
  TAILOR: "Tailor", STITCHING: "Stitching Contractor", PRINTING: "Printing Contractor",
  EMBROIDERY: "Embroidery Worker", JOB_WORKER: "Job Worker", FABRIC_SUPPLIER: "Fabric Supplier", OTHER: "Other",
}
export const JOBWORK_STATUSES = ["ASSIGNED", "PROCESSING", "COMPLETED", "CANCELLED"] as const
export const JOBWORK_STATUS_LABELS: Record<string, string> = {
  ASSIGNED: "Assigned", PROCESSING: "Processing", COMPLETED: "Completed", CANCELLED: "Cancelled",
}
export const RAW_MATERIAL_TYPES = ["FABRIC", "THREAD", "BUTTON", "ZIPPER", "LABEL", "PACKAGING", "OTHER"] as const
export const RAW_MATERIAL_TYPE_LABELS: Record<string, string> = {
  FABRIC: "Fabric", THREAD: "Thread", BUTTON: "Buttons", ZIPPER: "Zippers",
  LABEL: "Labels", PACKAGING: "Packaging", OTHER: "Other",
}
export const RAW_MATERIAL_UNITS = ["METER", "KG", "PIECE", "ROLL", "BOX", "SET"] as const
export const RAW_MATERIAL_UNIT_LABELS: Record<string, string> = {
  METER: "Meter", KG: "Kg", PIECE: "Piece", ROLL: "Roll", BOX: "Box", SET: "Set",
}

// ---------- Expense ----------
export const EXPENSE_CATEGORIES = ["RENT", "ELECTRICITY", "SALARY", "TRANSPORT", "PACKAGING", "MARKETING", "MACHINERY", "REPAIRS", "INTERNET", "RAW_MATERIAL", "CONTRACTOR", "OTHER"] as const
export const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  RENT: "Rent", ELECTRICITY: "Electricity", SALARY: "Salary", TRANSPORT: "Transport",
  PACKAGING: "Packaging", MARKETING: "Marketing", MACHINERY: "Machinery", REPAIRS: "Repairs",
  INTERNET: "Internet", RAW_MATERIAL: "Raw Material", CONTRACTOR: "Contractor", OTHER: "Other",
}

// ---------- Staff ----------
export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const
export const TASK_PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent",
}
export const TASK_PRIORITY_COLORS: Record<string, string> = {
  LOW: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  MEDIUM: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  HIGH: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  URGENT: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
}
export const TASK_STATUSES = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const
export const TASK_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending", IN_PROGRESS: "In Progress", COMPLETED: "Completed", CANCELLED: "Cancelled",
}
export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE"] as const
export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  PRESENT: "Present", ABSENT: "Absent", HALF_DAY: "Half Day", LEAVE: "Leave",
}
export const SALARY_PAYMENT_TYPES = ["SALARY", "ADVANCE", "BONUS", "DEDUCTION"] as const
export const SALARY_PAYMENT_TYPE_LABELS: Record<string, string> = {
  SALARY: "Salary", ADVANCE: "Advance", BONUS: "Bonus", DEDUCTION: "Deduction",
}

// ---------- Product ----------
export const PRODUCT_STATUSES = ["ACTIVE", "DRAFT", "ARCHIVED"] as const
export const PRODUCT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active", DRAFT: "Draft", ARCHIVED: "Archived",
}
export const GENDERS = ["MEN", "WOMEN", "KIDS", "UNISEX"] as const
export const GENDER_LABELS: Record<string, string> = {
  MEN: "Men", WOMEN: "Women", KIDS: "Kids", UNISEX: "Unisex",
}
export const PRODUCT_TYPES = ["T-SHIRT", "SHIRT", "TROUSER", "JEANS", "KURTA", "KURTI", "SAREE", "DRESS", "HOODIE", "JACKET", "SHORTS", "LEGGINGS", "TRACK_PANT", "BLOUSE", "SUIT", "OTHER"] as const
export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  "T-SHIRT": "T-Shirt", SHIRT: "Shirt", TROUSER: "Trouser", JEANS: "Jeans", KURTA: "Kurta",
  KURTI: "Kurti", SAREE: "Saree", DRESS: "Dress", HOODIE: "Hoodie", JACKET: "Jacket",
  SHORTS: "Shorts", LEGGINGS: "Leggings", "TRACK_PANT": "Track Pant", BLOUSE: "Blouse", SUIT: "Suit", OTHER: "Other",
}
export const COLLECTION_SEASONS = ["SUMMER", "WINTER", "MONSOON", "FESTIVE", "SPRING", "AUTUMN", "ALL_SEASON"] as const
export const COLLECTION_SEASON_LABELS: Record<string, string> = {
  SUMMER: "Summer", WINTER: "Winter", MONSOON: "Monsoon", FESTIVE: "Festive",
  SPRING: "Spring", AUTUMN: "Autumn", ALL_SEASON: "All Season",
}

// ---------- Return ----------
export const RETURN_TYPES = ["CUSTOMER_RETURN", "EXCHANGE", "SUPPLIER_RETURN"] as const
export const RETURN_TYPE_LABELS: Record<string, string> = {
  CUSTOMER_RETURN: "Customer Return", EXCHANGE: "Exchange", SUPPLIER_RETURN: "Supplier Return",
}
export const REFUND_METHODS = ["CASH_REFUND", "UPI_REFUND", "STORE_CREDIT", "ADJUSTMENT", "NONE"] as const
export const REFUND_METHOD_LABELS: Record<string, string> = {
  CASH_REFUND: "Cash Refund", UPI_REFUND: "UPI Refund", STORE_CREDIT: "Store Credit", ADJUSTMENT: "Adjusted", NONE: "None",
}

// ---------- Documents ----------
export const DOCUMENT_CATEGORIES = ["SUPPLIER", "PURCHASE", "EMPLOYEE", "PRODUCT", "CONTRACT", "RECEIPT", "INVOICE", "OTHER"] as const
export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  SUPPLIER: "Supplier", PURCHASE: "Purchase", EMPLOYEE: "Employee", PRODUCT: "Product",
  CONTRACT: "Contract", RECEIPT: "Receipt", INVOICE: "Invoice", OTHER: "Other",
}

// ---------- Notification ----------
export const NOTIFICATION_TYPES = ["PAYMENT", "STOCK", "ORDER", "TASK", "DUE", "SYSTEM", "BACKUP"] as const
export const NOTIFICATION_SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const

// ---------- Sidebar nav definition ----------
export const NAV_GROUPS: { group: string; items: { id: string; label: string; icon: string }[] }[] = [
  {
    group: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", icon: "LayoutDashboard" },
      { id: "business", label: "Business", icon: "Building2" },
    ],
  },
  {
    group: "Contacts",
    items: [
      { id: "customers", label: "Customers", icon: "Users" },
      { id: "suppliers", label: "Suppliers", icon: "Truck" },
    ],
  },
  {
    group: "Catalog & Stock",
    items: [
      { id: "products", label: "Products", icon: "Shirt" },
      { id: "inventory", label: "Inventory", icon: "Boxes" },
    ],
  },
  {
    group: "Sales & Orders",
    items: [
      { id: "sales", label: "Sales / POS", icon: "ShoppingCart" },
      { id: "purchases", label: "Purchases", icon: "PackageDown" },
    ],
  },
  {
    group: "Operations",
    items: [
      { id: "production", label: "Production", icon: "Factory" },
      { id: "staff", label: "Staff & Workers", icon: "IdCard" },
      { id: "expenses", label: "Expenses", icon: "Receipt" },
    ],
  },
  {
    group: "Finance",
    items: [
      { id: "payments", label: "Payments", icon: "CreditCard" },
      { id: "accounts", label: "Accounts", icon: "Landmark" },
      { id: "reports", label: "Reports", icon: "TrendingUp" },
    ],
  },
  {
    group: "System",
    items: [
      { id: "documents", label: "Documents", icon: "FolderOpen" },
      { id: "notifications", label: "Notifications", icon: "Bell" },
      { id: "settings", label: "Settings", icon: "Settings" },
    ],
  },
]

// ---------- Date range presets ----------
export const DATE_PRESETS = ["today", "yesterday", "this_week", "this_month", "last_month", "this_year", "custom"] as const
export const DATE_PRESET_LABELS: Record<string, string> = {
  today: "Today", yesterday: "Yesterday", this_week: "This Week", this_month: "This Month",
  last_month: "Last Month", this_year: "This Year", custom: "Custom Range",
}
