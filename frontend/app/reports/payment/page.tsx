"use client";

import { useState, useEffect, useMemo } from "react";
import AppShell from "@/components/AppShell";
import { PageHeader, PageContainer } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { reportsApi } from "@/lib/api";
import {
  BarChart3,
  Table as TableIcon,
  Download,
  Filter,
  RefreshCw,
  Receipt,
  TrendingUp,
  CreditCard,
  Search,
  Calendar,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
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
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(val % 10000000 === 0 ? 0 : 2)}Cr`;
  if (val >= 100000) return `₹${(val / 100000).toFixed(val % 100000 === 0 ? 0 : 1)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k`;
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

const METHOD_DETAILS: Record<string, { label: string; icon: string; badgeCls: string }> = {
  upi: { label: "UPI", icon: "📱", badgeCls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  bank_transfer: { label: "Bank Transfer", icon: "🏦", badgeCls: "bg-blue-100 text-blue-800 border-blue-200" },
  cash: { label: "Cash", icon: "💵", badgeCls: "bg-green-100 text-green-800 border-green-200" },
  card: { label: "Card", icon: "💳", badgeCls: "bg-purple-100 text-purple-800 border-purple-200" },
  cheque: { label: "Cheque", icon: "📄", badgeCls: "bg-amber-100 text-amber-800 border-amber-200" },
  other: { label: "Other", icon: "📌", badgeCls: "bg-slate-100 text-slate-800 border-slate-200" },
};

export default function PaymentReportPage() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<string>(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [selectedMethod, setSelectedMethod] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"graph" | "table">("graph");

  const [loading, setLoading] = useState<boolean>(true);
  const [reportData, setReportData] = useState<any>(null);

  // Sorting state for table
  const [sortField, setSortField] = useState<"date" | "amount" | "customer">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Pagination state for table
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const loadReport = () => {
    setLoading(true);
    reportsApi
      .paymentReport({
        year: selectedYear !== "all" ? selectedYear : undefined,
        month: selectedMonth !== "all" ? selectedMonth : undefined,
        payment_method: selectedMethod !== "all" ? selectedMethod : undefined,
        payment_type: selectedType !== "all" ? selectedType : undefined,
      })
      .then((res) => {
        setReportData(res);
      })
      .catch((err) => {
        console.error("Failed to load payment report:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadReport();
    setCurrentPage(1);
  }, [selectedYear, selectedMonth, selectedMethod, selectedType]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortField, sortOrder]);

  // Filter & sort payments
  const filteredPayments = useMemo(() => {
    if (!reportData?.payments) return [];
    let list = [...reportData.payments];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.customer_name?.toLowerCase().includes(q) ||
          p.customer_phone?.toLowerCase().includes(q) ||
          p.destination?.toLowerCase().includes(q) ||
          p.reference_number?.toLowerCase().includes(q) ||
          p.notes?.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let valA: any = a[sortField === "customer" ? "customer_name" : sortField === "amount" ? "amount" : "payment_date"];
      let valB: any = b[sortField === "customer" ? "customer_name" : sortField === "amount" ? "amount" : "payment_date"];

      if (sortField === "date") {
        valA = valA ? new Date(valA).getTime() : 0;
        valB = valB ? new Date(valB).getTime() : 0;
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [reportData, searchQuery, sortField, sortOrder]);

  // Pagination slicing
  const totalPages = Math.ceil(filteredPayments.length / pageSize) || 1;
  const paginatedPayments = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredPayments.slice(start, start + pageSize);
  }, [filteredPayments, currentPage, pageSize]);

  const totalFilteredEarnings = useMemo(() => {
    return filteredPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
  }, [filteredPayments]);

  const topChannel = useMemo(() => {
    if (!reportData?.by_method || reportData.by_method.length === 0) return "N/A";
    const sorted = [...reportData.by_method].sort((a, b) => b.total_amount - a.total_amount);
    return sorted[0]?.label || "N/A";
  }, [reportData]);

  const handleExportCSV = () => {
    if (!filteredPayments.length) return;
    const headers = ["Payment ID", "Date", "Customer Name", "Customer Phone", "Destination", "Amount (INR)", "Payment Type", "Payment Method", "Reference No", "Notes", "Created By"];
    const rows = filteredPayments.map((p) => [
      p.id,
      p.payment_date ? new Date(p.payment_date).toLocaleDateString("en-IN") : "",
      `"${(p.customer_name || "").replace(/"/g, '""')}"`,
      `"${p.customer_phone || ""}"`,
      `"${(p.destination || "").replace(/"/g, '""')}"`,
      p.amount,
      p.payment_type,
      p.payment_method,
      `"${(p.reference_number || "").replace(/"/g, '""')}"`,
      `"${(p.notes || "").replace(/"/g, '""')}"`,
      `"${(p.created_by_name || "").replace(/"/g, '""')}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `payment_report_${selectedYear}_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSort = (field: "date" | "amount" | "customer") => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const availableYears = reportData?.available_years || [currentYear];

  const timeData = selectedMonth !== "all" && reportData?.by_day?.length ? reportData.by_day : reportData?.by_month || [];
  const maxTimeAmount = useMemo(() => {
    if (!timeData.length) return 1;
    return Math.max(...timeData.map((d: any) => d.total_amount), 1);
  }, [timeData]);

  return (
    <AppShell title="Payment Report">
      <PageContainer>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
            <div>
              <PageHeader
                title="Payment & Earnings Report"
                description="Comprehensive view of lead payments collected across time, methods, and channels"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={loadReport}
                disabled={loading}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleExportCSV}
                disabled={!filteredPayments.length}
                className="flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
            </div>
          </div>

          {/* Filter Bar */}
          <Card className="bg-card/50 backdrop-blur-sm border shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2 font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                  <Filter className="w-4 h-4" />
                  Filters:
                </div>

                {/* Year Filter */}
                <div className="flex items-center gap-2">
                  <label htmlFor="year-select" className="text-xs font-medium text-muted-foreground">Year:</label>
                  <select
                    id="year-select"
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className="h-9 px-3 py-1 bg-background border border-input rounded-md text-sm font-medium focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="all">All Years</option>
                    {availableYears.map((yr: number) => (
                      <option key={yr} value={String(yr)}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Month Filter */}
                <div className="flex items-center gap-2">
                  <label htmlFor="month-select" className="text-xs font-medium text-muted-foreground">Month:</label>
                  <select
                    id="month-select"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="h-9 px-3 py-1 bg-background border border-input rounded-md text-sm font-medium focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    {MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Payment Method Filter */}
                <div className="flex items-center gap-2">
                  <label htmlFor="method-select" className="text-xs font-medium text-muted-foreground">Method:</label>
                  <select
                    id="method-select"
                    value={selectedMethod}
                    onChange={(e) => setSelectedMethod(e.target.value)}
                    className="h-9 px-3 py-1 bg-background border border-input rounded-md text-sm font-medium focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="all">All Methods</option>
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="cheque">Cheque</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* Payment Type Filter */}
                <div className="flex items-center gap-2">
                  <label htmlFor="type-select" className="text-xs font-medium text-muted-foreground">Type:</label>
                  <select
                    id="type-select"
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="h-9 px-3 py-1 bg-background border border-input rounded-md text-sm font-medium focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="all">All Types</option>
                    <option value="full">Full Payment</option>
                    <option value="partial">Partial Payment</option>
                  </select>
                </div>

                {/* Reset Filters */}
                {(selectedYear !== "all" || selectedMonth !== "all" || selectedMethod !== "all" || selectedType !== "all") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedYear(String(currentYear));
                      setSelectedMonth("all");
                      setSelectedMethod("all");
                      setSelectedType("all");
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground h-9"
                  >
                    Reset Filters
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Earnings */}
            <Card className="relative overflow-hidden bg-gradient-to-br from-emerald-500/10 via-background to-background border-emerald-500/20 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Total Earnings</span>
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center font-bold text-lg">
                    ₹
                  </div>
                </div>
                {loading ? (
                  <Skeleton className="h-9 w-36 mb-1" />
                ) : (
                  <div className="text-3xl font-extrabold text-foreground tracking-tight">
                    {formatCurrency(reportData?.summary?.total_earnings)}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                  Collected from lead payments
                </p>
              </CardContent>
            </Card>

            {/* Total Transactions */}
            <Card className="relative overflow-hidden bg-gradient-to-br from-blue-500/10 via-background to-background border-blue-500/20 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-blue-700 uppercase tracking-wider">Total Transactions</span>
                  <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-600 flex items-center justify-center font-bold">
                    <Receipt className="w-5 h-5" />
                  </div>
                </div>
                {loading ? (
                  <Skeleton className="h-9 w-24 mb-1" />
                ) : (
                  <div className="text-3xl font-extrabold text-foreground tracking-tight">
                    {reportData?.summary?.total_transactions ?? 0}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Payment records processed
                </p>
              </CardContent>
            </Card>

            {/* Average Payment */}
            <Card className="relative overflow-hidden bg-gradient-to-br from-purple-500/10 via-background to-background border-purple-500/20 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-purple-700 uppercase tracking-wider">Avg Payment Size</span>
                  <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-600 flex items-center justify-center font-bold">
                    <CreditCard className="w-5 h-5" />
                  </div>
                </div>
                {loading ? (
                  <Skeleton className="h-9 w-32 mb-1" />
                ) : (
                  <div className="text-3xl font-extrabold text-foreground tracking-tight">
                    {formatCurrency(reportData?.summary?.avg_payment)}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Per successful payment record
                </p>
              </CardContent>
            </Card>

            {/* Top Payment Channel */}
            <Card className="relative overflow-hidden bg-gradient-to-br from-amber-500/10 via-background to-background border-amber-500/20 shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">Top Channel</span>
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center font-bold text-lg">
                    🏆
                  </div>
                </div>
                {loading ? (
                  <Skeleton className="h-9 w-28 mb-1" />
                ) : (
                  <div className="text-2xl font-extrabold text-foreground tracking-tight truncate">
                    {topChannel}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Highest revenue contribution
                </p>
              </CardContent>
            </Card>
          </div>

          {/* View Selection Tabs */}
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2">
              <Button
                variant={activeTab === "graph" ? "primary" : "outline"}
                size="sm"
                onClick={() => setActiveTab("graph")}
                className="flex items-center gap-2 text-xs font-semibold"
              >
                <BarChart3 className="w-4 h-4" />
                Graph View
              </Button>
              <Button
                variant={activeTab === "table" ? "primary" : "outline"}
                size="sm"
                onClick={() => setActiveTab("table")}
                className="flex items-center gap-2 text-xs font-semibold"
              >
                <TableIcon className="w-4 h-4" />
                Table View
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Showing records for: <span className="font-semibold text-foreground">{selectedYear === "all" ? "All Years" : selectedYear}</span>
              {selectedMonth !== "all" && (
                <span>, <span className="font-semibold text-foreground">{MONTHS.find((m) => m.value === selectedMonth)?.label}</span></span>
              )}
            </div>
          </div>

          {/* TAB 1: GRAPH VIEW */}
          {activeTab === "graph" && (
            <div className="space-y-6">
              {/* Earnings Timeline Bar Chart */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base font-bold">
                        <TrendingUp className="w-5 h-5 text-primary" />
                        {selectedMonth !== "all" ? "Daily Earnings Trend" : "Monthly Earnings Trend"}
                      </CardTitle>
                      <CardDescription className="text-xs mt-1">
                        {selectedMonth !== "all"
                          ? `Revenue collected on each day of ${MONTHS.find((m) => m.value === selectedMonth)?.label} ${selectedYear}`
                          : `Revenue collected each month during ${selectedYear === "all" ? "all recorded years" : selectedYear}`}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="h-64 flex items-end justify-between gap-3 pt-8 pb-4 px-4">
                      {Array.from({ length: 12 }).map((_, i) => (
                        <Skeleton key={i} className="flex-1 h-3/4 rounded-t-md" />
                      ))}
                    </div>
                  ) : timeData.length === 0 ? (
                    <div className="py-16 text-center text-muted-foreground text-sm">
                      No payment data available for the selected filters.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="h-72 flex items-end justify-between gap-1.5 md:gap-3 pt-12 pb-2 px-2 border-b">
                        {timeData.map((item: any, idx: number) => {
                          const amt = item.total_amount || 0;
                          const heightPct = maxTimeAmount ? Math.max(Math.round((amt / maxTimeAmount) * 70), amt > 0 ? 6 : 2) : 2;
                          const label = item.month_name || item.label || item.day;
                          const txCount = typeof item.transaction_count === "number"
                            ? item.transaction_count
                            : (selectedMonth !== "all"
                                ? (reportData?.payments || []).filter((p: any) => {
                                    const d = p.payment_date ? new Date(p.payment_date) : null;
                                    return d && d.getDate() === item.day;
                                  }).length
                                : (reportData?.payments || []).filter((p: any) => {
                                    const d = p.payment_date ? new Date(p.payment_date) : null;
                                    return d && d.getMonth() + 1 === item.month;
                                  }).length
                              );

                          return (
                            <div
                              key={idx}
                              className="flex-1 flex flex-col items-center h-full justify-end group relative"
                            >
                              {/* Hover Tooltip */}
                              <div className="absolute -top-16 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 group-hover:-translate-y-1 transition-all duration-200 bg-popover text-popover-foreground text-xs p-2.5 rounded-lg shadow-xl border pointer-events-none whitespace-nowrap z-30 flex flex-col items-center gap-0.5 min-w-[120px]">
                                <span className="font-bold text-xs text-foreground">
                                  {item.month_name
                                    ? `${item.month_name} ${selectedYear === "all" ? "" : selectedYear}`
                                    : (item.label || `Day ${item.day}`)}
                                </span>
                                <span className="font-extrabold text-primary text-sm">
                                  {formatCurrency(amt)}
                                </span>
                                <span className="text-[11px] text-muted-foreground font-medium flex items-center gap-1 mt-0.5">
                                  <span>🧾</span>
                                  <span className="font-semibold text-foreground">{txCount}</span> {txCount === 1 ? "transaction" : "transactions"}
                                </span>
                                {/* Tooltip arrow */}
                                <div className="w-2 h-2 bg-popover border-r border-b border-border rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2" />
                              </div>

                              {/* Sum Amount on top of the bar */}
                              <div className="mb-1.5 text-center select-none w-full flex justify-center">
                                {amt > 0 ? (
                                  <span className="text-[10px] md:text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded shadow-xs transition-all duration-200 group-hover:scale-105">
                                    <span className="hidden md:inline">{formatCurrency(amt)}</span>
                                    <span className="inline md:hidden">{formatCompactCurrency(amt)}</span>
                                  </span>
                                ) : (
                                  <span className="text-[9px] md:text-[10px] text-muted-foreground/40 font-medium">
                                    {selectedMonth !== "all" ? "" : "₹0"}
                                  </span>
                                )}
                              </div>

                              {/* Bar */}
                              <div
                                className={`w-full rounded-t transition-all duration-300 shadow-xs ${
                                  amt > 0
                                    ? "bg-gradient-to-t from-primary/80 to-primary group-hover:from-primary group-hover:to-emerald-500"
                                    : "bg-muted/40 group-hover:bg-muted/60"
                                }`}
                                style={{ height: `${heightPct}%` }}
                              />

                              {/* X-axis: Label and Transaction Count */}
                              <div className="flex flex-col items-center mt-2 w-full text-center">
                                <span className="text-[10px] md:text-xs font-semibold text-foreground truncate w-full">
                                  {label}
                                </span>
                                <span
                                  className={`text-[9px] md:text-[11px] truncate w-full mt-0.5 ${
                                    txCount > 0 ? "text-primary font-bold" : "text-muted-foreground/50 font-medium"
                                  }`}
                                >
                                  <span className="hidden sm:inline">
                                    {txCount} {txCount === 1 ? "txn" : "txns"}
                                  </span>
                                  <span className="inline sm:hidden">
                                    {txCount}
                                  </span>
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground px-2 pt-1">
                        <span>Min: {formatCurrency(0)}</span>
                        <span>Peak Period Earnings: {formatCurrency(maxTimeAmount)}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Distribution Grid: Methods & Payment Types */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Payment Methods Breakdown */}
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <span>💳</span> Payment Methods Distribution
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Revenue split by payment channels
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <div className="space-y-4 py-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <Skeleton key={i} className="h-10 w-full rounded" />
                        ))}
                      </div>
                    ) : !reportData?.by_method || reportData.by_method.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No data available</p>
                    ) : (
                      <div className="space-y-5">
                        {reportData.by_method.map((item: any) => {
                          const meta = METHOD_DETAILS[item.method] || METHOD_DETAILS.other;
                          return (
                            <div key={item.method} className="space-y-1.5">
                              <div className="flex items-center justify-between text-sm">
                                <span className="font-semibold flex items-center gap-2">
                                  <span>{meta.icon}</span>
                                  {meta.label}
                                </span>
                                <div className="text-right">
                                  <span className="font-bold">{formatCurrency(item.total_amount)}</span>
                                  <span className="text-xs text-muted-foreground ml-2">({item.percentage}%)</span>
                                </div>
                              </div>
                              <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary rounded-full transition-all duration-500"
                                  style={{ width: `${item.percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Payment Type Split (Full vs Partial) */}
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <span>⚖️</span> Payment Type Split
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Ratio between Full Payments and Partial Payments
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <div className="space-y-4 py-2">
                        <Skeleton className="h-12 w-full rounded" />
                        <Skeleton className="h-12 w-full rounded" />
                      </div>
                    ) : !reportData?.by_type || reportData.by_type.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No data available</p>
                    ) : (
                      <div className="space-y-6 py-2">
                        {reportData.by_type.map((item: any) => {
                          const isFull = item.type === "full";
                          return (
                            <div
                              key={item.type}
                              className={`p-4 rounded-xl border flex items-center justify-between ${
                                isFull ? "bg-emerald-500/5 border-emerald-500/20" : "bg-blue-500/5 border-blue-500/20"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold ${
                                    isFull ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                                  }`}
                                >
                                  {isFull ? "✅" : "⏳"}
                                </div>
                                <div>
                                  <h4 className="font-bold text-sm">{item.label}</h4>
                                  <p className="text-xs text-muted-foreground">{item.percentage}% of total revenue</p>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-lg font-extrabold text-foreground">
                                  {formatCurrency(item.total_amount)}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* TAB 2: TABLE VIEW */}
          {activeTab === "table" && (
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Receipt className="w-5 h-5 text-primary" />
                      Detailed Payment Records
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      Individual lead payments matching current filters ({filteredPayments.length} records)
                    </CardDescription>
                  </div>

                  {/* Search Bar */}
                  <div className="relative w-full md:w-72">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search customer, ref #, dest..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full h-9 pl-9 pr-3 py-1 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <div className="space-y-3 py-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full rounded" />
                    ))}
                  </div>
                ) : filteredPayments.length === 0 ? (
                  <div className="py-16 text-center text-muted-foreground text-sm">
                    No payment records match your query.
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left border-collapse">
                        <thead>
                          <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            <th className="py-3 px-4 cursor-pointer" onClick={() => handleSort("date")}>
                              <div className="flex items-center gap-1">
                                Date
                                <ArrowUpDown className="w-3 h-3" />
                              </div>
                            </th>
                            <th className="py-3 px-4 cursor-pointer" onClick={() => handleSort("customer")}>
                              <div className="flex items-center gap-1">
                                Customer
                                <ArrowUpDown className="w-3 h-3" />
                              </div>
                            </th>
                            <th className="py-3 px-4">Destination</th>
                            <th className="py-3 px-4 cursor-pointer text-right" onClick={() => handleSort("amount")}>
                              <div className="flex items-center justify-end gap-1">
                                Amount
                                <ArrowUpDown className="w-3 h-3" />
                              </div>
                            </th>
                            <th className="py-3 px-4">Type</th>
                            <th className="py-3 px-4">Method</th>
                            <th className="py-3 px-4">Ref Number</th>
                            <th className="py-3 px-4">Added By</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {paginatedPayments.map((p) => {
                            const meta = METHOD_DETAILS[p.payment_method] || METHOD_DETAILS.other;
                            return (
                              <tr key={p.id} className="hover:bg-muted/50 transition-colors">
                                {/* Date */}
                                <td className="py-3 px-4 font-medium whitespace-nowrap">
                                  {p.payment_date ? (
                                    <div className="flex items-center gap-1.5 text-xs text-foreground">
                                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                                      {new Date(p.payment_date).toLocaleDateString("en-IN", {
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric",
                                      })}
                                    </div>
                                  ) : (
                                    "—"
                                  )}
                                </td>

                                {/* Customer */}
                                <td className="py-3 px-4">
                                  <div className="font-semibold text-foreground">{p.customer_name}</div>
                                  {p.customer_phone && (
                                    <div className="text-xs text-muted-foreground">{p.customer_phone}</div>
                                  )}
                                </td>

                                {/* Destination */}
                                <td className="py-3 px-4 text-xs font-medium">
                                  {p.destination ? (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded bg-muted text-foreground">
                                      ✈️ {p.destination}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>

                                {/* Amount */}
                                <td className="py-3 px-4 text-right font-extrabold text-foreground whitespace-nowrap text-base">
                                  {formatCurrency(p.amount)}
                                </td>

                                {/* Type Badge */}
                                <td className="py-3 px-4 whitespace-nowrap">
                                  <span
                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                      p.payment_type === "full"
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-blue-100 text-blue-800"
                                    }`}
                                  >
                                    {p.payment_type === "full" ? "Full" : "Partial"}
                                  </span>
                                </td>

                                {/* Method Badge */}
                                <td className="py-3 px-4 whitespace-nowrap">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium border ${meta.badgeCls}`}
                                  >
                                    <span>{meta.icon}</span>
                                    {meta.label}
                                  </span>
                                </td>

                                {/* Ref Number */}
                                <td className="py-3 px-4 text-xs text-muted-foreground font-mono">
                                  {p.reference_number || "—"}
                                </td>

                                {/* Creator */}
                                <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                                  {p.created_by_name || "System"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        {/* Summary Table Footer */}
                        <tfoot>
                          <tr className="bg-muted/40 font-bold border-t-2 border-border text-foreground">
                            <td colSpan={3} className="py-3 px-4 text-right">
                              Total Filtered ({filteredPayments.length} payments):
                            </td>
                            <td className="py-3 px-4 text-right text-emerald-600 font-extrabold text-lg">
                              {formatCurrency(totalFilteredEarnings)}
                            </td>
                            <td colSpan={4}></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Pagination Bar */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-border text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <span>Rows per page:</span>
                        <select
                          value={pageSize}
                          onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setCurrentPage(1);
                          }}
                          className="h-8 px-2 py-1 bg-background border border-input rounded-md font-medium text-foreground focus:outline-none"
                        >
                          {[10, 25, 50, 100].map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                          ))}
                        </select>
                        <span className="ml-2">
                          Showing{" "}
                          <span className="font-semibold text-foreground">
                            {filteredPayments.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}
                          </span>{" "}
                          to{" "}
                          <span className="font-semibold text-foreground">
                            {Math.min(currentPage * pageSize, filteredPayments.length)}
                          </span>{" "}
                          of <span className="font-semibold text-foreground">{filteredPayments.length}</span> records
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                          disabled={currentPage === 1}
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
                          onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                          disabled={currentPage === totalPages}
                          className="h-8 px-2.5 flex items-center gap-1 text-xs"
                        >
                          Next
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </PageContainer>
    </AppShell>
  );
}
