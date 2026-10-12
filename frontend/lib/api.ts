const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:9000";

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("trippilot_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Request failed" }));
    const message = typeof err.detail === "string"
      ? err.detail
      : typeof err.detail === "object"
        ? JSON.stringify(err.detail)
        : `HTTP ${res.status}`;
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: (path: string) => request(path, { method: "DELETE" }),
};

// ── Auth / current user ──
export const authApi = {
  me: () => api.get<any>("/auth/me"),
  updateMe: (data: any) => api.put<any>("/auth/me", data),
  listUsers: () => api.get<any[]>("/auth/users"),
  register: (data: any) => api.post<any>("/auth/register", data),
  deleteUser: (id: number) => api.delete(`/auth/users/${id}`),
  createUser: (data: { name: string; email: string; password: string; group_id?: number | null }) =>
    api.post<any>("/auth/register", data),
};

export const orgApi = {
  clearData: () => api.delete("/org/clear-data"),
};

// Turns a relative "/uploads/xxx.png" path from the backend into a full URL
export function resolveAssetUrl(url?: string | null): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined" || trimmed.toLowerCase() === "trippilot") return null;
  return trimmed.startsWith("http") ? trimmed : `${API_URL}${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
}

// ── Uploads ──
export const uploadApi = {
  image: async (file: File): Promise<string> => {
    const form = new FormData();
    form.append("file", file);
    const token = getToken();
    const res = await fetch(`${API_URL}/upload/image`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Upload failed" }));
      throw new Error(typeof err.detail === "string" ? err.detail : "Upload failed");
    }
    const data = await res.json();
    return data.url as string;
  },
};

// ── User Groups ──
export const userGroupsApi = {
  list: () => api.get<any[]>("/user-groups"),
  get: (id: number) => api.get<any>(`/user-groups/${id}`),
  create: (data: any) => api.post<any>("/user-groups", data),
  update: (id: number, data: any) => api.put<any>(`/user-groups/${id}`, data),
  delete: (id: number) => api.delete(`/user-groups/${id}`),
};

// ── Customers ──
export const customersApi = {
  list: (params?: Record<string, string | number | boolean>) => {
    const qs = params ? "?" + new URLSearchParams(params as any).toString() : "";
    return api.get<any>(`/customers${qs}`);
  },
  get: (id: number) => api.get<any>(`/customers/${id}`),
  create: (data: any) => api.post<any>("/customers", data),
  update: (id: number, data: any) => api.put<any>(`/customers/${id}`, data),
  delete: (id: number) => api.delete(`/customers/${id}`),
  workspace: (id: number) => api.get<any>(`/customers/${id}/workspace`),
};

// ── B2B Partners ──
export const b2bPartnersApi = {
  list: (params?: Record<string, string | number | boolean>) => {
    const qs = params ? "?" + new URLSearchParams(params as any).toString() : "";
    return api.get<any>(`/b2b-partners${qs}`);
  },
  get: (id: number) => api.get<any>(`/b2b-partners/${id}`),
  create: (data: any) => api.post<any>("/b2b-partners", data),
  update: (id: number, data: any) => api.put<any>(`/b2b-partners/${id}`, data),
  delete: (id: number) => api.delete(`/b2b-partners/${id}`),
};

// ── Leads ──
export const leadsApi = {
  list: (params?: Record<string, string | number | boolean>) => {
    const qs = params ? "?" + new URLSearchParams(params as any).toString() : "";
    return api.get<any>(`/leads${qs}`);
  },
  get: (id: number) => api.get<any>(`/leads/${id}`),
  workspace: (id: number) => api.get<any>(`/leads/${id}/workspace`),
  activities: (id: number) => api.get<any[]>(`/leads/${id}/activities`),
  addNote: (id: number, data: { title?: string; description: string }) =>
    api.post<any>(`/leads/${id}/activities`, data),
  partners: (id: number) => api.get<any[]>(`/leads/${id}/partners`),
  connectPartner: (id: number, data: { b2b_partner_id: number; role?: string; cost?: number; notes?: string }) =>
    api.post<any>(`/leads/${id}/partners`, data),
  disconnectPartner: (id: number, linkId: number) => api.delete(`/leads/${id}/partners/${linkId}`),
  create: (data: any) => api.post<any>("/leads", data),
  update: (id: number, data: any) => api.put<any>(`/leads/${id}`, data),
  remove: (id: number) => api.delete(`/leads/${id}`),
  delete: (id: number) => api.delete(`/leads/${id}`),
  aiEntry: (text: string) => api.post<any>("/leads/ai", { text }),
  getTodayReminders: () => api.get<any[]>("/leads/today-reminders"),
  exportCsv: () =>
    fetch(`${API_URL}/leads/export/csv`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    }).then((r) => r.blob()),
  importCsv: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return fetch(`${API_URL}/leads/import/csv`, {
      method: "POST",
      headers: { Authorization: `Bearer ${getToken()}` },
      body: form,
    }).then((r) => r.json());
  },
};

// ── Lead Payments ──
export const leadPaymentsApi = {
  list: (leadId: number) => api.get<any>(`/leads/${leadId}/payments`),
  create: (leadId: number, data: any) => api.post<any>(`/leads/${leadId}/payments`, data),
  delete: (leadId: number, paymentId: number) => api.delete(`/leads/${leadId}/payments/${paymentId}`),
};

// ── Lead Expenses & Financials ──
export const leadExpensesApi = {
  getFinancials: (leadId: number) => api.get<any>(`/leads/${leadId}/financials`),
  createExpense: (leadId: number, data: any) => api.post<any>(`/leads/${leadId}/expenses`, data),
  deleteExpense: (leadId: number, expenseId: number) => api.delete(`/leads/${leadId}/expenses/${expenseId}`),
};

// ── Follow-ups ──
export const followupsApi = {
  // Get all follow-ups for a lead
  listForLead: (leadId: number) => api.get<any[]>(`/leads/${leadId}/followups`),
  // Create follow-up
  create: (leadId: number, data: any) => api.post<any>(`/leads/${leadId}/followups`, data),
  // Get single follow-up
  get: (id: number) => api.get<any>(`/followups/${id}`),
  // Update follow-up
  update: (id: number, data: any) => api.put<any>(`/followups/${id}`, data),
  // Delete follow-up
  delete: (id: number) => api.delete(`/followups/${id}`),
  // Get pending follow-ups
  getPending: () => api.get<any[]>("/followups/pending"),
  // Get today's follow-ups
  getToday: () => api.get<any[]>("/followups/today"),
  // Get notifications (overdue + today, with customer name)
  getNotifications: () => api.get<any>("/notifications"),
};

// ── Itinerary ──
export const itineraryApi = {
  list: (params?: Record<string, string | number | boolean>) => {
    const qs = params ? "?" + new URLSearchParams(params as any).toString() : "";
    return api.get<any[]>(`/itinerary${qs}`);
  },
  create: (data: any) => api.post<any>("/itinerary", data),
  get: (id: number) => api.get<any>(`/itinerary/${id}`),
  update: (id: number, data: any) => api.put<any>(`/itinerary/${id}`, data),
  delete: (id: number) => api.delete(`/itinerary/${id}`),
  remove: (id: number) => api.delete(`/itinerary/${id}`),
  generate: (data: { raw_text: string; layout: string; lead_id?: number | null }) =>
    api.post<any>("/itinerary/generate", data),
  chatEdit: (id: number, command: string) =>
    api.post<any>(`/itinerary/${id}/chat-edit`, { command }),
  imageSearch: (query: string, excludeUrl?: string | null) =>
    api.post<{ url: string }>("/itinerary/image-search", { query, exclude_url: excludeUrl || undefined }),
  getPublicByToken: (token: string) => api.get<any>(`/share/${token}`),
  getShareSettings: (id: number) => api.get<any>(`/itinerary/${id}/share-settings`),
  toggleShare: (id: number, enabled: boolean) => api.post<any>(`/itinerary/${id}/share-toggle`, { enabled }),
  regenerateShareToken: (id: number) => api.post<any>(`/itinerary/${id}/share-regenerate`, {}),
};

// ── Vouchers ──
export const vouchersApi = {
  list: (params?: Record<string, string | number | boolean>) => {
    const qs = params ? "?" + new URLSearchParams(params as any).toString() : "";
    return api.get<any>(`/vouchers${qs}`);
  },
  create: (data: any) => api.post<any>("/vouchers", data),
  get: (id: number) => api.get<any>(`/vouchers/${id}`),
  update: (id: number, data: any) => api.put<any>(`/vouchers/${id}`, data),
  delete: (id: number) => api.delete(`/vouchers/${id}`),
  aiEntry: (description: string, opts?: { lead_id?: number; customer_id?: number }) =>
    api.post<any>("/vouchers/ai", { description, ...opts }),
};

// ── Flights ──
export const flightsApi = {
  list: (params?: Record<string, string | number | boolean>) => {
    const qs = params ? "?" + new URLSearchParams(params as any).toString() : "";
    return api.get<any>(`/flights${qs}`);
  },
  create: (data: any) => api.post<any>("/flights", data),
  get: (id: number) => api.get<any>(`/flights/${id}`),
  update: (id: number, data: any) => api.put<any>(`/flights/${id}`, data),
  delete: (id: number) => api.delete(`/flights/${id}`),
};

// ── Dashboard ──
export const dashboardApi = {
  summary: () => api.get<any>("/dashboard/summary"),
  bySource: () => api.get<any[]>("/dashboard/leads-by-source"),
  byStage: () => api.get<any[]>("/dashboard/leads-by-stage"),
  leaderboard: () => api.get<any[]>("/dashboard/leaderboard"),
  aiInsights: () => api.get<any>("/dashboard/ai-insights"),
  activeTours: () => api.get<any[]>("/dashboard/active-tours"),
};

// ── Reports ──
export const reportsApi = {
  paymentReport: (params?: Record<string, string | number | boolean | undefined>) => {
    const cleanParams: Record<string, string> = {};
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "" && v !== "all") {
          cleanParams[k] = String(v);
        }
      });
    }
    const qs = Object.keys(cleanParams).length ? "?" + new URLSearchParams(cleanParams).toString() : "";
    return api.get<any>(`/reports/payment${qs}`);
  },
  profitLossReport: (params?: Record<string, string | number | boolean | undefined>) => {
    const cleanParams: Record<string, string> = {};
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "" && v !== "all") {
          cleanParams[k] = String(v);
        }
      });
    }
    const qs = Object.keys(cleanParams).length ? "?" + new URLSearchParams(cleanParams).toString() : "";
    return api.get<any>(`/reports/profit-loss${qs}`);
  },
};

// ── Inventory ──
export const inventoryApi = {
  hotels: (params?: Record<string, string | number | boolean>) => {
    const qs = params ? "?" + new URLSearchParams(params as any).toString() : "";
    return api.get<any>(`/inventory/hotels${qs}`);
  },
  createHotel: (data: any) => api.post<any>("/inventory/hotels", data),
  updateHotel: (id: number, data: any) => api.put<any>(`/inventory/hotels/${id}`, data),
  deleteHotel: (id: number) => api.delete(`/inventory/hotels/${id}`),
  activities: (params?: Record<string, string | number | boolean>) => {
    const qs = params ? "?" + new URLSearchParams(params as any).toString() : "";
    return api.get<any>(`/inventory/activities${qs}`);
  },
  createActivity: (data: any) => api.post<any>("/inventory/activities", data),
  updateActivity: (id: number, data: any) => api.put<any>(`/inventory/activities/${id}`, data),
  deleteActivity: (id: number) => api.delete(`/inventory/activities/${id}`),
};

// ── Pricing ──
export const pricingApi = {
  usage: () => api.get<any>("/pricing/usage"),
  plans: () => api.get<any[]>("/pricing/plans"),
  subscriptionStatus: () => api.get<any>("/pricing/subscription-status"),
  subscribe: (data: any) => api.post<any>("/pricing/subscriptions", data),
  getCurrentSubscription: () => api.get<any>("/pricing/subscriptions/current"),
  billingHistory: () => api.get<any[]>("/pricing/subscriptions/history"),
  openInvoices: () => api.get<any[]>("/pricing/invoices/current"),
  getPlanBillingCycles: (planId: number) =>
    api.get<any>(`/pricing/plans/${planId}/billing-cycles`),
};

// ── Invoices ──
export const invoicesApi = {
  list: (params?: Record<string, string | number | boolean>) => {
    const qs = params ? "?" + new URLSearchParams(params as any).toString() : "";
    return api.get<any>(`/invoices${qs}`);
  },
  create: (data: any) => api.post<any>("/invoices", data),
  get: (id: number) => api.get<any>(`/invoices/${id}`),
  update: (id: number, data: any) => api.put<any>(`/invoices/${id}`, data),
};

// ── Chats ──
export const chatsApi = {
  getThreads: () => api.get<any[]>("/chats/threads"),
  getHistory: (leadId: number) => api.get<any[]>(`/chats/history/${leadId}`),
  sendMessage: (data: { lead_id: number; channel: string; message_text: string }) =>
    api.post<any>("/chats/send", data),
  getConfig: () => api.get<any>("/chats/config"),
  saveConfig: (data: {
    meta_access_token?: string;
    meta_verify_token?: string;
    whatsapp_phone_number_id?: string;
    instagram_page_id?: string;
  }) => api.post<any>("/chats/config", data),
  toggleAutopilot: (enabled: boolean) =>
    api.post<any>("/chats/autopilot", { enabled }),
};

// ── Lead Costing ──
export const leadCostingApi = {
  get: (leadId: number) => api.get<any>(`/leads/${leadId}/costing`),
  upsert: (leadId: number, data: any) => api.put<any>(`/leads/${leadId}/costing`, data),
};

// ── Master Data ──
export const masterDataApi = {
  getCategories: () => api.get<string[]>("/master-data/categories"),
  list: (category?: string) => {
    const path = category ? `/master-data/${category}` : "/master-data";
    return api.get<any[]>(path);
  },
  getByCategory: (category: string) =>
    api.get<any[]>(`/master-data/${category}`),
  create: (data: any) =>
    api.post<any>("/master-data", data),
  update: (id: number, data: any) =>
    api.put<any>(`/master-data/${id}`, data),
  delete: (id: number) =>
    api.delete(`/master-data/${id}`),
};

export const SuperAdminAPI = {
  getToken: () => typeof window !== "undefined" ? localStorage.getItem("trippilot_token") : null,
  getAllPricingPlans: () => api.get<any[]>("/pricing/plans/all"),
  getAgencies: () => api.get<any[]>("/superadmin/agencies"),
  getPlanBillingCycles: (planId: number) =>
    api.get<any[]>(`/pricing/plans/${planId}/billing-cycles`),
  createBillingCycle: (planId: number, data: any) =>
    api.post<any>(`/pricing/plans/${planId}/billing-cycles`, data),
  updateBillingCycle: (cycleId: number, data: any) =>
    api.put<any>(`/pricing/billing-cycles/${cycleId}`, data),
  deleteBillingCycle: (cycleId: number) =>
    api.delete(`/pricing/billing-cycles/${cycleId}`),
  getMasterDataCategories: () => api.get<string[]>("/master-data/categories"),
  getMasterData: (category: string) =>
    api.get<any[]>(`/master-data/${category}`),
  createMasterData: (data: any) =>
    api.post<any>("/master-data", data),
  updateMasterData: (id: number, data: any) =>
    api.put<any>(`/master-data/${id}`, data),
  deleteMasterData: (id: number) =>
    api.delete(`/master-data/${id}`),
};
