import { Boxes, LayoutDashboard, ListTree, Route, Scale, ShieldCheck, UserRoundCheck, Wallet, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: "approvals";
}

/** Primary product surfaces first; operational and configuration areas grouped below. */
export const NAV: { group: string | null; items: NavItem[] }[] = [
  {
    group: null,
    items: [
      { href: "/", label: "Overview", icon: LayoutDashboard },
      { href: "/route", label: "Route a request", icon: Route },
      { href: "/compare", label: "Compare models", icon: Scale },
    ],
  },
  {
    group: "Operations",
    items: [
      { href: "/requests", label: "Decisions", icon: ListTree },
      { href: "/approvals", label: "Human review", icon: UserRoundCheck, count: "approvals" },
      { href: "/budget", label: "Budget Guard", icon: Wallet },
    ],
  },
  {
    group: "Governance",
    items: [
      { href: "/governance", label: "Policies", icon: ShieldCheck },
      { href: "/models", label: "Models", icon: Boxes },
    ],
  },
];

export const NAV_ITEMS = NAV.flatMap((g) => g.items);

/** Bottom tabs on small screens; everything else lives under "More". */
export const TAB_HREFS = ["/", "/route", "/compare"];

export function isActive(pathname: string | null, href: string): boolean {
  if (pathname === null) return false;
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
