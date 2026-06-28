"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { MainScreen } from "../components/MainScreen";
import { getAuthRole, getHomePathForRole } from "../utils/api";

export default function HomePage() {
  const router = useRouter();
  const [canShowMap, setCanShowMap] = useState(false);

  useEffect(() => {
    const role = getAuthRole();
    const homePath = getHomePathForRole(role);

    if (homePath !== "/") {
      router.replace(homePath);
      return;
    }

    setCanShowMap(true);
  }, [router]);

  if (!canShowMap) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  return <MainScreen />;
}
