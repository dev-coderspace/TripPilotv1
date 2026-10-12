"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { PageHeader, PageContainer } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { reportsApi } from "@/lib/api";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  Download,
  Filter,
  RefreshCw,
  Search,
  Calendar,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Sparkles,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  PieChart,
  Table as TableIcon,
  BarChart3,
  Phone,
  MapPin,
  Clock,
  Layers,
} from "lucide-react";

const formatCurrency = (val: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(val || 0);
};

const formatCompactCurrency = (val: number) => {
  if (!val || val === 0) return "₹0";
  if (Math.abs(val) >= 10000000) return `₹${(val / 10000000).toFixed(val % 10000000 === 0 ? 0 : 2)}Cr`;
  if (Math.abs(val) >= 100000) return `₹${(val / 100000).toFixed(val % 100000 === 0 ? 0 : 1)}L`;
  if (Math.abs(val) >= 1000) return `₹${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k`;
  return `₹${Math.round(val)}`;
};

const MONTHS = [
  { value: "all", label: "All Months" },
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const EXPENSE_CATEGORY_COLORS: Record<string, string> = {
  hotel: "bg-indigo-500",
  flight: "bg-sky-500",
  b2b_partner: "bg-purple-500",
  activity: "bg-amber-500",
  visa: "bg-emerald-500",
  insurance: "bg-teal-500",
  other: "bg-slate-400",
};

export default function ProfitLossReportPage() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // Filter States
  const [selectedYear, setSelectedYear] = useState<string>(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [dateBasis, setDateBasis] = useState<string>("created_at");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [destinationFilter, setDestinationFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Tab & UI States
  const [activeTab, setActiveTab] = useState<"table" | "analytics" | "suggestions">("table");
  const [loading, setLoading] = useState<boolean>(true);
  const [reportData, setReportData] = useState<any>(null);

  // Table Sorting & Pagination
  const [sortField, setSortField] = useState<"profit" | "margin" | "revenue" | "expense" | "date" | "customer">("profit");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const loadReport = () => {
    setLoading(true);
    reportsApi
      .profitLossReport({
        year: selectedYear !== "all" ? selectedYear : undefined,
        month: selectedMonth !== "all" ? selectedMonth : undefined,
        date_from: dateFrom ? dateFrom : undefined,
        date_to: dateTo ? dateTo : undefined,
        date_basis: dateBasis,
        status: statusFilter !== "all" ? statusFilter : undefined,
        destination: destinationFilter !== "all" ? destinationFilter : undefined,
        search: searchQuery.trim() ? searchQuery.trim() : undefined,
      })
      .then((res) => {
        setReportData(res);
      })
      .catch((err) => {
        console.error("Failed to load Profit & Loss report:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadReport();
    setCurrentPage(1);
  }, [selectedYear, selectedMonth, dateFrom, dateTo, dateBasis, statusFilter, destinationFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadReport();
    setCurrentPage(1);
  };

  const setPreset = (preset: "this_month" | "last_month" | "this_year" | "all_time") => {
    setDateFrom("");
    setDateTo("");
    if (preset === "this_month") {
      setSelectedYear(String(currentYear));
      setSelectedMonth(String(currentMonth));
    } else if (preset === "last_month") {
      const lm = currentMonth === 1 ? 12 : currentMonth - 1;
      const ly = currentMonth === 1 ? currentYear - 1 : currentYear;
      setSelectedYear(String(ly));
      setSelectedMonth(String(lm));
    } else if (preset === "this_year") {
      setSelectedYear(String(currentYear));
      setSelectedMonth("all");
    } else if (preset === "all_time") {
      setSelectedYear("all");
      setSelectedMonth("all");
    }
  };

  const summary = reportData?.summary || {
    total_revenue: 0,
    total_received: 0,
    total_quoted: 0,
    total_expenses: 0,
    net_profit: 0,
    realized_profit: 0,
    margin_percent: 0,
    total_outstanding: 0,
    total_leads_count: 0,
    profitable_leads_count: 0,
    loss_leads_count: 0,
    breakeven_leads_count: 0,
  };

  const isNetProfitPositive = summary.net_profit >= 0;

  // Process and sort leads
  const sortedLeads = useMemo(() => {
    const leads = [...(reportData?.leads || [])];

    leads.sort((a: any, b: any) => {
      let valA: any = 0;
      let valB: any = 0;

      if (sortField === "profit") {
        valA = a.net_profit;
        valB = b.net_profit;
      } else if (sortField === "margin") {
        valA = a.margin_percent;
        valB = b.margin_percent;
      } else if (sortField === "revenue") {
        valA = a.recognized_income;
        valB = b.recognized_income;
      } else if (sortField === "expense") {
        valA = a.total_expense;
        valB = b.total_expense;
      } else if (sortField === "customer") {
        valA = (a.customer_name || "").toLowerCase();
        valB = (b.customer_name || "").toLowerCase();
        return sortOrder === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else if (sortField === "date") {
        valA = a.created_at ? new Date(a.created_at).getTime() : 0;
        valB = b.created_at ? new Date(b.created_at).getTime() : 0;
      }

      return sortOrder === "asc" ? valA - valB : valB - valA;
    });

    return leads;
  }, [reportData?.leads, sortField, sortOrder]);

  // Paginated leads
  const paginatedLeads = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedLeads.slice(start, start + pageSize);
  }, [sortedLeads, currentPage, pageSize]);

  const totalPages = Math.ceil(sortedLeads.length / pageSize) || 1;

  const handleSort = (field: "profit" | "margin" | "revenue" | "expense" | "date" | "customer") => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const exportCSV = () => {
    if (!reportData?.leads || reportData.leads.length === 0) return;

    const headers = [
      "Lead ID",
      "Customer Name",
      "Phone",
      "Destination",
      "Stage",
      "Travel Date",
      "Quoted Price (INR)",
      "Received (INR)",
      "Expenses (INR)",
      "Net Profit/Loss (INR)",
      "Margin %",
      "Status",
      "Pending Dues (INR)",
    ];

    const rows = reportData.leads.map((l: any) => [
      l.lead_id,
      `"${(l.customer_name || "").replace(/"/g, '""')}"`,
      `"${l.customer_phone || ""}"`,
      `"${(l.destination || "").replace(/"/g, '""')}"`,
      l.stage || "fresh",
      l.travel_date ? l.travel_date.split("T")[0] : "",
      l.quoted_price || 0,
      l.total_received || 0,
      l.total_expense || 0,
      l.net_profit || 0,
      l.margin_percent || 0,
      l.status.toUpperCase(),
      l.customer_outstanding || 0,
    ]);

    const csvContent = [headers.join(","), ...rows.map((e: any[]) => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `profit_loss_report_${selectedYear}_${selectedMonth}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Max value for bar chart normalization
  const maxMonthlyVal = useMemo(() => {
    if (!reportData?.by_month) return 1;
    let maxVal = 0;
    reportData.by_month.forEach((m: any) => {
      maxVal = Math.max(maxVal, m.revenue, m.expenses, Math.abs(m.net_profit));
    });
    return maxVal > 0 ? maxVal : 1;
  }, [reportData?.by_month]);

  const availableYears = reportData?.available_years || [currentYear];
  const availableDestinations = reportData?.available_destinations || [];
  const suggestions = reportData?.suggestions || [];

  return (
    <AppShell title="Profit & Loss Report">
      <PageContainer>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <PageHeader
                title="Profit & Loss Report"
                description="Monitor lead-by-lead profitability, track vendor expenses against revenues, and optimize itinerary margins."
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadReport}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs font-semibold"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={exportCSV}
                disabled={!reportData?.leads?.length}
                className="flex items-center gap-1.5 text-xs font-semibold"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </Button>
            </div>
          </div>

          {/* Quick Filter Presets & Filters Toolbar */}
          <Card className="border-border shadow-sm">
            <CardContent className="p-4 space-y-4">
              {/* Presets */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <Filter className="w-3.5 h-3.5" />
                  Quick Range:
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    onClick={() => setPreset("this_month")}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                      selectedYear === String(currentYear) && selectedMonth === String(currentMonth)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    This Month
                  </button>
                  <button
                    onClick={() => setPreset("last_month")}
                    className="px-2.5 py-1 text-xs rounded-md font-medium bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Last Month
                  </button>
                  <button
                    onClick={() => setPreset("this_year")}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                      selectedYear === String(currentYear) && selectedMonth === "all"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    This Year
                  </button>
                  <button
                    onClick={() => setPreset("all_time")}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                      selectedYear === "all" && selectedMonth === "all"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    All Time
                  </button>
                </div>
              </div>

              {/* Main Filter Dropdowns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* Year */}
                <div>
                  <label htmlFor="pnl-year" className="block text-[11px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
                    Year
                  </label>
                  <select
                    id="pnl-year"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="w-full h-8 px-2.5 bg-background border border-input rounded-md text-xs font-medium focus:ring-1 focus:ring-primary focus:outline-none"
                  >
                    <option value="all">All Years</option>
                    {availableYears.map((yr: number) => (
                      <option key={yr} value={String(yr)}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Month */}
                <div>
                  <label htmlFor="pnl-month" className="block text-[11px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
                    Month
                  </label>
                  <select
                    id="pnl-month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-full h-8 px-2.5 bg-background border border-input rounded-md text-xs font-medium focus:ring-1 focus:ring-primary focus:outline-none"
                  >
                    {MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date Basis */}
                <div>
                  <label htmlFor="pnl-basis" className="block text-[11px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
                    Date Basis
                  </label>
                  <select
                    id="pnl-basis"
                    value={dateBasis}
                    onChange={(e) => setDateBasis(e.target.value)}
                    className="w-full h-8 px-2.5 bg-background border border-input rounded-md text-xs font-medium focus:ring-1 focus:ring-primary focus:outline-none"
                  >
                    <option value="created_at">Inquiry Date</option>
                    <option value="travel_date">Travel Date</option>
                  </select>
                </div>

                {/* Status Filter */}
                <div>
                  <label htmlFor="pnl-status" className="block text-[11px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
                    P&L Status
                  </label>
                  <select
                    id="pnl-status"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full h-8 px-2.5 bg-background border border-input rounded-md text-xs font-medium focus:ring-1 focus:ring-primary focus:outline-none"
                  >
                    <option value="all">All Statuses</option>
                    <option value="profit">🟢 Profitable Only</option>
                    <option value="loss">🔴 Loss-Making Only</option>
                    <option value="breakeven">⚪ Breakeven Only</option>
                  </select>
                </div>

                {/* Destination Filter */}
                <div>
                  <label htmlFor="pnl-destination" className="block text-[11px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
                    Destination
                  </label>
                  <select
                    id="pnl-destination"
                    value={destinationFilter}
                    onChange={(e) => setDestinationFilter(e.target.value)}
                    className="w-full h-8 px-2.5 bg-background border border-input rounded-md text-xs font-medium focus:ring-1 focus:ring-primary focus:outline-none"
                  >
                    <option value="all">All Destinations</option>
                    {availableDestinations.map((d: string) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Custom Date Range */}
                <div>
                  <label className="block text-[11px] font-semibold text-muted-foreground mb-1 uppercase tracking-wider">
                    Custom Date Range
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      title="From Date"
                      className="w-1/2 h-8 px-1.5 bg-background border border-input rounded-md text-[11px] font-medium focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      title="To Date"
                      className="w-1/2 h-8 px-1.5 bg-background border border-input rounded-md text-[11px] font-medium focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Search Bar & Reset */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <form onSubmit={handleSearchSubmit} className="flex-1 w-full max-w-md flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 absolute left-2.5 top-2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search customer, phone, destination, lead #…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full h-8 pl-8 pr-3 text-xs bg-background border border-input rounded-md focus:ring-1 focus:ring-primary focus:outline-none"
                    />
                  </div>
                  <Button type="submit" variant="outline" size="sm" className="h-8 text-xs font-semibold px-3">
                    Search
                  </Button>
                </form>

                <div className="flex items-center gap-2">
                  {(selectedYear !== "all" ||
                    selectedMonth !== "all" ||
                    dateFrom ||
                    dateTo ||
                    statusFilter !== "all" ||
                    destinationFilter !== "all" ||
                    searchQuery) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedYear(String(currentYear));
                        setSelectedMonth("all");
                        setDateFrom("");
                        setDateTo("");
                        setStatusFilter("all");
                        setDestinationFilter("all");
                        setSearchQuery("");
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground h-8"
                    >
                      Clear All Filters
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* KPI Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Total Booked Revenue */}
            <Card className="border-border shadow-sm relative overflow-hidden bg-gradient-to-br from-indigo-500/10 via-background to-background border-indigo-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Booked Revenue</span>
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>
                {loading ? (
                  <Skeleton className="h-7 w-28 my-1" />
                ) : (
                  <div className="text-2xl font-bold text-foreground tracking-tight">
                    {formatCompactCurrency(summary.total_revenue)}
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground mt-1 flex items-center justify-between">
                  <span>Collected: <strong className="text-foreground">{formatCompactCurrency(summary.total_received)}</strong></span>
                  <span>{summary.total_leads_count} leads</span>
                </div>
              </CardContent>
            </Card>

            {/* Total Supplier Expenses */}
            <Card className="border-border shadow-sm relative overflow-hidden bg-gradient-to-br from-rose-500/10 via-background to-background border-rose-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total Expenses</span>
                  <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                    <Receipt className="w-4 h-4" />
                  </div>
                </div>
                {loading ? (
                  <Skeleton className="h-7 w-28 my-1" />
                ) : (
                  <div className="text-2xl font-bold text-foreground tracking-tight">
                    {formatCompactCurrency(summary.total_expenses)}
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground mt-1">
                  Operating & vendor expenses logged
                </div>
              </CardContent>
            </Card>

            {/* Net Profit / Loss */}
            <Card className={`border-border shadow-sm relative overflow-hidden bg-gradient-to-br ${
              isNetProfitPositive
                ? "from-emerald-500/15 via-background to-background border-emerald-500/30"
                : "from-red-500/15 via-background to-background border-red-500/30"
            }`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {isNetProfitPositive ? "Net Profit" : "Net Loss"}
                  </span>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isNetProfitPositive
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-red-500/10 text-red-600 dark:text-red-400"
                  }`}>
                    {isNetProfitPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  </div>
                </div>
                {loading ? (
                  <Skeleton className="h-7 w-28 my-1" />
                ) : (
                  <div className={`text-2xl font-bold tracking-tight ${
                    isNetProfitPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                  }`}>
                    {formatCompactCurrency(summary.net_profit)}
                  </div>
                )}
                <div className="text-[11px] mt-1 flex items-center justify-between">
                  <span className="text-muted-foreground">Margin:</span>
                  <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                    isNetProfitPositive
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
                  }`}>
                    {summary.margin_percent}%
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Outstanding Receivables */}
            <Card className="border-border shadow-sm relative overflow-hidden bg-gradient-to-br from-amber-500/10 via-background to-background border-amber-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pending Receivables</span>
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                </div>
                {loading ? (
                  <Skeleton className="h-7 w-28 my-1" />
                ) : (
                  <div className="text-2xl font-bold text-foreground tracking-tight">
                    {formatCompactCurrency(summary.total_outstanding)}
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground mt-1">
                  Uncollected client balances
                </div>
              </CardContent>
            </Card>

            {/* Profitability Distribution */}
            <Card className="border-border shadow-sm relative overflow-hidden bg-gradient-to-br from-purple-500/10 via-background to-background border-purple-500/20">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lead Health</span>
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                    <PieChart className="w-4 h-4" />
                  </div>
                </div>
                {loading ? (
                  <Skeleton className="h-7 w-28 my-1" />
                ) : (
                  <div className="flex items-center gap-3 my-1">
                    <div className="text-center">
                      <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{summary.profitable_leads_count}</span>
                      <span className="block text-[10px] text-muted-foreground">Profit</span>
                    </div>
                    <div className="text-muted-foreground/30 text-xl font-light">/</div>
                    <div className="text-center">
                      <span className="text-lg font-bold text-red-600 dark:text-red-400">{summary.loss_leads_count}</span>
                      <span className="block text-[10px] text-muted-foreground">Loss</span>
                    </div>
                    <div className="text-muted-foreground/30 text-xl font-light">/</div>
                    <div className="text-center">
                      <span className="text-lg font-bold text-muted-foreground">{summary.breakeven_leads_count}</span>
                      <span className="block text-[10px] text-muted-foreground">Even</span>
                    </div>
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground mt-1">
                  Out of {summary.total_leads_count} analyzed leads
                </div>
              </CardContent>
            </Card>
          </div>

          {/* AI / Smart Financial Suggestions Banner (Always visible & prominent) */}
          {suggestions.length > 0 && (
            <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-primary/[0.02] to-background shadow-sm overflow-hidden">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        Financial Insights & Optimization Suggestions
                        <span className="text-[10px] bg-primary/15 text-primary px-2 py-0.5 rounded-full font-semibold">
                          {suggestions.length} recommendations
                        </span>
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Actionable recommendations generated from your expense trends, lead margins, and receivables.
                      </CardDescription>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActiveTab(activeTab === "suggestions" ? "table" : "suggestions")}
                    className="text-xs font-semibold text-primary hover:underline h-7"
                  >
                    {activeTab === "suggestions" ? "Show Lead Table" : "Expand All Suggestions"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {suggestions.slice(0, activeTab === "suggestions" ? suggestions.length : 3).map((s: any, idx: number) => {
                    const isCritical = s.type === "critical";
                    const isWarning = s.type === "warning";
                    const isOpp = s.type === "opportunity";
                    const isSuccess = s.type === "success";

                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg border text-xs flex flex-col justify-between transition-all ${
                          isCritical
                            ? "bg-red-500/5 border-red-500/20 text-red-950 dark:text-red-200"
                            : isWarning
                            ? "bg-amber-500/5 border-amber-500/20 text-amber-950 dark:text-amber-200"
                            : isOpp
                            ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-950 dark:text-emerald-200"
                            : isSuccess
                            ? "bg-teal-500/5 border-teal-500/20 text-teal-950 dark:text-teal-200"
                            : "bg-muted/40 border-border text-foreground"
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="font-bold flex items-center gap-1.5">
                              {isCritical && <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />}
                              {isWarning && <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                              {isOpp && <Lightbulb className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                              {isSuccess && <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
                              {s.title}
                            </span>
                            {s.metric && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-background/80 shadow-xs shrink-0">
                                {s.metric}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] opacity-90 leading-relaxed mb-2">
                            {s.message}
                          </p>
                        </div>
                        {s.action && (
                          <div className="pt-2 border-t border-border/40 text-[10px] font-medium opacity-80 flex items-start gap-1">
                            <strong className="shrink-0 text-foreground">Action:</strong>
                            <span>{s.action}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* View Mode Tabs */}
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="flex items-center gap-2">
              <Button
                variant={activeTab === "table" ? "primary" : "outline"}
                size="sm"
                onClick={() => setActiveTab("table")}
                className="flex items-center gap-1.5 text-xs font-semibold"
              >
                <TableIcon className="w-3.5 h-3.5" />
                Lead-by-Lead P&L Table ({sortedLeads.length})
              </Button>
              <Button
                variant={activeTab === "analytics" ? "primary" : "outline"}
                size="sm"
                onClick={() => setActiveTab("analytics")}
                className="flex items-center gap-1.5 text-xs font-semibold"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                Analytics & Trend Graphs
              </Button>
              <Button
                variant={activeTab === "suggestions" ? "primary" : "outline"}
                size="sm"
                onClick={() => setActiveTab("suggestions")}
                className="flex items-center gap-1.5 text-xs font-semibold"
              >
                <Sparkles className="w-3.5 h-3.5" />
                All Financial Suggestions ({suggestions.length})
              </Button>
            </div>
            <div className="text-xs text-muted-foreground hidden sm:block">
              {summary.total_leads_count} leads analyzed • Net Margin:{" "}
              <strong className={isNetProfitPositive ? "text-emerald-600" : "text-red-600"}>
                {summary.margin_percent}%
              </strong>
            </div>
          </div>

          {/* TAB 1: DETAILED LEAD TABLE */}
          {activeTab === "table" && (
            <Card className="border-border shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-muted-foreground font-semibold uppercase tracking-wider">
                      <th className="px-4 py-3 text-left">Lead #</th>
                      <th
                        className="px-4 py-3 text-left cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => handleSort("customer")}
                      >
                        <div className="flex items-center gap-1">
                          Customer
                          <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                      <th className="px-4 py-3 text-left">Destination & Stage</th>
                      <th
                        className="px-4 py-3 text-left cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => handleSort("date")}
                      >
                        <div className="flex items-center gap-1">
                          Dates
                          <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                      <th
                        className="px-4 py-3 text-right cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => handleSort("revenue")}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Revenue / Income
                          <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                      <th
                        className="px-4 py-3 text-right cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => handleSort("expense")}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Expenses
                          <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                      <th
                        className="px-4 py-3 text-right cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => handleSort("profit")}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Net Profit / Loss
                          <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                      <th
                        className="px-4 py-3 text-right cursor-pointer hover:text-foreground transition-colors"
                        onClick={() => handleSort("margin")}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Margin %
                          <ArrowUpDown className="w-3 h-3" />
                        </div>
                      </th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Pending Dues</th>
                      <th className="px-4 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {loading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i} className="animate-pulse">
                          <td colSpan={11} className="px-4 py-3">
                            <Skeleton className="h-5 w-full" />
                          </td>
                        </tr>
                      ))
                    ) : paginatedLeads.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="py-12 text-center text-muted-foreground text-sm">
                          No leads matched the selected criteria. Try resetting filters.
                        </td>
                      </tr>
                    ) : (
                      paginatedLeads.map((lead: any) => {
                        const isProfit = lead.net_profit > 0;
                        const isLoss = lead.net_profit < 0;

                        return (
                          <tr
                            key={lead.lead_id}
                            className={`hover:bg-muted/30 transition-colors ${
                              isLoss ? "bg-red-500/[0.03]" : ""
                            }`}
                          >
                            {/* Lead ID */}
                            <td className="px-4 py-3 font-semibold text-foreground">
                              <Link
                                href={`/leads/${lead.lead_id}`}
                                className="text-primary hover:underline font-mono"
                              >
                                #{lead.lead_id}
                              </Link>
                            </td>

                            {/* Customer */}
                            <td className="px-4 py-3">
                              <div className="font-medium text-foreground">{lead.customer_name}</div>
                              {lead.customer_phone && (
                                <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <Phone className="w-2.5 h-2.5" />
                                  {lead.customer_phone}
                                </div>
                              )}
                            </td>

                            {/* Destination & Stage */}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 font-medium text-foreground">
                                <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                                <span className="truncate max-w-[130px]">{lead.destination}</span>
                              </div>
                              <span className="inline-block px-1.5 py-0.5 mt-1 rounded text-[10px] font-semibold bg-muted text-muted-foreground capitalize">
                                {lead.stage.replace(/_/g, " ")}
                              </span>
                            </td>

                            {/* Dates */}
                            <td className="px-4 py-3 text-[11px] text-muted-foreground">
                              {lead.travel_date ? (
                                <div>
                                  <span className="text-[10px] uppercase font-bold text-muted-foreground/70 block">Travel:</span>
                                  <span className="font-medium text-foreground">
                                    {new Date(lead.travel_date).toLocaleDateString("en-IN", {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </span>
                                </div>
                              ) : lead.created_at ? (
                                <div>
                                  <span className="text-[10px] uppercase font-bold text-muted-foreground/70 block">Booked:</span>
                                  <span>
                                    {new Date(lead.created_at).toLocaleDateString("en-IN", {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                  </span>
                                </div>
                              ) : (
                                "—"
                              )}
                            </td>

                            {/* Revenue / Income */}
                            <td className="px-4 py-3 text-right">
                              <div className="font-bold text-foreground">
                                {formatCurrency(lead.recognized_income)}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {lead.total_received > 0 ? (
                                  <span>Rec: {formatCurrency(lead.total_received)}</span>
                                ) : (
                                  <span className="text-amber-600 dark:text-amber-400">Unpaid</span>
                                )}
                              </div>
                            </td>

                            {/* Total Expenses */}
                            <td className="px-4 py-3 text-right">
                              <div className="font-semibold text-rose-600 dark:text-rose-400">
                                {formatCurrency(lead.total_expense)}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {lead.expense_count} {lead.expense_count === 1 ? "expense" : "expenses"}
                              </div>
                            </td>

                            {/* Net Profit / Loss */}
                            <td className="px-4 py-3 text-right font-bold">
                              <span
                                className={`text-sm ${
                                  isProfit
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : isLoss
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {isLoss ? "-" : "+"}
                                {formatCurrency(Math.abs(lead.net_profit))}
                              </span>
                            </td>

                            {/* Margin % */}
                            <td className="px-4 py-3 text-right font-semibold">
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] ${
                                  isProfit
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                    : isLoss
                                    ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                                    : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {lead.margin_percent}%
                              </span>
                            </td>

                            {/* Status */}
                            <td className="px-4 py-3 text-center">
                              <Badge
                                variant={isProfit ? "success" : isLoss ? "destructive" : "secondary"}
                                className="text-[10px] font-bold uppercase tracking-wider"
                              >
                                {lead.status}
                              </Badge>
                            </td>

                            {/* Pending Dues */}
                            <td className="px-4 py-3 text-right font-medium">
                              {lead.customer_outstanding > 0 ? (
                                <span className="text-amber-600 dark:text-amber-400 font-semibold">
                                  {formatCurrency(lead.customer_outstanding)}
                                </span>
                              ) : (
                                <span className="text-emerald-600 dark:text-emerald-400 text-[11px]">Paid Full</span>
                              )}
                            </td>

                            {/* Action Button */}
                            <td className="px-4 py-3 text-center">
                              <Link
                                href={`/leads/${lead.lead_id}`}
                                className="inline-flex items-center justify-center p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                title="Open Lead Details & Workspace"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </Link>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Table Pagination */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-border text-xs text-muted-foreground bg-muted/20">
                <div className="flex items-center gap-2">
                  <span>Rows per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="h-8 px-2 py-1 bg-background border border-input rounded-md font-medium text-foreground focus:outline-none cursor-pointer"
                  >
                    {[10, 20, 50, 100].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                  <span className="ml-2">
                    Showing{" "}
                    <span className="font-semibold text-foreground">
                      {sortedLeads.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}
                    </span>{" "}
                    to{" "}
                    <span className="font-semibold text-foreground">
                      {Math.min(currentPage * pageSize, sortedLeads.length)}
                    </span>{" "}
                    of <span className="font-semibold text-foreground">{sortedLeads.length}</span> leads
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    disabled={currentPage <= 1}
                    className="h-8 px-2.5 flex items-center gap-1 text-xs"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
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
                          onClick={() => setCurrentPage(pageNum)}
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
                    onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                    disabled={currentPage >= totalPages}
                    className="h-8 px-2.5 flex items-center gap-1 text-xs"
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* TAB 2: ANALYTICS & VISUAL CHARTS */}
          {activeTab === "analytics" && (
            <div className="space-y-6">
              {/* Monthly Revenue vs Expense vs Profit Comparison */}
              <Card className="border-border shadow-sm">
                <CardHeader className="p-4 border-b border-border">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <CardTitle className="text-base font-bold flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-primary" />
                        Monthly Revenue, Expenses & Net Profit Trend
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Comparison of recognized income against logged expenses and resultant profit margin by month ({selectedYear === "all" ? "All Recorded Years" : selectedYear}).
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-semibold">
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-indigo-500 inline-block" />
                        <span>Revenue</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-rose-500 inline-block" />
                        <span>Expenses</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-emerald-500 inline-block" />
                        <span>Net Profit</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-6">
                  {loading ? (
                    <div className="h-64 flex items-end justify-between gap-2">
                      {Array.from({ length: 12 }).map((_, i) => (
                        <Skeleton key={i} className="flex-1 h-3/4" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="h-72 flex items-end justify-between gap-1.5 sm:gap-3 border-b border-border pb-2">
                        {reportData?.by_month?.map((m: any) => {
                          const revPct = Math.round((m.revenue / maxMonthlyVal) * 85);
                          const expPct = Math.round((m.expenses / maxMonthlyVal) * 85);
                          const profitPct = Math.round((Math.max(0, m.net_profit) / maxMonthlyVal) * 85);

                          return (
                            <div key={m.month} className="flex-1 flex flex-col items-center h-full justify-end group relative">
                              {/* Hover Tooltip */}
                              <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-full mb-2 bg-popover text-popover-foreground border border-border shadow-lg p-2 rounded-md text-[11px] whitespace-nowrap z-20 pointer-events-none">
                                <div className="font-bold border-b border-border pb-1 mb-1">{m.month_name} ({m.leads_count} leads)</div>
                                <div>Revenue: <strong className="text-indigo-600">{formatCurrency(m.revenue)}</strong></div>
                                <div>Expenses: <strong className="text-rose-600">{formatCurrency(m.expenses)}</strong></div>
                                <div>Net Profit: <strong className={m.net_profit >= 0 ? "text-emerald-600" : "text-red-600"}>{formatCurrency(m.net_profit)}</strong></div>
                                <div>Margin: <strong>{m.margin_percent}%</strong></div>
                              </div>

                              {/* Clustered Bars */}
                              <div className="w-full flex items-end justify-center gap-0.5 sm:gap-1 h-full">
                                {/* Revenue Bar */}
                                <div
                                  style={{ height: `${Math.max(revPct, m.revenue > 0 ? 4 : 1)}%` }}
                                  className="flex-1 max-w-[14px] bg-indigo-500 rounded-t-xs transition-all hover:bg-indigo-600"
                                />
                                {/* Expense Bar */}
                                <div
                                  style={{ height: `${Math.max(expPct, m.expenses > 0 ? 4 : 1)}%` }}
                                  className="flex-1 max-w-[14px] bg-rose-500 rounded-t-xs transition-all hover:bg-rose-600"
                                />
                                {/* Profit Bar */}
                                <div
                                  style={{ height: `${Math.max(profitPct, m.net_profit > 0 ? 4 : 1)}%` }}
                                  className="flex-1 max-w-[14px] bg-emerald-500 rounded-t-xs transition-all hover:bg-emerald-600"
                                />
                              </div>

                              {/* Month Label */}
                              <span className="text-[11px] font-semibold text-muted-foreground mt-2 group-hover:text-foreground">
                                {m.month_name}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Summary Footnote */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center text-xs p-3 bg-muted/20 rounded-lg">
                        <div>
                          <span className="text-muted-foreground block text-[11px]">Total Revenue</span>
                          <strong className="text-indigo-600 dark:text-indigo-400 text-sm">{formatCurrency(summary.total_revenue)}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[11px]">Total Operating Expenses</span>
                          <strong className="text-rose-600 dark:text-rose-400 text-sm">{formatCurrency(summary.total_expenses)}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground block text-[11px]">Net Profit Realized</span>
                          <strong className={`text-sm ${isNetProfitPositive ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                            {formatCurrency(summary.net_profit)} ({summary.margin_percent}%)
                          </strong>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Two Column: Expense Category Distribution & Top Destinations */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Expense Categories Distribution */}
                <Card className="border-border shadow-sm">
                  <CardHeader className="p-4 border-b border-border">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <PieChart className="w-4 h-4 text-rose-500" />
                      Expense Categories Breakdown
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Distribution of all logged supplier expenses across categories.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-8 w-full" />
                      ))
                    ) : !reportData?.by_expense_category || reportData.by_expense_category.length === 0 ? (
                      <div className="py-8 text-center text-muted-foreground text-xs">
                        No itemized expenses recorded in this period.
                      </div>
                    ) : (
                      reportData.by_expense_category.map((cat: any) => (
                        <div key={cat.category} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-foreground flex items-center gap-1.5">
                              <span className={`w-2.5 h-2.5 rounded-full ${EXPENSE_CATEGORY_COLORS[cat.category] || "bg-slate-400"}`} />
                              {cat.label} ({cat.count})
                            </span>
                            <span className="text-muted-foreground font-mono">
                              <strong>{formatCurrency(cat.total_amount)}</strong> ({cat.percentage}%)
                            </span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${EXPENSE_CATEGORY_COLORS[cat.category] || "bg-slate-500"}`}
                              style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                {/* Top Destinations Leaderboard */}
                <Card className="border-border shadow-sm">
                  <CardHeader className="p-4 border-b border-border">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-emerald-500" />
                      Destination Profitability Leaderboard
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Top package destinations ranked by net profit contribution and margin %.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4">
                    {loading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-8 w-full mb-2" />
                      ))
                    ) : !reportData?.by_destination || reportData.by_destination.length === 0 ? (
                      <div className="py-8 text-center text-muted-foreground text-xs">
                        No destination records found.
                      </div>
                    ) : (
                      <div className="divide-y divide-border text-xs">
                        {reportData.by_destination.map((d: any, idx: number) => (
                          <div key={idx} className="py-2.5 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-muted font-bold text-[10px] text-muted-foreground flex items-center justify-center">
                                {idx + 1}
                              </span>
                              <div>
                                <span className="font-semibold text-foreground block">{d.destination}</span>
                                <span className="text-[11px] text-muted-foreground">{d.leads_count} bookings</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className={`font-bold block ${d.net_profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                                {formatCurrency(d.net_profit)}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                Margin: <strong className="text-foreground">{d.margin_percent}%</strong>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* TAB 3: ALL FINANCIAL SUGGESTIONS (Full Screen View) */}
          {activeTab === "suggestions" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-primary" />
                    AI & Business Intelligence Suggestions
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Strategic steps to eliminate leakages, protect package margins, and accelerate receivables collection.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {suggestions.map((s: any, idx: number) => {
                  const isCritical = s.type === "critical";
                  const isWarning = s.type === "warning";
                  const isOpp = s.type === "opportunity";
                  const isSuccess = s.type === "success";

                  return (
                    <Card
                      key={idx}
                      className={`border shadow-sm p-4 ${
                        isCritical
                          ? "border-red-500/30 bg-red-500/[0.04]"
                          : isWarning
                          ? "border-amber-500/30 bg-amber-500/[0.04]"
                          : isOpp
                          ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                          : isSuccess
                          ? "border-teal-500/30 bg-teal-500/[0.04]"
                          : "border-border bg-card"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`p-2 rounded-lg ${
                            isCritical ? "bg-red-500/15 text-red-600" :
                            isWarning ? "bg-amber-500/15 text-amber-600" :
                            isOpp ? "bg-emerald-500/15 text-emerald-600" :
                            "bg-teal-500/15 text-teal-600"
                          }`}>
                            {isCritical && <AlertTriangle className="w-4 h-4" />}
                            {isWarning && <AlertTriangle className="w-4 h-4" />}
                            {isOpp && <Lightbulb className="w-4 h-4" />}
                            {isSuccess && <CheckCircle2 className="w-4 h-4" />}
                          </div>
                          <div>
                            <span className="font-bold text-sm text-foreground block">{s.title}</span>
                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{s.type}</span>
                          </div>
                        </div>
                        {s.metric && (
                          <span className="px-2 py-1 rounded text-xs font-bold bg-background shadow-xs border border-border">
                            {s.metric}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                        {s.message}
                      </p>
                      {s.action && (
                        <div className="p-2.5 rounded bg-background/80 border border-border/60 text-xs">
                          <strong className="text-foreground block mb-0.5">Recommended Action:</strong>
                          <span className="text-muted-foreground">{s.action}</span>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </PageContainer>
    </AppShell>
  );
}
