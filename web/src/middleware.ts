import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

// Run Clerk middleware on all application routes (including `/`),
// while skipping Next.js internals and static asset files.
export const config = {
  matcher: [
    // Match all paths except static files and Next internals
    "/((?!_next|.*\\..*).*)",
  ],
};

