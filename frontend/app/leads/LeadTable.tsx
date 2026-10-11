"use client";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Eye,
  Pencil,
  Trash2,
  Plus,
  Users,
  MessageCircle,
  Camera,
  Globe,
  Megaphone,
  PenLine,
  Mail,
  Tag,
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SkeletonTable } from "@/components/SkeletonLoader";
import { cn } from "@/lib/cn";
import { useMasterDataByCategory } from "@/hooks/useMasterData";

interface Props {
  leads: any[];
  loading: boolean;
  total?: number;
  page?: number;
  perPage?: number;
  pages?: number;
  onPageChange?: (page: number) => void;
  onPerPageChange?: (perPage: number) => void;
  onEdit: (lead: any) => void;
  onDelete: (id: number) => void;
  onViewDetails: (id: number) => void;
  onChangeStage?: (leadId: number, newStage: string) => void;
  onAdd?: () => void;
  canWrite?: boolean;
  onSearchCustomer?: (query: string) => void;
}

const STAGE_STYLES: Record<string, { label: string; className: string }> = {
  fresh: { label: "Fresh", className: "bg-teal-50 text-teal-700 border-teal-200" },
  qualified_hot: { label: "Qualified Hot", className: "bg-red-50 text-red-700 border-red-200" },
  qualified_warm: { label: "Qualified Warm", className: "bg-orange-50 text-orange-700 border-orange-200" },
  won: { label: "Won", className: "bg-green-50 text-green-700 border-green-200" },
  lost: { label: "Lost", className: "bg-gray-100 text-gray-600 border-gray-200" },
  not_responding: { label: "Not Responding", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  disqualified: { label: "Disqualified", className: "bg-gray-100 text-gray-600 border-gray-200" },
  future_prospect: { label: "Future Prospect", className: "bg-blue-50 text-blue-700 border-blue-200" },
};

const SOURCE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  whatsapp: MessageCircle,
  instagram: Camera,
  website: Globe,
  referral: Users,
  advertisement: Megaphone,
  manual: PenLine,
  email: Mail,
};

function sourceText(source?: string) {
  if (!source) return "—";
  if (source.toLowerCase() === "whatsapp") return "WhatsApp";
  return source.charAt(0).toUpperCase() + source.slice(1).toLowerCase();
}

const TH = "text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground px-4 py-3";

