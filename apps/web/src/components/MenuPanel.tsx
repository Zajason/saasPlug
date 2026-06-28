"use client";

import { X, User, Car, Receipt, AlertCircle, LogOut, LogIn, MapIcon, Building2, Globe2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AUTH_CHANGED_EVENT, clearAuthToken, getAuthRole, getAuthToken, type UserRole } from "../utils/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";

interface MenuPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MenuPanel({ isOpen, onClose }: MenuPanelProps) {
  const router = useRouter();
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [role, setRole] = useState<UserRole | null>(null);

  const refreshAuthState = useCallback(() => {
    if (typeof window === "undefined") return;
    const token = getAuthToken();
    setIsAuthenticated(Boolean(token));
    setRole(getAuthRole());
  }, []);

  useEffect(() => {
    refreshAuthState();
  }, [refreshAuthState, isOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => refreshAuthState();
    window.addEventListener("storage", handler);
    window.addEventListener(AUTH_CHANGED_EVENT, handler);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener(AUTH_CHANGED_EVENT, handler);
    };
  }, [refreshAuthState]);

  const handleSignOut = () => {
    setShowSignOutDialog(true);
    onClose();
  };

  const confirmSignOut = () => {
    clearAuthToken();
    setIsAuthenticated(false);
    setRole(null);
    setShowSignOutDialog(false);
    router.push("/signin");
  };

  const goTo = (path: string) => {
    router.push(path);
    onClose();
  };

  const authenticatedMenuItems =
    role === "PROVIDER_ADMIN"
      ? [
          { icon: Building2, label: "Provider Console", onClick: () => goTo("/provider") },
          { icon: User, label: "Provider Profile", onClick: () => goTo("/profile") },
          { icon: LogOut, label: "Sign Out", onClick: handleSignOut },
        ]
      : role === "PLATFORM_OPERATOR"
        ? [
            { icon: Globe2, label: "Operator Console", onClick: () => goTo("/operator") },
            { icon: LogOut, label: "Sign Out", onClick: handleSignOut },
          ]
        : [
            { icon: MapIcon, label: "Back to Map", onClick: () => goTo("/") },
            { icon: User, label: "View Profile", onClick: () => goTo("/profile") },
            { icon: Car, label: "View Personal Vehicles", onClick: () => goTo("/vehicles") },
            { icon: Receipt, label: "View Billing and History", onClick: () => goTo("/billing") },
            { icon: AlertCircle, label: "Report a Problem", onClick: () => goTo("/report-problem") },
            { icon: LogOut, label: "Sign Out", onClick: handleSignOut },
          ];

  const menuItems = isAuthenticated
    ? authenticatedMenuItems
    : [
        { icon: MapIcon, label: "Back to Map", onClick: () => goTo("/") },
        { icon: LogIn, label: "Sign In", onClick: () => goTo("/signin") },
      ];

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/30 z-[1001] transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`fixed top-14 left-3 sm:top-16 sm:left-4 lg:top-20 lg:left-6 
          bg-white rounded-lg shadow-2xl z-[1002]
          w-[calc(100vw-24px)] max-w-[320px]
          transition-all duration-300
          ${isOpen ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"}`}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-medium">Menu</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg"
            aria-label="Close menu"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-2">
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={index}
                onClick={item.onClick}
                className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg text-left"
              >
                <Icon className="w-5 h-5 text-gray-600" />
                <span className="text-sm text-gray-700">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sign‑out dialog */}
      <AlertDialog open={showSignOutDialog} onOpenChange={setShowSignOutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
              <AlertDialogTitle>Sign Out</AlertDialogTitle>
            <AlertDialogDescription>
                Are you sure you want to sign out of your account?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmSignOut}>Sign Out</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
