import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function gradeColor(grade: string | null | undefined): string {
  switch (grade?.toUpperCase()) {
    case "A": return "text-emerald-600 bg-emerald-50";
    case "B": return "text-green-600 bg-green-50";
    case "C": return "text-yellow-600 bg-yellow-50";
    case "D": return "text-orange-600 bg-orange-50";
    case "F": return "text-red-600 bg-red-50";
    default: return "text-gray-500 bg-gray-50";
  }
}

export function gradeColorSolid(grade: string | null | undefined): string {
  switch (grade?.toUpperCase()) {
    case "A": return "bg-emerald-500 text-white";
    case "B": return "bg-green-500 text-white";
    case "C": return "bg-yellow-500 text-white";
    case "D": return "bg-orange-500 text-white";
    case "F": return "bg-red-500 text-white";
    default: return "bg-gray-400 text-white";
  }
}

export function formatNumber(value: number | null | undefined, decimals = 1): string {
  if (value == null) return "-";
  return value.toFixed(decimals);
}

export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (value == null) return "-";
  return `${(value * 100).toFixed(decimals)}%`;
}
