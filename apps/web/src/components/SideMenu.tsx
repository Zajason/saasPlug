"use client";

import { User, Car, Receipt, AlertCircle, LogOut, Map } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
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

export function SideMenu() {
  const pathname = usePathname();
  const router = useRouter();
  const [showSignOutDialog, setShowSignOutDialog] = useState(false);

  const menuItems = [
    { icon: User, label: "Profile", path: "/profile" },
    { icon: Car, label: "Vehicles", path: "/vehicles" },
    { icon: Receipt, label: "Billing & History", path: "/billing" },
    { icon: AlertCircle, label: "Report Problem", path: "/report-problem" },
  ];

  const handleSignOut = () => setShowSignOutDialog(true);

  const confirmSignOut = () => {
    // TODO: sign‑out logic (clear session, etc.)
    console.log("User signed out");
    setShowSignOutDialog(false);
    router.push("/"); // redirect home
  };

  const handleBackToMap = () => {
    router.push("/"); // main map screen
  };

  return (
    <>
      <div className="w-full h-full bg-white border-l border-gray-200 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Menu</h2>

          {/*  Top-right Back to Map button */}
          <button
            onClick={handleBackToMap}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <Map className="w-4 h-4" />
            <span>Back to Map</span>
          </button>
        </div>

        {/* Navigation items */}
        <nav className="flex-1 p-3">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center gap-3 px-4 py-3 mb-1 rounded-lg transition-colors ${
                  isActive
                    ? "bg-gray-950 text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}

          {/* Sign‑out button */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 mt-3 rounded-lg border border-gray-200 bg-gray-100 text-gray-900 hover:bg-gray-200 transition-colors"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">Sign Out</span>
          </button>
        </nav>
      </div>

      {/* Sign‑out confirmation dialog */}
      <AlertDialog open={showSignOutDialog} onOpenChange={setShowSignOutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign Out</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to sign out of your account?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSignOut}>
              Sign Out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
