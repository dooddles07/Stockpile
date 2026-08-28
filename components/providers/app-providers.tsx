"use client";

import { ThemeProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { RoleProvider } from "./role-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import type { Role, User } from "@/lib/types";

export function AppProviders({
  role,
  user,
  children,
}: {
  role: Role;
  user: User;
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <NuqsAdapter>
        <RoleProvider initialRole={role} user={user}>
          <TooltipProvider delay={300} closeDelay={80}>
            {children}
            <Toaster position="bottom-right" closeButton richColors />
          </TooltipProvider>
        </RoleProvider>
      </NuqsAdapter>
    </ThemeProvider>
  );
}
