import Image from "next/image";

export function SiteBrand({ variant = "navigation" }: { readonly variant?: "navigation" | "print" }) {
  const size = variant === "print" ? 18 : 31;
  return <span className={`site-brand site-brand-${variant}`}>
    <Image alt="MAXCalc logo" className="site-logo" height={size} priority={variant === "navigation"} src="/brand/max-stoich-logo.svg" unoptimized width={size} />
    <span>MAXCalc</span>
  </span>;
}
