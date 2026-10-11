"use client";

import { useState, useEffect, useCallback } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { usePlanLimit } from "@/hooks/usePlanLimit";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { PageHeader, PageContainer } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { leadsApi } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/context/AuthContext";
import AddLeadSidePanel from "./AddLeadSidePanel";
import FilterDrawer from "./FilterDrawer";
import LeadTable from "./LeadTable";
import CsvImportModal from "./CsvImportModal";
import { cn } from "@/lib/cn";
import { Filter, Download, Upload, Plus, Sparkles, Phone } from "lucide-react";

export default function LeadsPage() {
  const { showToast } = useToast();
  const { hasPermission } = useAuth();
  const router = useRouter();
  const canWrite = hasPermission("leads", "write");
  const { getStatus, hasWriteAccess } = usePlanLimit();
  const leadsStatus = getStatus("leads");
  const trialExpired = !hasWriteAccess;
  const [leads, setLeads] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const [filters, setFilters] = useState<any>({});
  const [tab, setTab] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [useAiForAdd, setUseAiForAdd] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [editLead, setEditLead] = useState<any>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "today-reminders") {
        const data = await leadsApi.getTodayReminders();
        setLeads(data || []);
        setTotal(data?.length || 0);
        setPages(1);
      } else {
        const params: any = { page, per_page: perPage, ...filters };
        if (debouncedSearch) params.search = debouncedSearch;
        if (tab === "unassigned") {
          params.unassigned = true;
        } else if (tab !== "all") {
          params.stage = tab;
        }
        const data = await leadsApi.list(params);
        setLeads(data.items || []);
        setTotal(data.total || 0);
        setPages(data.pages || 1);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, perPage, debouncedSearch, filters, tab]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  async function handleDelete(id: number) {
    if (!confirm("Are you sure you want to delete this lead?\n\nNote: The associated customer profile will remain saved in your system.")) return;
    try {
      await leadsApi.remove(id);
      showToast({
        type: "success",
        message: "✓ Lead deleted successfully (Customer profile preserved)",
        duration: 3500,
      });
      fetchLeads();
    } catch (err: any) {
      showToast({
        type: "error",
        message: `✕ Failed to delete lead: ${err.message}`,
        duration: 5000,
      });
    }
  }

  async function handleExport() {
    const blob = await leadsApi.exportCsv();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleAIImport() {
    setEditLead(null);
    setUseAiForAdd(true);
    setShowAdd(true);
  }

  async function handleChangeStage(leadId: number, newStage: string) {
    try {
      await leadsApi.update(leadId, { stage: newStage });
      showToast({
        type: "success",
        message: "✓ Lead stage updated successfully",
        duration: 2000,
      });
      fetchLeads();
    } catch (err: any) {
      showToast({
        type: "error",
        message: `✕ Failed to update stage: ${err.message}`,
        duration: 4000,
      });
    }
  }

  const tabs = [
    { id: "today-reminders", label: "Today's Reminders", icon: Phone, count: tab === "today-reminders" ? total : null },
    { id: "all", label: "All Leads", icon: null, count: tab === "all" ? total : null },
    { id: "fresh", label: "Fresh Leads", icon: null, count: tab === "fresh" ? total : null },
    { id: "qualified_hot", label: "Qualified Leads", icon: null, count: tab === "qualified_hot" ? total : null },
    { id: "lost", label: "Lost Leads", icon: null, count: tab === "lost" ? total : null },
    { id: "disqualified", label: "Disqualified", icon: null, count: tab === "disqualified" ? total : null },
    { id: "unassigned", label: "Unassigned Leads", icon: null, count: tab === "unassigned" ? total : null },
  ];

  return (
    <AppShell title="Master Leads">
      <PageContainer>
        <div className="space-y-6">
        <div>
          <PageHeader title="Master Leads" description="Manage and track customer leads" />
          {leadsStatus && (
            <p className="text-sm text-muted-foreground mt-1">
              {leadsStatus.used}/{leadsStatus.limit} leads used
            </p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              id={`leads-tab-${t.id}`}
              onClick={() => {
                if (t.id !== tab) {
                  setLeads([]);
                  setTotal(0);
                }
                setTab(t.id as any);
                setPage(1);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.icon && <t.icon className="h-4 w-4" />}
              {t.label}
              {t.count !== null && (
                loading
                  ? <span className="ml-1 inline-block w-6 h-4 rounded-full bg-muted animate-pulse" />
                  : <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="flex-1 min-w-64">
            <Input
              id="leads-search"
              placeholder="Search name, phone, email…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Buttons */}
          <Button
            id="leads-filter-btn"
            variant="outline"
            size="sm"
            onClick={() => setShowFilter(true)}
          >
            <Filter className="h-4 w-4" /> Filters {Object.keys(filters).length > 0 && `(${Object.keys(filters).length})`}
          </Button>

          <Button
            id="leads-export-btn"
            variant="outline"
            size="sm"
            onClick={handleExport}
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>

          {canWrite && (
            <Button
              id="leads-import-btn"
              variant="outline"
              size="sm"
              onClick={() => setShowCsvImport(true)}
            >
              <Upload className="h-4 w-4" /> Upload CSV
            </Button>
          )}

          {canWrite && (
            <>
              <Button
                id="leads-add-btn"
                variant="primary"
                size="sm"
                disabled={trialExpired || !!(leadsStatus && !leadsStatus.canCreate)}
                title={
                  trialExpired
                    ? "Trial period expired. Please upgrade your plan."
                    : leadsStatus && !leadsStatus.canCreate
                      ? `You've reached the limit of ${leadsStatus.limit} leads`
                      : ""
                }
                onClick={() => {
                  setEditLead(null);
                  setUseAiForAdd(false);
                  setShowAdd(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add Lead
              </Button>
              <Button
                id="leads-ai-btn"
                variant="outline"
                size="sm"
                disabled={trialExpired || !!(leadsStatus && !leadsStatus.canCreate)}
                title={
                  trialExpired
                    ? "Trial period expired. Please upgrade your plan."
                    : leadsStatus && !leadsStatus.canCreate
                      ? `You've reached the limit of ${leadsStatus.limit} leads`
                      : "AI Lead Entry"
                }
                onClick={handleAIImport}
              >
                <Sparkles className="h-4 w-4" /> AI Entry
              </Button>
            </>
          )}
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <LeadTable
              leads={leads}
              loading={loading}
              total={total}
              page={page}
              perPage={perPage}
              pages={pages}
              onPageChange={(p) => setPage(p)}
              onPerPageChange={(s) => {
                setPerPage(s);
                setPage(1);
              }}
              onEdit={(lead) => {
                setEditLead(lead);
                setUseAiForAdd(false);
                setShowAdd(true);
              }}
              onDelete={handleDelete}
              onViewDetails={(id) => router.push(`/leads/${id}`)}
              onChangeStage={handleChangeStage}
              onAdd={() => {
                setEditLead(null);
                setUseAiForAdd(false);
                setShowAdd(true);
              }}
              canWrite={canWrite}
              onSearchCustomer={(query) => {
                setSearch(query);
                setPage(1);
              }}
            />
          </CardContent>
        </Card>
      </div>

      {showAdd && (
        <AddLeadSidePanel
          lead={editLead}
          initialUseAi={useAiForAdd}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            fetchLeads();
          }}
        />
      )}

      {showFilter && (
        <FilterDrawer
          filters={filters}
          onApply={(f) => {
            setFilters(f);
            setShowFilter(false);
            setPage(1);
          }}
          onClose={() => setShowFilter(false)}
        />
      )}

      {showCsvImport && (
        <CsvImportModal
          onClose={() => setShowCsvImport(false)}
          onImported={() => {
            setShowCsvImport(false);
            fetchLeads();
          }}
        />
      )}

    </PageContainer>
    </AppShell>
  );
}
