"use client";
import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "spotify" | "ghost";

export function Button({
  variant = "primary",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed";
  const styles: Record<Variant, string> = {
    primary: "bg-white text-black hover:bg-zinc-200",
    spotify: "bg-spotify text-black hover:brightness-110",
    ghost: "bg-zinc-800 text-white hover:bg-zinc-700"
  };
  return <button className={`${base} ${styles[variant]} ${className}`} {...rest} />;
}
