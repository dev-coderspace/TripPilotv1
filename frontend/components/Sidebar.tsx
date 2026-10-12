"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { resolveAssetUrl } from "@/lib/api";
import {
  LayoutDashboard,
  Users,
  Users2,
  Handshake,
  MessageCircle,
  Paintbrush,
  Camera,
  Hotel,
  Wrench,
  Settings,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  LogOut,
  Plane,
  TrendingUp,
} from "lucide-react";

const NAV = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", screen: "dashboard" },
  { icon: Users, label: "Customer Master", href: "/customers", screen: "leads" },
  { icon: Users2, label: "Master Leads", href: "/leads", screen: "leads" },
  { icon: Handshake, label: "B2B Partners", href: "/b2b-partners", screen: "leads" },
  {
    icon: TrendingUp, label: "Reports", href: "/reports", screen: "leads",
    sub: [
      { label: "Payment Report", href: "/reports/payment", screen: "leads" },
      { label: "Profit & Loss", href: "/reports/profit-loss", screen: "leads" },
    ],
  },
  {
    icon: Wrench, label: "Tools", href: "/tools", screen: null,
    sub: [
      { label: "Itinerary Builder", href: "/itinerary", screen: "itinerary" },
      { label: "Hotel Voucher", href: "/vouchers", screen: "vouchers" },
      { label: "Flight Tickets", href: "/flights", screen: "vouchers" },
      { label: "Generate Bill", href: "/invoice", screen: null },
    ],
  },
  {
    icon: Hotel, label: "Inventory", href: "/inventory", screen: "inventory",
    sub: [
      { label: "Hotel Inventory", href: "/inventory?tab=hotels", screen: "inventory" },
      { label: "Activity Inventory", href: "/inventory?tab=activities", screen: "inventory" },
    ],
  },
  { icon: Settings, label: "Settings", href: "/settings", screen: null },
];

export function stageLabel(stage: string) {
  const map: Record<string, { label: string; cls: string }> = {
    fresh: { label: "Fresh Lead", cls: "badge-teal" },
    qualified_hot: { label: "Qualified Hot", cls: "badge-red" },
    qualified_warm: { label: "Qualified Warm", cls: "badge-orange" },
    won: { label: "Won", cls: "badge-green" },
    lost: { label: "Lost", cls: "badge-gray" },
    not_responding: { label: "Not Responding", cls: "badge-yellow" },
    disqualified: { label: "Disqualified", cls: "badge-gray" },
    future_prospect: { label: "Future Prospect", cls: "badge-blue" },
  };
  return map[stage] || { label: stage, cls: "badge-gray" };
}

export function sourceLabel(source: string) {
  const icons: Record<string, string> = {
    whatsapp: "💬", instagram: "📸", website: "🌐",
    referral: "🤝", advertisement: "📢", manual: "✍️", email: "📧",
  };
  return icons[source] || "📌";
}

export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, hasPermission, logout } = useAuth();
  const logoSrc = resolveAssetUrl(user?.logo_url);

  // Auto-open any menu whose sub-item matches the current path
  const [openMenus, setOpenMenus] = useState<string[]>(() =>
    NAV.filter((item) =>
      item.sub?.some((s) => pathname.startsWith(s.href.split("?")[0]))
    ).map((item) => item.label)
  );

  function toggleMenu(label: string) {
    setOpenMenus((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  }

  function canView(item: any): boolean {
    if (!item.screen) return true;
    return hasPermission(item.screen, "read");
  }

  function handleLogout() {
    logout();
    try {
      router.replace("/login");
    } catch {
      window.location.replace("/login");
    }
  }

  return (
    <aside className={`flex flex-col border-r border-border bg-background transition-all duration-200 relative z-20 ${collapsed ? "w-16" : "w-64"}`}>
      {/* Brand Header — shows the agency's own logo once uploaded, falling
          back to the TripPilot mark for agencies that haven't set one */}
      <div className="flex items-center h-16 px-4 border-b border-border">
        {logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoSrc}
            alt={user?.agency_name || "Agency logo"}
            className={collapsed ? "w-8 h-8 object-contain shrink-0" : "h-8 max-w-[168px] object-contain shrink-0"}
          />
        ) : (
          <>
            <div className="flex items-center justify-center w-8 h-8 rounded bg-primary text-primary-foreground font-bold shrink-0 text-xl shadow-sm">P</div>
            {!collapsed && <span className="ml-3 font-bold text-lg tracking-tight text-foreground whitespace-nowrap overflow-hidden">TripPilot</span>}
          </>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1 custom-scrollbar">
        {!collapsed && <div className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Navigation</div>}
        {NAV.map((item) => {
          if (!canView(item)) return null;

          const isActive = item.sub
            ? item.sub.some((s) => pathname.startsWith(s.href.split("?")[0]))
            : pathname.startsWith(item.href) && item.href !== "/";
          const isOpen = openMenus.includes(item.label);
          const visibleSubs = item.sub?.filter(canView) || [];

          return (
            <div key={item.label} className="mb-1">
              <div
                className={`flex items-center px-3 py-2 rounded-md transition-colors group cursor-pointer ${
                  isActive 
                    ? "bg-accent text-accent-foreground font-medium" 
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                } ${collapsed ? "justify-center px-0" : ""}`}
                onClick={() => {
                  if (item.sub && visibleSubs.length > 0) toggleMenu(item.label);
                  else if (!item.sub) router.push(item.href);
                }}
                title={collapsed ? item.label : undefined}
                id={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="ml-3 text-sm whitespace-nowrap overflow-hidden flex-1">{item.label}</span>
                    {visibleSubs.length > 0 && (
                      <ChevronRight className={`w-4 h-4 ml-auto opacity-70 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
                    )}
                  </>
                )}
              </div>
              {visibleSubs.length > 0 && isOpen && !collapsed && (
                <div className="mt-1 ml-9 space-y-1">
                  {visibleSubs.map((sub) => {
                    const isSubActive = pathname + (typeof window !== "undefined" ? window.location.search : "") === sub.href;
                    return (
                      <Link
                        key={sub.href}
                        href={sub.href}
                        className={`block py-1.5 px-3 text-sm transition-colors rounded-md ${
                          isSubActive 
                            ? "text-foreground font-medium bg-muted/50" 
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        }`}
                      >
                        {sub.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        <div className="mt-6 pt-4 border-t border-border">
          <div 
            className={`flex items-center px-3 py-2 rounded-md cursor-pointer text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors ${collapsed ? "justify-center px-0" : ""}`} 
            onClick={handleLogout} 
            title={collapsed ? "Logout" : undefined}
            id="nav-logout"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!collapsed && <span className="ml-3 text-sm font-medium whitespace-nowrap overflow-hidden">Logout</span>}
          </div>
        </div>
      </nav>

      <button 
        className="absolute -right-3 top-20 flex items-center justify-center w-6 h-6 bg-background border border-border text-foreground rounded-full shadow-sm z-30 hover:bg-accent transition-colors"
        onClick={onToggle} 
        id="sidebar-toggle-btn" 
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
      </button>
    </aside>
  );
}
