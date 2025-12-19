"use client";

import { useTheme } from "next-themes";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";

export function ClerkThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();

  const isDark = resolvedTheme === "dark";

  return (
    <ClerkProvider
      appearance={{
        // Let Clerk's own dark theme handle correct contrasts for all buttons,
        // including \"Continue\" and \"Continue with Google\".
        baseTheme: isDark ? dark : undefined,
        variables: {
          colorPrimary: "hsl(var(--primary))",
          colorBackground: "hsl(var(--background))",
          colorInputBackground: "hsl(var(--background))",
          colorInputText: "hsl(var(--foreground))",
          colorText: "hsl(var(--foreground))",
          colorTextSecondary: "hsl(var(--muted-foreground))",
          borderRadius: "calc(var(--radius) - 2px)",
        },
        elements: {
          rootBox: "bg-background text-foreground",
          card: "bg-card text-card-foreground border border-border",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
