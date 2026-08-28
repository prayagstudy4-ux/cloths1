"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/client/api"
import { useApp } from "@/lib/client/store"
import { AppShell } from "@/components/app/AppShell"
import { LoginScreen } from "@/components/app/LoginScreen"
import { SetupWizard } from "@/components/app/SetupWizard"
import { Loader2 } from "lucide-react"

type BootState = "loading" | "setup" | "login" | "ready"

export function AppRoot() {
  const { setUser, setBusiness } = useApp()
  const qc = useQueryClient()

  // Public status first (setup completed?)
  const { data: pub, isLoading: pubLoading } = useQuery({
    queryKey: ["boot", "public"],
    queryFn: () => api.get("public/status"),
  })

  // Session check
  const { data: me, error: meError, refetch: refetchMe } = useQuery({
    queryKey: ["boot", "me"],
    queryFn: () => api.get("auth/me"),
    enabled: !!pub?.setupCompleted,
    retry: false,
  })

  // Derive boot state (no setState-in-effect)
  const bootState: BootState = pubLoading || !pub
    ? "loading"
    : !pub.setupCompleted ? "setup"
    : meError || !me ? "login"
    : "ready"

  useEffect(() => {
    if (bootState === "ready" && me?.user) {
      setUser(me.user, me.modules)
      setBusiness(me.business)
    }
  }, [bootState, me, setUser, setBusiness])

  const state = bootState

  if (state === "loading") {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-2xl font-bold text-primary-foreground">V</div>
        <div className="text-center">
          <p className="font-semibold">Clothing Business Manager</p>
          <p className="mt-1 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Starting…
          </p>
        </div>
      </div>
    )
  }

  if (state === "setup") {
    return (
      <SetupWizard
        onComplete={async () => {
          await qc.invalidateQueries({ queryKey: ["boot"] })
          await refetchMe()
        }}
      />
    )
  }

  if (state === "login") {
    return (
      <LoginScreen
        hasDemo={!!pub?.hasDemo}
        onLoggedIn={async (user, modules) => {
          setUser(user, modules)
          const meData = await refetchMe()
          if (meData.data?.business) setBusiness(meData.data.business)
          qc.clear()
        }}
      />
    )
  }

  return <AppShell />
}
