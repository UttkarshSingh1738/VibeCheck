import { HTMLAttributes } from "react";

export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 ${className}`}
      {...rest}
    />
  );
}
