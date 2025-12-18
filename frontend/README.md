# TEF Simulator Frontend

Next.js frontend with shadcn/ui components for the TEF Canada Oral Exam Simulator.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Run development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

## Tech Stack

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI components
- **XState** - State management

## Project Structure

```
src/
├── app/              # Next.js app directory
│   ├── layout.tsx    # Root layout
│   ├── page.tsx      # Home page
│   └── globals.css   # Global styles
├── components/       # React components
│   ├── ui/          # shadcn/ui components
│   └── ...          # App components
├── services/        # API clients
├── state/           # State management
└── types/           # TypeScript types
```

## Environment Variables

Create a `.env.local` file:

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

