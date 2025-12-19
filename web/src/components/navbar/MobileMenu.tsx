"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignInButton } from "@/components/auth/SignInButton";
import { SignUpButton } from "@/components/auth/SignUpButton";
import { UserButton } from "@/components/auth/UserButton";

type MobileMenuProps = {
  isAuthenticated: boolean;
};

export function MobileMenu({ isAuthenticated }: MobileMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="sm:hidden"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle menu"
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 sm:hidden"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu */}
          <div className="fixed left-0 top-14 z-50 w-full border-b bg-background sm:hidden">
            <div className="flex flex-col gap-1 p-2">
              {isAuthenticated ? (
                <>
                  <Button asChild variant="ghost" className="justify-start" onClick={() => setIsOpen(false)}>
                    <Link href="/">Accueil</Link>
                  </Button>
                  <Button asChild variant="ghost" className="justify-start" onClick={() => setIsOpen(false)}>
                    <Link href="/history">Historique</Link>
                  </Button>
                  <div className="border-t pt-2 mt-2">
                    <div className="px-2">
                      <UserButton />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="px-2 py-1">
                    <SignInButton />
                  </div>
                  <div className="px-2 py-1">
                    <SignUpButton />
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

