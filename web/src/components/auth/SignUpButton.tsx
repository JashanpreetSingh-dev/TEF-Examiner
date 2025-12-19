"use client";

import { SignUpButton as ClerkSignUpButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export function SignUpButton() {
  return (
    <ClerkSignUpButton mode="modal" fallbackRedirectUrl="/">
      <Button size="sm">
        S&apos;inscrire
      </Button>
    </ClerkSignUpButton>
  );
}

