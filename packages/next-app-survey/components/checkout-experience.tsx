"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  CreditCard,
  LockKeyhole,
  PackageCheck,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useInsightfull } from "@insightfull/web-research-sdk-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const cartItems = [
  {
    name: "Research Sprint Kit",
    description: "Survey prompts and live interview templates",
    quantity: 1,
    price: 149,
  },
  {
    name: "Insight Replay Add-on",
    description: "AI-generated summary workspace",
    quantity: 1,
    price: 79,
  },
  {
    name: "Team Seat",
    description: "One additional collaborator",
    quantity: 2,
    price: 29,
  },
];

const subtotal = cartItems.reduce((total, item) => total + item.price * item.quantity, 0);
const tax = 22.88;
const total = subtotal + tax;

function currency(value: number): string {
  return new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" }).format(value);
}

export function CheckoutExperience({ isConfigured }: { isConfigured: boolean }) {
  const { sdk, isReady } = useInsightfull();
  const [hasTracked, setHasTracked] = useState(false);
  const hasIdentifiedRef = useRef(false);

  useEffect(() => {
    if (!isConfigured || !isReady || !sdk || hasIdentifiedRef.current) {
      return;
    }

    hasIdentifiedRef.current = true;
    sdk.identify("demo-shopper-001", {
      accountType: "recipe-demo",
      cartValue: Number(total.toFixed(2)),
      locale: "en-US",
      planInterest: "team",
    });
  }, [isConfigured, isReady, sdk]);

  const checkoutPayload = useMemo(
    () => ({
      total: Number(total.toFixed(2)),
      currency: "USD",
      itemCount: cartItems.reduce((count, item) => count + item.quantity, 0),
      checkoutType: "demo",
      paymentMethod: "card",
      shippingTier: "instant_access",
    }),
    [],
  );

  const isDisabled = !isConfigured || !isReady || !sdk;

  const handleBuyNow = () => {
    if (isDisabled) {
      return;
    }

    sdk.track("checkout_completed", checkoutPayload);
    setHasTracked(true);
  };

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-4 rounded-2xl border bg-card p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <Badge variant="secondary" className="w-fit gap-1.5">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Next.js survey recipe
            </Badge>
            <div className="space-y-2">
              <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
                Complete checkout and launch a real Insightfull survey
              </h1>
              <p className="max-w-2xl text-muted-foreground">
                This demo uses the workspace React SDK, identifies a demo shopper, tracks
                <code className="mx-1 rounded bg-muted px-1 py-0.5 text-foreground">
                  checkout_completed
                </code>
                , and renders the SDK-provided iframe URL in a shadcn Dialog.
              </p>
            </div>
          </div>
          <div className="rounded-xl border bg-background p-4 text-sm">
            <div className="font-medium">SDK status</div>
            <div className="mt-1 text-muted-foreground">
              {isConfigured
                ? isReady
                  ? "Ready for real survey triggers"
                  : "Initializing SDK…"
                : "Setup required"}
            </div>
          </div>
        </header>

        {!isConfigured ? (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardHeader>
              <CardTitle>Set NEXT_PUBLIC_INSIGHTFULL_CLIENT_ID to run the recipe</CardTitle>
              <CardDescription>
                Copy <code>.env.local.example</code> to <code>.env.local</code>, add your public
                Insightfull client ID, and restart the dev server. The Buy now button is disabled
                until a real client ID is configured.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <section className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Customer details</CardTitle>
                <CardDescription>
                  Mock checkout data sent only as demo traits and event payload.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                {[
                  ["Customer", "Demo Shopper"],
                  ["Company", "Acme Labs"],
                  ["Access", "Instant delivery"],
                ].map(([label, value]) => (
                  <div className="rounded-lg border bg-muted/40 p-4" key={label}>
                    <div className="text-sm text-muted-foreground">{label}</div>
                    <div className="mt-1 font-medium">{value}</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Order summary</CardTitle>
                <CardDescription>
                  A realistic payload for a checkout completion trigger.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {cartItems.map((item) => (
                  <div className="flex items-start justify-between gap-4" key={item.name}>
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-sm text-muted-foreground">{item.description}</div>
                      <div className="mt-1 text-sm text-muted-foreground">Qty {item.quantity}</div>
                    </div>
                    <div className="font-medium tabular-nums">
                      {currency(item.price * item.quantity)}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <aside className="space-y-6">
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle>Payment</CardTitle>
                <CardDescription>Demo card ending in 4242</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-xl border bg-muted/40 p-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg border bg-background p-2">
                      <CreditCard className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="font-medium">Visa •••• 4242</div>
                      <div className="text-sm text-muted-foreground">Expires 12/30</div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="tabular-nums">{currency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Estimated tax</span>
                    <span className="tabular-nums">{currency(tax)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-base font-semibold">
                    <span>Total</span>
                    <span className="tabular-nums">{currency(total)}</span>
                  </div>
                </div>

                <Button className="w-full" disabled={isDisabled} onClick={handleBuyNow} size="lg">
                  <LockKeyhole className="mr-2 h-4 w-4" aria-hidden="true" />
                  Buy now
                </Button>

                {hasTracked ? (
                  <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4" aria-hidden="true" />
                    <p>
                      Tracked <code>checkout_completed</code>. If your Insightfull survey trigger
                      matches, the Dialog opens automatically.
                    </p>
                  </div>
                ) : null}

                <div className="grid gap-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    Real SDK config and ingestion; no mocked API routes.
                  </div>
                  <div className="flex items-center gap-2">
                    <PackageCheck className="h-4 w-4" aria-hidden="true" />
                    Survey iframe URL comes directly from the SDK renderer payload.
                  </div>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}
