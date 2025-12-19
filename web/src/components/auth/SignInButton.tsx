"use client";

import { SignInButton as ClerkSignInButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export function SignInButton() {
  return (
    <ClerkSignInButton mode="modal" fallbackRedirectUrl="/">
      <Button variant="outline" size="sm">
        Se connecter
      </Button>
    </ClerkSignInButton>
  );
}


