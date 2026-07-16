import Image from "next/image";

export function SiteBrand({ variant = "navigation" }: { readonly variant?: "navigation" | "print" }) {
  const size = variant === "print" ? 18 : 28;
  return <span className={`site-brand site-brand-${variant}`}>
    <Image alt="" aria-hidden="true" className="site-logo" height={size} priority={variant === "navigation"} src="/brand/max-stoich-logo.svg" unoptimized width={size} />
    <span>MAX Stoich</span>
  </span>;
}
