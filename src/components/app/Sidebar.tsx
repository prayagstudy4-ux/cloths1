"use client"

import { NAV_GROUPS } from "@/lib/constants"
import { useApp } from "@/lib/client/store"
import { cn } from "@/lib/utils"
import * as Icons from "lucide-react"
import { ChevronsLeft, ChevronsRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

function getIcon(name: string, className: string) {
  const Icon = (Icons as any)[name] ?? Icons.Circle
  return <Icon className={className} />
}

export function Sidebar() {
  const { activeModule, setActiveModule, sidebarCollapsed, toggleSidebar, modules, user } = useApp()
  const isOwner = user?.role === "OWNER"

  return (
    <TooltipProvider delayDuration={0}>
      <nav
        className={cn(
          "flex shrink-0 flex-col border-r bg-zinc-900 text-zinc-300 transition-all duration-200",
          sidebarCollapsed ? "w-14" : "w-56",
        )}
      >
        <div className="flex-1 overflow-y-auto py-2 thin-scrollbar">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter((item) => isOwner || modules.includes("*") || modules.includes(item.id))
            if (!items.length) return null
            return (
              <div key={group.group} className="mb-1">
                {!sidebarCollapsed && (
                  <p className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                    {group.group}
                  </p>
                )}
                {sidebarCollapsed && <div className="mx-3 my-2 border-t border-zinc-800" />}
                {items.map((item) => {
                  const active = activeModule === item.id
                  const btn = (
                    <button
                      key={item.id}
                      onClick={() => setActiveModule(item.id)}
                      className={cn(
                        "group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100",
                        sidebarCollapsed && "justify-center px-0",
                      )}
                    >
                      {getIcon(item.icon, cn("h-[18px] w-[18px] shrink-0", active ? "text-primary-foreground" : "text-zinc-500 group-hover:text-zinc-300"))}
                      {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  )
                  return sidebarCollapsed ? (
                    <Tooltip key={item.id}>
                      <TooltipTrigger asChild>{btn}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : btn
                })}
              </div>
            )
          })}
        </div>

        <div className="border-t border-zinc-800 p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            className={cn("w-full justify-center text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200", !sidebarCollapsed && "justify-start")}
          >
            {sidebarCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!sidebarCollapsed && <span className="ml-2 text-xs">Collapse (Ctrl+B)</span>}
          </Button>
        </div>
      </nav>
    </TooltipProvider>
  )
}
