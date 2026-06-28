"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, PlugZap, ShieldCheck, Zap } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import {
  configureProviderApi,
  registerProvider,
  setAuthToken,
  signIn,
  signUp,
  syncProviderChargers,
} from "../../../utils/api";

type ExternalProvider = "redPlug" | "greenPlug" | "bluePlug";

const externalProviders: Array<{
  id: ExternalProvider;
  label: string;
  tone: string;
  description: string;
}> = [
  {
    id: "redPlug",
    label: "redPlug",
    tone: "border-red-200 bg-red-50 text-red-800",
    description: "Standard points API with direct reservation endpoints.",
  },
  {
    id: "greenPlug",
    label: "greenPlug",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    description: "ChargingPoints API with JSON reservation payloads.",
  },
  {
    id: "bluePlug",
    label: "bluePlug",
    tone: "border-sky-200 bg-sky-50 text-sky-800",
    description: "Location API with status and hold operations.",
  },
];

export default function ProviderSignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    providerName: "",
    legalName: "",
    contactEmail: "",
    contactPhone: "",
    country: "GR",
    apiKey: "",
  });
  const [externalProvider, setExternalProvider] = useState<ExternalProvider>("redPlug");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);

  const updateField = (field: keyof typeof formData, value: string) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSyncWarning(null);

    if (formData.password !== formData.confirmPassword) {
      setErrorMessage("Passwords do not match");
      return;
    }

    if (!acceptTerms) {
      setErrorMessage("Please accept the terms and conditions");
      return;
    }

    setIsSubmitting(true);

    try {
      // Step 1: create account — tolerate "already exists" so retries are safe.
      try {
        await signUp({
          email: formData.email,
          password: formData.password,
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone,
          role: "PROVIDER_ADMIN",
        });
      } catch (signUpErr) {
        const msg = signUpErr instanceof Error ? signUpErr.message : "";
        if (!/already|exist|conflict|409/i.test(msg)) {
          throw signUpErr;
        }
        // User already exists — fall through and sign in instead.
      }

      const { token } = await signIn({ email: formData.email, password: formData.password });
      if (!token) {
        throw new Error("Authentication succeeded but token is missing.");
      }
      setAuthToken(token, false);

      // Step 2: register provider — backend is idempotent (returns existing on retry).
      await registerProvider({
        name: formData.providerName,
        legalName: formData.legalName || undefined,
        contactEmail: formData.contactEmail || formData.email,
        contactPhone: formData.contactPhone || formData.phone || undefined,
        country: formData.country || undefined,
      });

      // Step 3: configure external API — soft-fail (can be done later from dashboard).
      try {
        await configureProviderApi({
          externalProvider,
          apiKey: formData.apiKey.trim() || undefined,
          enabled: true,
        });
      } catch (configErr) {
        setSyncWarning(
          configErr instanceof Error
            ? `API config pending: ${configErr.message}. You can configure it from the dashboard.`
            : "API config could not be saved. You can configure it from the dashboard.",
        );
      }

      try {
        await syncProviderChargers();
      } catch (syncError) {
        setSyncWarning(syncError instanceof Error ? syncError.message : "Initial sync could not finish.");
      }

      router.push("/provider");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create provider account.";
      setErrorMessage(message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-full overflow-y-auto bg-gray-50 px-4 py-8">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-900">
            <Zap className="h-8 w-8 text-white" />
          </div>
          <h1 className="mb-2 text-2xl text-gray-900 sm:text-3xl">Provider onboarding</h1>
          <p className="text-sm text-gray-500">Create your SaaS provider workspace</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="rounded-lg border border-gray-200 bg-white p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-7">
              {errorMessage ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" aria-live="polite">
                  {errorMessage}
                </div>
              ) : null}
              {syncWarning ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" aria-live="polite">
                  {syncWarning}
                </div>
              ) : null}

              <section className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                  <ShieldCheck className="h-4 w-4" />
                  Account
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" className="mt-1" value={formData.firstName} onChange={(e) => updateField("firstName", e.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" className="mt-1" value={formData.lastName} onChange={(e) => updateField("lastName", e.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="email">Email Address</Label>
                    <Input id="email" type="email" className="mt-1" value={formData.email} onChange={(e) => updateField("email", e.target.value)} autoComplete="email" required />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input id="phone" type="tel" className="mt-1" value={formData.phone} onChange={(e) => updateField("phone", e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="password">Password</Label>
                    <Input id="password" type="password" className="mt-1" value={formData.password} onChange={(e) => updateField("password", e.target.value)} autoComplete="new-password" minLength={8} required />
                    <p className="mt-1 text-xs text-gray-500">Minimum 8 characters</p>
                  </div>
                  <div>
                    <Label htmlFor="confirmPassword">Confirm Password</Label>
                    <Input id="confirmPassword" type="password" className="mt-1" value={formData.confirmPassword} onChange={(e) => updateField("confirmPassword", e.target.value)} autoComplete="new-password" required />
                  </div>
                </div>
              </section>

              <section className="space-y-4 border-t border-gray-200 pt-6">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                  <Building2 className="h-4 w-4" />
                  Provider
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="providerName">Provider Name</Label>
                    <Input id="providerName" className="mt-1" value={formData.providerName} onChange={(e) => updateField("providerName", e.target.value)} placeholder="Acme Charge" required />
                  </div>
                  <div>
                    <Label htmlFor="legalName">Legal Name</Label>
                    <Input id="legalName" className="mt-1" value={formData.legalName} onChange={(e) => updateField("legalName", e.target.value)} placeholder="Acme Charge S.A." />
                  </div>
                  <div>
                    <Label htmlFor="contactEmail">Contact Email</Label>
                    <Input id="contactEmail" type="email" className="mt-1" value={formData.contactEmail} onChange={(e) => updateField("contactEmail", e.target.value)} placeholder={formData.email || "billing@example.com"} />
                  </div>
                  <div>
                    <Label htmlFor="contactPhone">Contact Phone</Label>
                    <Input id="contactPhone" type="tel" className="mt-1" value={formData.contactPhone} onChange={(e) => updateField("contactPhone", e.target.value)} placeholder={formData.phone || "+302100000000"} />
                  </div>
                  <div>
                    <Label htmlFor="country">Country</Label>
                    <Input id="country" className="mt-1" value={formData.country} onChange={(e) => updateField("country", e.target.value)} required />
                  </div>
                </div>
              </section>

              <section className="space-y-4 border-t border-gray-200 pt-6">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                  <PlugZap className="h-4 w-4" />
                  External API
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {externalProviders.map((provider) => {
                    const selected = externalProvider === provider.id;
                    return (
                      <button
                        key={provider.id}
                        type="button"
                        onClick={() => setExternalProvider(provider.id)}
                        className={`rounded-lg border p-4 text-left transition ${
                          selected
                            ? "border-gray-950 bg-gray-950 text-white shadow-sm"
                            : "border-gray-200 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"
                        }`}
                      >
                        <span className={`mb-3 inline-flex rounded-full border px-2 py-1 text-xs font-medium ${selected ? "border-white/25 bg-white/10 text-white" : provider.tone}`}>
                          {provider.label}
                        </span>
                        <span className={`block text-xs leading-5 ${selected ? "text-gray-200" : "text-gray-500"}`}>
                          {provider.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div>
                  <Label htmlFor="apiKey">API Key</Label>
                  <Input id="apiKey" className="mt-1" value={formData.apiKey} onChange={(e) => updateField("apiKey", e.target.value)} placeholder="Use default team key" />
                </div>
              </section>

              <div className="flex items-start gap-2 border-t border-gray-200 pt-6">
                <input
                  type="checkbox"
                  id="terms"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300"
                  required
                />
                <label htmlFor="terms" className="text-sm text-gray-700">
                  I agree to the{" "}
                  <Link href="/terms" className="font-medium text-gray-900 hover:underline">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="font-medium text-gray-900 hover:underline">
                    Privacy Policy
                  </Link>
                </label>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button type="submit" className="flex-1" disabled={isSubmitting}>
                  {isSubmitting ? "Creating provider workspace..." : "Create provider workspace"}
                </Button>
                <Button asChild variant="outline">
                  <Link href="/signin">Sign in</Link>
                </Button>
              </div>
            </form>
          </div>

          <aside className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="mb-5 flex items-center gap-2 text-sm font-medium text-gray-900">
              <CheckCircle2 className="h-4 w-4" />
              Onboarding creates
            </div>
            <div className="space-y-4 text-sm text-gray-600">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <p className="font-medium text-gray-900">Provider admin account</p>
                <p className="mt-1">Your first provider user is linked as the workspace owner.</p>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <p className="font-medium text-gray-900">Provider workspace</p>
                <p className="mt-1">The company profile is available in provider, billing, integration, and analytics services.</p>
              </div>
              <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                <p className="font-medium text-gray-900">External API connection</p>
                <p className="mt-1">The selected provider API is saved and an initial charger sync is attempted.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
