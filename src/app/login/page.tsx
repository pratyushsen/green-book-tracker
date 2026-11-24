"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

function ConfigMissingNotice() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-300" />
      <div className="text-muted-foreground">
        <p className="font-medium text-red-200">Supabase isn&apos;t configured</p>
        <p className="mt-1">
          Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> to{" "}
          <code>.env.local</code> (see <code>.env.example</code> and the README), then restart the dev server.
        </p>
      </div>
    </div>
  );
}

const CALLBACK_ERRORS: Record<string, string> = {
  auth_callback: "That sign-in or confirmation link is invalid or has expired. Please sign in again or request a new link.",
};

function AuthForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get("error");
    if (code) toast.error(CALLBACK_ERRORS[code] ?? "Sign-in failed. Please try again.");
  }, [params]);

  const redirectTo = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next.startsWith("/") ? next : "/dashboard")}`;

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      return toast.error(
        /email not confirmed/i.test(error.message)
          ? "Please confirm your email first — check your inbox for the confirmation link."
          : error.message,
      );
    }
    toast.success("Signed in");
    window.location.href = next;
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("Use at least 8 characters for your password.");
    setBusy(true);
    const { data, error } = await getSupabaseBrowserClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: redirectTo() },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    if (data.session) {
      toast.success("Account created");
      window.location.href = next;
    } else setSent("Account created. Check your inbox to confirm your email, then sign in.");
  }

  async function magicLink() {
    if (!email) return toast.error("Enter your email first.");
    setBusy(true);
    const { error } = await getSupabaseBrowserClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo() },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setSent("Magic link sent — open it on this device to sign in.");
  }

  if (sent)
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center text-sm">
        <Mail className="size-6 text-primary" />
        <p>{sent}</p>
        <Button variant="link" onClick={() => setSent(null)}>
          Back
        </Button>
      </div>
    );

  const fields = (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
    </>
  );

  return (
    <Tabs defaultValue="signin">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="signin">Sign in</TabsTrigger>
        <TabsTrigger value="signup">Create account</TabsTrigger>
      </TabsList>
      <TabsContent value="signin">
        <form onSubmit={signIn} className="grid gap-4">
          {fields}
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Sign in
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={magicLink}>
            <Mail /> Email me a magic link
          </Button>
        </form>
      </TabsContent>
      <TabsContent value="signup">
        <form onSubmit={signUp} className="grid gap-4">
          {fields}
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="animate-spin" />} Create account
          </Button>
        </form>
      </TabsContent>
    </Tabs>
  );
}

export default function LoginPage() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent)]" />
      <div className="fade-up relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" className="mb-4 size-12" />
          <h1 className="text-xl font-semibold tracking-tight">Green Book Tracker</h1>
          <p className="mt-1 text-sm text-muted-foreground">Finish the book. Ace the interview.</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-xl">
          {isSupabaseConfigured ? (
            <Suspense>
              <AuthForm />
            </Suspense>
          ) : (
            <ConfigMissingNotice />
          )}
        </div>
      </div>
    </div>
  );
}
