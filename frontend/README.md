# PaunClip Frontend

<p align="center">
  <img src="public/branding/paunclip-banner.png" alt="PaunClip Banner" width="720" />
</p>

This is the real Next.js frontend for the PaunClip website, backed by the FastAPI server in the repo root.

## Getting Started

First, make sure the FastAPI backend is running from the repo root:

```bash
python server.py
```

Then, inside `frontend/`, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

The frontend expects the PaunClip API at `http://127.0.0.1:8000` by default.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Notes

- Use `npm run build` to verify the production bundle.
- Use `npm run start` to serve the built frontend.
- The backend serves output assets and progress/events.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