export default function LeadTable({
  leads,
  loading,
  total,
  page,
  perPage,
  pages,
  onPageChange,
  onPerPageChange,
  onEdit,
  onDelete,
  onViewDetails,
  onChangeStage,
  onAdd,
  canWrite,
  onSearchCustomer,
}: Props) {
  const { data: stagesData } = useMasterDataByCategory("lead_stages");
  const [openDropdown, setOpenDropdown] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  // Pagination state (supports server-side controlled or fallback client-side)
  const [internalPage, setInternalPage] = useState<number>(1);
  const [internalPageSize, setInternalPageSize] = useState<number>(10);

  const isServerPaginated = onPageChange !== undefined;
  const currentPage = page !== undefined ? page : internalPage;
  const pageSize = perPage !== undefined ? perPage : internalPageSize;
  const totalCount = total !== undefined ? total : leads.length;
  const totalPages = pages !== undefined ? pages : (totalCount > 0 ? Math.ceil(totalCount / pageSize) : 1);

  const handlePageChange = (newPage: number) => {
    if (onPageChange) {
      onPageChange(newPage);
    } else {
      setInternalPage(newPage);
    }
  };

  const handlePageSizeChange = (newSize: number) => {
    if (onPerPageChange) {
      onPerPageChange(newSize);
    } else {
      setInternalPageSize(newSize);
      setInternalPage(1);
    }
  };

  useEffect(() => {
    if (!isServerPaginated) {
      setInternalPage(1);
    }
  }, [leads.length, isServerPaginated]);

  function toggleStageMenu(leadId: number) {
    if (openDropdown === leadId) {
      setOpenDropdown(null);
      return;
    }
    const btn = triggerRefs.current[leadId];
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpenDropdown(leadId);
  }

  // The table wrapper scrolls horizontally (overflow-x-auto), which makes
  // browsers silently clip vertical overflow too — close the menu on scroll
  // instead of letting it drift away from its trigger or get cut off.
  useEffect(() => {
    if (openDropdown == null) return;
    const close = () => setOpenDropdown(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [openDropdown]);

  if (loading && leads.length === 0) {
    return (
      <div className="p-4">
        <SkeletonTable rows={5} />
      </div>
    );
  }

  if (!leads.length) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground mb-4">
          <Users className="h-8 w-8" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-1">No leads found</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm">
          Get started by adding your first lead, or adjust your filters to see more results.
        </p>
        {canWrite && onAdd && (
          <Button variant="primary" size="lg" onClick={onAdd}>
            <Plus className="h-4 w-4" /> Add Lead
          </Button>
        )}
      </div>
    );
  }

  const displayLeads = isServerPaginated
    ? leads
    : leads.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Count leads per customer (by phone or email) on the current page to detect duplicates
  const customerCounts = leads.reduce((acc: Record<string, number>, item) => {
    const phone = item.customer?.phone;
    const email = item.customer?.email;
    if (phone) acc[phone] = (acc[phone] || 0) + 1;
    else if (email) acc[email] = (acc[email] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="overflow-x-auto overflow-y-visible">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className={cn(TH, "w-10")}>
              <input type="checkbox" className="rounded border-input" />
            </th>
            <th className={TH}>Lead</th>
            <th className={TH}>Phone</th>
            <th className={TH}>Source</th>
            <th className={TH}>Destination</th>
            <th className={TH}>Stage</th>
            <th className={TH}>Assigned</th>
            <th className={TH}>Added</th>
            <th className={cn(TH, "text-right")}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {displayLeads.map((lead) => {
            const stage = STAGE_STYLES[lead.stage] || { label: lead.stage || "—", className: "bg-gray-100 text-gray-600 border-gray-200" };
            const customer = lead.customer;
            const phone = customer?.phone;
            const email = customer?.email;
            const isDuplicate = (phone && customerCounts[phone] > 1) || (email && customerCounts[email] > 1);
            const SourceIcon = SOURCE_ICONS[lead.source?.toLowerCase()] || Tag;

            return (
              <tr
                key={lead.id}
                className={cn(
                  "border-b border-border last:border-0 transition-colors group hover:bg-muted/40",
                  isDuplicate && "bg-amber-50/40"
                )}
              >
                <td className="px-4 py-3">
                  <input type="checkbox" className="rounded border-input" />
                </td>

                {/* Lead (avatar + name + email) */}
                <td className="px-4 py-3">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onViewDetails(lead.id)}
                    onKeyDown={(e) => e.key === "Enter" && onViewDetails(lead.id)}
                    className="flex items-center gap-3 text-left cursor-pointer"
                  >
                    <Avatar name={customer?.name} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                          {customer?.name || "Unknown"}
                        </span>
                        {isDuplicate && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                            title="This customer has multiple leads on the current page"
                          >
                            <AlertTriangle className="h-3 w-3" /> Dup
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{email || "No email"}</span>
                        {isDuplicate && onSearchCustomer && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSearchCustomer(phone || email || customer?.name || "");
                            }}
                            className="text-primary hover:underline font-medium shrink-0"
                            title="Search all leads for this customer"
                          >
                            Show all
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Phone */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground">{customer?.phone || "—"}</span>
                    {customer?.whatsapp_number && (
                      <a
                        href={`https://wa.me/${customer.whatsapp_number?.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open WhatsApp"
                        onClick={(e) => e.stopPropagation()}
                        className="text-green-600 hover:text-green-700"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </td>

                {/* Source */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 text-foreground" title={lead.source}>
                    <SourceIcon className="h-4 w-4 text-muted-foreground" />
                    {sourceText(lead.source)}
                  </span>
                </td>

                {/* Destination + travel info */}
                <td className="px-4 py-3">
                  <div className="text-foreground font-medium">{lead.destination || "—"}</div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {(lead.num_nights || lead.num_days) && (
                      <span className="text-xs text-muted-foreground font-semibold">
                        {lead.num_nights ? `${lead.num_nights}N` : ""}{lead.num_days ? `${lead.num_days}D` : ""}
                      </span>
                    )}
                    {lead.travel_date && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(lead.travel_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                    )}
                  </div>
                </td>

                {/* Stage */}
                <td className="px-4 py-3 whitespace-nowrap">
                  <button
                    ref={(el) => { triggerRefs.current[lead.id] = el; }}
                    onClick={() => toggleStageMenu(lead.id)}
                    className={cn("font-medium px-3 py-1.5 rounded-md text-sm flex items-center gap-1 hover:shadow-md transition-shadow", stage.className)}
                    title="Click to change stage"
                  >
                    {stage.label}
                    <ChevronDown className="h-3 w-3" />
                  </button>

                  {/* Rendered in a portal so the table's horizontal-scroll
                      wrapper (overflow-x-auto) can't clip it vertically */}
                  {openDropdown === lead.id && menuPos && typeof document !== "undefined" && createPortal(
                    <div
                      className="fixed bg-white border border-border rounded-lg shadow-xl z-[9999] max-h-96 overflow-y-auto"
                      style={{ top: menuPos.top, left: menuPos.left, width: "max-content", minWidth: "14rem" }}
                    >
                      <div className="p-1.5">
                        {stagesData.map((stageOption) => (
                          <button
                            key={stageOption.key}
                            onClick={() => {
                              if (onChangeStage) {
                                onChangeStage(lead.id, stageOption.key);
                              }
                              setOpenDropdown(null);
                            }}
                            className={cn(
                              "w-full text-left px-3 py-2.5 text-sm rounded hover:bg-muted transition-colors whitespace-nowrap",
                              lead.stage === stageOption.key && "bg-primary/10 text-primary font-semibold"
                            )}
                          >
                            {stageOption.label}
                          </button>
                        ))}
                      </div>
                    </div>,
                    document.body
                  )}
                </td>

                {/* Assigned */}
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                  {lead.assigned_to ? `Agent #${lead.assigned_to}` : "Unassigned"}
                </td>

                {/* Added */}
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                  {lead.created_at ? new Date(lead.created_at).toLocaleDateString("en-IN") : "—"}
                </td>

                {/* Actions */}
                <td className="px-4 py-3 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onViewDetails(lead.id)}
                      id={`lead-view-${lead.id}`}
                      title="View details & follow-ups"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {canWrite && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onEdit(lead)}
                          id={`lead-edit-${lead.id}`}
                          title="Edit lead"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onDelete(lead.id)}
                          id={`lead-delete-${lead.id}`}
                          title="Delete lead"
                          className="hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Pagination Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-border text-xs text-muted-foreground bg-muted/20">
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => handlePageSizeChange(Number(e.target.value))}
            className="h-8 px-2 py-1 bg-background border border-input rounded-md font-medium text-foreground focus:outline-none cursor-pointer"
          >
            {[10, 20, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span className="ml-2">
            Showing <span className="font-semibold text-foreground">{totalCount > 0 ? (currentPage - 1) * pageSize + 1 : 0}</span> to{" "}
            <span className="font-semibold text-foreground">{Math.min(currentPage * pageSize, totalCount)}</span> of{" "}
            <span className="font-semibold text-foreground">{totalCount}</span> leads
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(Math.max(currentPage - 1, 1))}
            disabled={currentPage <= 1}
            className="h-8 px-2.5 flex items-center gap-1 text-xs"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>

          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
              let pageNum = i + 1;
              if (totalPages > 5 && currentPage > 3) {
                pageNum = currentPage - 3 + i;
                if (pageNum > totalPages) pageNum = totalPages - (4 - i);
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => handlePageChange(pageNum)}
                  className={`w-8 h-8 rounded-md text-xs font-semibold transition-colors ${
                    currentPage === pageNum
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-foreground"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(Math.min(currentPage + 1, totalPages))}
            disabled={currentPage >= totalPages}
            className="h-8 px-2.5 flex items-center gap-1 text-xs"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
