import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { ModeToggle } from "@/components/mode-toggle";
import { SignInButton } from "@/components/auth/SignInButton";
import { SignUpButton } from "@/components/auth/SignUpButton";
import { UserButton } from "@/components/auth/UserButton";
import { MobileMenu } from "@/components/navbar/MobileMenu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export async function Navbar() {
  const { userId } = await auth();

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        {/* Logo/Branding */}
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">TEF Canada</Badge>
            <Badge variant="outline" className="text-xs">Expression Orale</Badge>
          </div>
          <span className="hidden font-semibold sm:inline-block">Simulateur TEF</span>
        </Link>

        {/* Navigation Links (only for authenticated users, hidden on mobile) */}
        {userId && (
          <div className="hidden items-center gap-1 sm:flex">
            <Button asChild variant="ghost" size="sm">
              <Link href="/">Accueil</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/history">Historique</Link>
            </Button>
          </div>
        )}

        {/* Right side: Mobile menu, Auth buttons or User menu + Theme toggle */}
        <div className="flex items-center gap-2">
          <MobileMenu isAuthenticated={!!userId} />
          {userId ? (
            <div className="hidden sm:block">
              <UserButton />
            </div>
          ) : (
            <div className="hidden sm:flex sm:items-center sm:gap-2">
              <SignInButton />
              <SignUpButton />
            </div>
          )}
          <ModeToggle />
        </div>
      </div>
    </nav>
  );
}

