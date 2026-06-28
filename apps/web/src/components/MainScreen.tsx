"use client";
import { Menu, User } from "lucide-react";
import { MapView } from "./MapView";

export function MainScreen() {
  const handleMenu = () => console.log("Open menu");
  const handleProfile = () => console.log("Go to profile page");

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <MapView />




    </div>
  );
}