import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-screen max-w-lg content-center gap-4 px-6 text-center">
      <p className="font-display text-6xl font-extrabold [font-stretch:115%]">404</p>
      <h1 className="text-xl font-semibold">This page doesn&apos;t exist, or you don&apos;t have access to it.</h1>
      <div className="flex justify-center gap-2">
        <Link href="/" className="btn-secondary">Home</Link>
        <Link href="/dashboard" className="btn-primary">Dashboard</Link>
      </div>
    </main>
  );
}
