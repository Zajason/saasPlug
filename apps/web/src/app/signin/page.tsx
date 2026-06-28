"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Zap } from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { getHomePathForRole, getRoleFromToken, signIn, googleSignIn, setAuthToken } from "../../utils/api";

export function SignInScreen() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const data = await googleSignIn(credentialResponse.credential);
      setAuthToken(data.token!, rememberMe);
      router.push(getHomePathForRole(getRoleFromToken(data.token!)));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
  
    try {
      const data = await signIn(formData);
      const token = data.token;
  
      // ✅ TS + runtime guard
      if (!token) {
        throw new Error("Authentication succeeded but token is missing.");
      }
  
      setAuthToken(token, rememberMe);
  
      router.push(getHomePathForRole(getRoleFromToken(token)));
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to sign in. Please try again.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };
  

  return (
    <div className="min-h-screen w-full bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-900 rounded-2xl mb-4">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl text-gray-900 mb-2">
            ChargePoint Locator
          </h1>
          <p className="text-sm text-gray-500">Sign in to your account</p>
        </div>

        {/* Sign-in form */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {errorMessage ? (
              <div
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                aria-live="polite"
              >
                {errorMessage}
              </div>
            ) : null}

            <div>
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="you@example.com"
                className="mt-1"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) =>
                  setFormData({ ...formData, password: e.target.value })
                }
                placeholder="Enter your password"
                className="mt-1"
                autoComplete="current-password"
                required
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="remember"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <label htmlFor="remember" className="text-sm text-gray-700 select-none">
                  Remember me
                </label>
              </div>

              <Link
                href="/forgot-password"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Forgot password?
              </Link>
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500 text-center mb-3">Or continue with</p>
            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setErrorMessage("Google sign-in failed.")}
                useOneTap={false}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button asChild variant="outline">
              <Link href="/signup">Create user account</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/signup/provider">Create provider account</Link>
            </Button>
          </div>
        </div>

        {/* Guest Access */}
        <div className="mt-4 text-center">
          <Link href="/" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
            Continue as guest
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return <SignInScreen />;
}
