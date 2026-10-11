"use client";
import { useState, useEffect, use } from "react";
import { itineraryApi, resolveAssetUrl } from "@/lib/api";

function getFallbackImage(url: string, seed: string = ""): string {
  if (!url) return "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1200&q=80";
  if (!url.includes("loremflickr.com")) return url;

  const lower = url.toLowerCase();
  if (lower.includes("bali")) {
    return "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80";
  }
  if (lower.includes("hotel") || lower.includes("resort") || lower.includes("stay")) {
    return "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80";
  }
  const placesImages = [
    "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=800&q=80",
    "https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=800&q=80",
  ];
  let hash = 0;
  const str = seed || url;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return placesImages[Math.abs(hash) % placesImages.length];
}

function formatDate(d?: string) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return d;
  }
}

function fmtINR(n: any): string {
  const num = Number(String(n || "").replace(/[^\d.]/g, ""));
  if (!num || Number.isNaN(num)) return "—";
  return "Rs." + num.toLocaleString("en-IN");
}

function groupStaysByOption(stays: any[]) {
  if (!Array.isArray(stays)) return [];
  const groupsMap: Record<string, any[]> = {};
  const order: string[] = [];
  for (let i = 0; i < stays.length; i++) {
    const s = stays[i];
    if (!s || typeof s !== "object") continue;
    const rawOpt = s.option !== undefined && s.option !== null ? String(s.option) : `OPTION ${i + 1}`;
    const key = rawOpt.trim() || `OPTION ${i + 1}`;
    if (!groupsMap[key]) {
      groupsMap[key] = [];
      order.push(key);
    }
    groupsMap[key].push(s);
  }
  return order.map((name) => {
    const hotels = groupsMap[name];
    const costItem = hotels.find((h) => h && h.total_cost !== undefined && h.total_cost !== null && h.total_cost !== "");
    return {
      optionName: name,
      hotels,
      totalCost: costItem ? costItem.total_cost : null,
    };
  });
}

function bulletList(text: any): string[] {
  if (!text) return [];
  if (Array.isArray(text)) return text.map((item) => String(item).trim()).filter(Boolean);
  const str = String(text);
  return str.split(/\r?\n/).map((l) => l.replace(/^[\s\-•*\d.)]+/, "").trim()).filter(Boolean);
}

function isSectionVisible(itin: any, key: string): boolean {
  return itin?.section_visibility?.[key] !== false;
}

export default function PublicShareItineraryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [itin, setItin] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    itineraryApi
      .getPublicByToken(token)
      .then((data) => {
        setItin(data);
      })
      .catch((err: any) => {
        const msg = err.message || "Itinerary not found";
        if (msg.includes("410") || msg.toLowerCase().includes("expired")) {
          setErrorStatus(410);
          setErrorMessage("This itinerary link has expired. Please contact your travel advisor for an updated link.");
        } else {
          setErrorStatus(404);
          setErrorMessage("Itinerary not available or link is invalid.");
        }
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div style={{ background: "#0a0e14", color: "#f0f4f8", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif" }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>✈️</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#00b4d8" }}>Loading Travel Brochure…</div>
      </div>
    );
  }

  if (errorStatus || !itin) {
    return (
      <div style={{ background: "#0a0e14", color: "#f0f4f8", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", fontFamily: "'Inter', sans-serif" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{errorStatus === 410 ? "⌛" : "🗺️"}</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12, color: errorStatus === 410 ? "#d4af37" : "#ef4444" }}>
          {errorStatus === 410 ? "Link Expired" : "Itinerary Unavailable"}
        </h1>
        <p style={{ color: "#a0aec0", maxWidth: 480, fontSize: 15, lineHeight: 1.6 }}>{errorMessage}</p>
      </div>
    );
  }

  const days: any[] = itin.days || [];
  const stays: any[] = itin.stay_options || [];
  const flights = itin.flights || {};

  const agencyName = itin.agency?.name || itin.agency_name || "";
  const agencyLogoSrc = resolveAssetUrl(itin.agency?.logo_url || itin.logo_url);
  const agencyAddress = itin.agency?.office_address || itin.agency_office_address || "";
  const hasAgencyBranding = Boolean(agencyName || agencyLogoSrc);

  const advisor = {
    name: itin.advisor?.name || itin.advisor_name || "",
    email: itin.advisor?.email || itin.advisor_email || "",
    phone: itin.advisor?.phone || itin.advisor_phone || "",
  };
  const inclusionsList = bulletList(itin.inclusions);
  const exclusionsList = bulletList(itin.exclusions);
  const paymentTermsList = bulletList(itin.payment_terms);

  return (
    <div style={{ background: "#0a0e14", color: "#f0f4f8", minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>
      {/* Google Fonts */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px 64px" }} className="dark-share-container">
        {/* ══════ HERO BANNER ══════ */}
        <div style={{
          minHeight: "75vh",
          background: itin.cover_image_url
            ? `linear-gradient(rgba(10, 14, 20, 0.4) 0%, rgba(10, 14, 20, 0.95) 100%), url(${getFallbackImage(itin.cover_image_url, itin.title)}) center/cover no-repeat`
            : "linear-gradient(135deg, #0a0e14 0%, #1a222c 50%, #0a0e14 100%)",
          borderRadius: 24, marginBottom: 48, marginTop: 24,
          display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
          textAlign: "center", padding: "64px 32px",
          position: "relative", overflow: "hidden",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 10px 40px rgba(0,0,0,0.6)"
        }}>
          {hasAgencyBranding && (
            <div style={{
              background: "rgba(255, 255, 255, 0.92)", borderRadius: 16, padding: "10px 24px",
              marginBottom: 20, boxShadow: "0 4px 20px rgba(0,0,0,0.4)", display: "flex", alignItems: "center", gap: 10
            }}>
              {agencyLogoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={agencyLogoSrc} alt={agencyName || "Agency Logo"} style={{ height: 40, maxWidth: 180, objectFit: "contain" }} />
              ) : (
                <span style={{ color: "#0a0e14", fontWeight: 800, fontSize: 18, fontFamily: "Outfit, sans-serif" }}>{agencyName}</span>
              )}
            </div>
          )}

          <div style={{ color: "#d4af37", letterSpacing: "3px", textTransform: "uppercase", fontSize: "1.2rem", fontWeight: 600, marginBottom: 12, textShadow: "0 4px 10px rgba(0,0,0,0.5)" }}>
            {itin.destination ? `EXPLORE ${itin.destination.toUpperCase()}` : "TRAVEL ITINERARY"}
          </div>

          <h1 className="dark-hero-title" style={{
            fontFamily: "Outfit, sans-serif", fontSize: "3.5rem", fontWeight: 800,
            letterSpacing: "4px", textTransform: "uppercase", margin: "0 0 16px",
            background: "linear-gradient(180deg, #ffffff 0%, #d1d5db 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            lineHeight: 1.15
          }}>
            {itin.cover_title || itin.title || "TRAVEL BROCHURE"}
          </h1>

          <p style={{ color: "#a0aec0", fontSize: "1.25rem", maxWidth: 650, margin: "0 0 32px", lineHeight: 1.6 }}>
            {itin.cover_subheading || "An exclusive hand-crafted journey designed for an unforgettable travel experience."}
          </p>

          <div style={{
            background: "rgba(26, 34, 44, 0.75)", backdropFilter: "blur(12px)",
            border: "1px solid rgba(255, 255, 255, 0.1)", borderRadius: 20,
            padding: "16px 32px", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 24,
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)"
          }}>
            {itin.destination && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "1rem", color: "#f0f4f8", fontWeight: 500 }}>
                <span style={{ color: "#00b4d8" }}>📍</span> {itin.destination}
              </div>
            )}
            {(itin.total_days || itin.total_nights) && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "1rem", color: "#f0f4f8", fontWeight: 500 }}>
                <span style={{ color: "#00b4d8" }}>📅</span> {itin.total_days || "—"} Days / {itin.total_nights || "—"} Nights
              </div>
            )}
            {itin.num_travellers && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "1rem", color: "#f0f4f8", fontWeight: 500 }}>
                <span style={{ color: "#00b4d8" }}>👥</span> {itin.num_travellers} Travelers
              </div>
            )}
            {itin.start_date && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "1rem", color: "#f0f4f8", fontWeight: 500 }}>
                <span style={{ color: "#00b4d8" }}>🗓️</span> {formatDate(itin.start_date)} {itin.end_date && `– ${formatDate(itin.end_date)}`}
              </div>
            )}
            {itin.cab_type && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "1rem", color: "#f0f4f8", fontWeight: 500 }}>
                <span style={{ color: "#00b4d8" }}>🚙</span> {itin.cab_type}
              </div>
            )}
          </div>
        </div>

        {/* ══════ MAIN CONTENT WITH SIDEBAR NAV ══════ */}
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 48, position: "relative" }} className="dark-layout-grid">
          {/* Desktop Sidebar Navigation */}
          <div className="no-print dark-sidebar-desktop">
            <div style={{ background: "#1a222c", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 20, padding: "24px 20px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#d4af37", marginBottom: 16 }}>
                TRIP SECTIONS
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {isSectionVisible(itin, "flights") && (flights.onward?.from || flights.return?.from) && (
                  <a href="#section-flights" style={{ textDecoration: "none", color: "#a0aec0", fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#00b4d8" }} /> Flight Details
                  </a>
                )}
                {days.length > 0 && (
                  <div>
                    <a href="#section-itinerary" style={{ textDecoration: "none", color: "#a0aec0", fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#00b4d8" }} /> Day-by-Day Plan
                    </a>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 18, marginTop: 10 }}>
                      {days.map((day: any, i: number) => {
                        const dayNum = day.day || i + 1;
                        return (
                          <a
                            key={i}
                            href={`#day-${dayNum}`}
                            style={{ textDecoration: "none", color: "#8a9ba8", fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}
                          >
                            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(0, 180, 216, 0.5)", flexShrink: 0 }} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              Day {dayNum}{day.city ? ` - ${day.city}` : ""}
                            </span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
                {isSectionVisible(itin, "stay") && stays.length > 0 && (
                  <a href="#section-stays" style={{ textDecoration: "none", color: "#a0aec0", fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#00b4d8" }} /> Accommodations
                  </a>
                )}
                {(inclusionsList.length > 0 || exclusionsList.length > 0) && (
                  <a href="#section-inclusions" style={{ textDecoration: "none", color: "#a0aec0", fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#00b4d8" }} /> Inclusions & Exclusions
                  </a>
                )}
                {paymentTermsList.length > 0 && (
                  <a href="#section-policies" style={{ textDecoration: "none", color: "#a0aec0", fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#00b4d8" }} /> Important Notes
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div style={{ minWidth: 0 }}>
            {/* Mobile Horizontal Chip Navigation */}
            <div className="no-print dark-chips-mobile">
              {isSectionVisible(itin, "flights") && (flights.onward?.from || flights.return?.from) && (
                <a href="#section-flights" className="dark-chip-item">
                  <span>✈️</span> Flights
                </a>
              )}
              {days.map((day: any, i: number) => {
                const dayNum = day.day || i + 1;
                return (
                  <a key={i} href={`#day-${dayNum}`} className="dark-chip-item">
                    <span>🗓️</span> Day {dayNum}{day.city ? ` (${day.city})` : ""}
                  </a>
                );
              })}
              {isSectionVisible(itin, "stay") && stays.length > 0 && (
                <a href="#section-stays" className="dark-chip-item">
                  <span>🏨</span> Accommodations
                </a>
              )}
              {(inclusionsList.length > 0 || exclusionsList.length > 0) && (
                <a href="#section-inclusions" className="dark-chip-item">
                  <span>✨</span> Inclusions
                </a>
              )}
              {paymentTermsList.length > 0 && (
                <a href="#section-policies" className="dark-chip-item">
                  <span>📋</span> Notes
                </a>
              )}
            </div>

            {/* Flights */}
            {isSectionVisible(itin, "flights") && (flights.onward?.from || flights.return?.from) && (
              <div id="section-flights" className="dark-card-box" style={{
                scrollMarginTop: "40px",
                background: "#1a222c", border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: 20, padding: 32, marginBottom: 48, boxShadow: "0 4px 20px rgba(0,0,0,0.4)"
              }}>
                <h2 style={{ fontFamily: "Outfit, sans-serif", fontSize: "1.8rem", fontWeight: 700, color: "#fff", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ color: "#00b4d8" }}>✈️</span> Flight Details
                </h2>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)", background: "rgba(0, 180, 216, 0.1)" }}>
                        {["Sector", "Airline", "Route", "Date", "Timing", "Baggage"].map((h) => (
                          <th key={h} style={{ padding: "12px 14px", textAlign: "left", color: "#00b4d8", fontWeight: 600, fontSize: 12, textTransform: "uppercase" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {flights.onward?.from && (
                        <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                          <td style={{ padding: 14, color: "#d4af37", fontWeight: 700 }}>Onward</td>
                          <td style={{ padding: 14, color: "#fff" }}>{flights.onward.airline || "—"} {flights.onward.flight_number && `(${flights.onward.flight_number})`}</td>
                          <td style={{ padding: 14, color: "#a0aec0" }}>{flights.onward.from} → {flights.onward.to}</td>
                          <td style={{ padding: 14, color: "#a0aec0" }}>{formatDate(flights.onward.date)}</td>
                          <td style={{ padding: 14, color: "#a0aec0" }}>{flights.onward.departure_time || "—"} – {flights.onward.arrival_time || "—"}</td>
                          <td style={{ padding: 14, color: "#a0aec0" }}>{flights.onward.baggage || "—"}</td>
                        </tr>
                      )}
                      {flights.return?.from && (
                        <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}>
                          <td style={{ padding: 14, color: "#d4af37", fontWeight: 700 }}>Return</td>
                          <td style={{ padding: 14, color: "#fff" }}>{flights.return.airline || "—"} {flights.return.flight_number && `(${flights.return.flight_number})`}</td>
                          <td style={{ padding: 14, color: "#a0aec0" }}>{flights.return.from} → {flights.return.to}</td>
                          <td style={{ padding: 14, color: "#a0aec0" }}>{formatDate(flights.return.date)}</td>
                          <td style={{ padding: 14, color: "#a0aec0" }}>{flights.return.departure_time || "—"} – {flights.return.arrival_time || "—"}</td>
                          <td style={{ padding: 14, color: "#a0aec0" }}>{flights.return.baggage || "—"}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Day-by-Day */}
            {days.length > 0 && (
              <div id="section-itinerary" style={{ scrollMarginTop: "40px", marginBottom: 48 }}>
                <h2 style={{ fontFamily: "Outfit, sans-serif", fontSize: "2rem", fontWeight: 700, color: "#fff", marginBottom: 32, display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ color: "#00b4d8" }}>🗓️</span> Detailed Itinerary
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
                  {days.map((day: any, i: number) => {
                    const dayNum = day.day || i + 1;
                    return (
                      <div
                        key={i}
                        id={`day-${dayNum}`}
                        style={{
                          scrollMarginTop: "40px",
                          background: "#1a222c", border: "1px solid rgba(255, 255, 255, 0.08)",
                          borderRadius: 20, padding: 32, boxShadow: "0 4px 20px rgba(0,0,0,0.4)"
                        }}
                      >
                        <div style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: 16, marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <span style={{
                              background: "rgba(0, 180, 216, 0.12)", color: "#00b4d8",
                              border: "1px solid rgba(0, 180, 216, 0.3)", borderRadius: 12,
                              padding: "6px 14px", fontSize: 13, fontWeight: 700
                            }}>
                              DAY {dayNum}
                            </span>
                            <span style={{ fontSize: 14, color: "#a0aec0", display: "flex", alignItems: "center", gap: 4 }}>
                              📍 {day.city || `Day ${dayNum}`}
                            </span>
                            {day.date && <span style={{ fontSize: 12, color: "#718096" }}>({formatDate(day.date)})</span>}
                          </div>
                          {(day.meals?.breakfast || day.meals?.lunch || day.meals?.dinner) && (
                            <div style={{ color: "#d4af37", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                              🍳 {[day.meals.breakfast && "Breakfast", day.meals.lunch && "Lunch", day.meals.dinner && "Dinner"].filter(Boolean).join(" · ")}
                            </div>
                          )}
                        </div>

                        {day.summary && (
                          <p style={{ color: "#a0aec0", fontSize: "1.1rem", lineHeight: 1.7, marginBottom: 24 }}>
                            {day.summary}
                          </p>
                        )}

                        {(day.places || []).length > 0 && (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16, marginBottom: 24 }}>
                            {(day.places || []).map((p: any, pi: number) => (
                              <div key={pi} style={{
                                background: "rgba(10, 14, 20, 0.6)", border: "1px solid rgba(255, 255, 255, 0.06)",
                                borderRadius: 14, overflow: "hidden"
                              }}>
                                {p.image_url && (
                                  <div style={{ height: 160, overflow: "hidden", position: "relative" }}>
                                    <img
                                      src={getFallbackImage(p.image_url, p.name)}
                                      alt={p.name}
                                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                    />
                                  </div>
                                )}
                                <div style={{ padding: 16 }}>
                                  <div style={{ fontWeight: 700, fontSize: 15, color: "#fff", marginBottom: 6 }}>{p.name}</div>
                                  {p.description && <div style={{ fontSize: 13, color: "#a0aec0", lineHeight: 1.5 }}>{p.description}</div>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {(day.hotel || day.hotel_name || day.stay) && (
                          <div style={{ marginBottom: 20, padding: 14, background: "rgba(10, 14, 20, 0.4)", borderRadius: 12, border: "1px solid rgba(255, 255, 255, 0.05)", fontSize: 14, color: "#e2e8f0" }}>
                            🏨 <strong style={{ color: "#00b4d8" }}>Hotel:</strong> {day.hotel || day.hotel_name || day.stay}
                          </div>
                        )}

                        {((day.activities || []).filter(Boolean).length > 0 || day.transfers) && (
                          <div style={{ marginBottom: 20 }}>
                            {day.transfers && (
                              <div style={{ marginBottom: 12, fontSize: 14, color: "#e2e8f0" }}>
                                🚗 <strong style={{ color: "#00b4d8" }}>Transfers:</strong> {day.transfers}
                              </div>
                            )}
                            {(day.activities || []).filter(Boolean).length > 0 && (
                              <div style={{ position: "relative", paddingLeft: 24 }}>
                                <div style={{ position: "absolute", top: 4, bottom: 4, left: 7, width: 2, background: "rgba(255, 255, 255, 0.1)" }} />
                                {(day.activities || []).filter(Boolean).map((act: string, ai: number) => (
                                  <div key={ai} style={{ position: "relative", marginBottom: 14 }}>
                                    <div style={{
                                      position: "absolute", left: -24, top: 4, width: 12, height: 12,
                                      borderRadius: "50%", background: "#1a222c", border: "2px solid #00b4d8"
                                    }} />
                                    <div style={{ color: "#f0f4f8", fontSize: 14, lineHeight: 1.6 }}>{act}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {day.notes && (
                          <div style={{ padding: 12, background: "rgba(212, 175, 55, 0.08)", borderRadius: 10, border: "1px solid rgba(212, 175, 55, 0.2)", fontSize: 13, color: "#d4af37" }}>
                            📌 <strong>Note:</strong> {day.notes}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Package Pricing Options (Accommodations grouped by Option) */}
            {isSectionVisible(itin, "pricing") && stays.length > 0 && (
              <div id="section-stays" className="dark-card-box" style={{ scrollMarginTop: "40px", marginBottom: 48, background: "#1a222c", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 20, padding: 32, boxShadow: "0 4px 20px rgba(0,0,0,0.4)" }}>
                <h2 style={{ fontFamily: "Outfit, sans-serif", fontSize: "1.8rem", fontWeight: 700, color: "#fff", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ color: "#00b4d8" }}>🏨</span> Package Pricing Options
                </h2>
                <p style={{ color: "#a0aec0", marginBottom: 28, fontSize: "1rem" }}>
                  Select from our curated accommodation packages
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
                  {groupStaysByOption(stays).map((grp, i) => {
                    const isPremium = i === 0;
                    const pax = itin.num_travellers || (Number(itin.num_adults || 0) + Number(itin.num_children || 0));
                    const rawCost = Number(String(grp.totalCost || "").replace(/[^\d.]/g, ""));
                    const perPersonCost = (pax > 0 && rawCost > 0) ? Math.round(rawCost / pax) : null;
                    return (
                      <div key={grp.optionName} style={{
                        background: isPremium ? "linear-gradient(145deg, #121820 0%, #0a0e14 100%)" : "rgba(10, 14, 20, 0.6)",
                        border: `1px solid ${isPremium ? "rgba(212, 175, 55, 0.5)" : "rgba(255, 255, 255, 0.08)"}`,
                        borderRadius: 16, padding: 24, position: "relative",
                        boxShadow: "0 4px 20px rgba(0,0,0,0.4)"
                      }}>
                        {isPremium && (
                          <div style={{
                            background: "#d4af37", color: "#0a0e14", borderRadius: 999,
                            padding: "3px 12px", fontSize: 10, fontWeight: 800, textTransform: "uppercase",
                            letterSpacing: 1, position: "absolute", top: -10, right: 20
                          }}>
                            POPULAR
                          </div>
                        )}
                        <div style={{ fontSize: 13, color: "#00b4d8", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 16 }}>
                          {grp.optionName}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                          {grp.hotels.map((h: any, hIdx: number) => (
                            <div key={hIdx} style={{
                              borderBottom: hIdx < grp.hotels.length - 1 ? "1px solid rgba(255, 255, 255, 0.08)" : "none",
                              paddingBottom: hIdx < grp.hotels.length - 1 ? 14 : 0
                            }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
                                <h3 style={{ fontFamily: "Outfit, sans-serif", fontSize: "1.15rem", fontWeight: 700, color: "#fff", margin: 0 }}>
                                  {h.directions_url ? (
                                    <a href={h.directions_url} target="_blank" rel="noreferrer" style={{ color: "#fff", textDecoration: "none" }}>
                                      🏨 {h.hotel_name || "Hotel"} {h.city ? `(${h.city})` : ""} 📍
                                    </a>
                                  ) : (
                                    <span>🏨 {h.hotel_name || "Hotel"} {h.city ? `(${h.city})` : ""}</span>
                                  )}
                                </h3>
                                {h.google_rating && (
                                  <div style={{ color: "#d4af37", fontSize: 12, fontWeight: 600 }}>
                                    {"★".repeat(Math.round(Number(h.google_rating) || 5))} <span style={{ color: "#a0aec0" }}>({h.google_rating} Star)</span>
                                  </div>
                                )}
                              </div>
                              <ul style={{ listStyle: "none", padding: 0, margin: 0, color: "#a0aec0", fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
                                <li>🛏️ Room: <strong style={{ color: "#f0f4f8" }}>{h.room_category || "Standard Room"}</strong></li>
                                <li>🌙 Duration: <strong style={{ color: "#f0f4f8" }}>{h.nights || 1} Night(s)</strong></li>
                                {h.meal_plan && <li>🍽️ Meal Plan: <strong style={{ color: "#f0f4f8" }}>{h.meal_plan}</strong></li>}
                              </ul>
                            </div>
                          ))}
                        </div>
                        <div style={{
                          marginTop: 18, paddingTop: 14, borderTop: "1.5px solid rgba(0, 180, 216, 0.2)",
                          display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8
                        }}>
                          <div>
                            <span style={{ fontSize: 11, color: "#a0aec0", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600 }}>Total Cost</span>
                          </div>
                          <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#00b4d8", fontFamily: "Outfit, sans-serif" }}>
                            {grp.totalCost ? fmtINR(grp.totalCost) : "On Request"}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Inclusions & Exclusions */}
            {(inclusionsList.length > 0 || exclusionsList.length > 0) && (
              <div id="section-inclusions" style={{
                scrollMarginTop: "40px",
                background: "#1a222c", border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: 20, padding: 32, marginBottom: 48, boxShadow: "0 4px 20px rgba(0,0,0,0.4)"
              }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }} className="dark-inc-grid">
                  {inclusionsList.length > 0 && (
                    <div>
                      <h3 style={{ fontFamily: "Outfit, sans-serif", fontSize: "1.4rem", fontWeight: 700, color: "#fff", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ color: "#00b4d8" }}>✓</span> What&apos;s Included
                      </h3>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                        {inclusionsList.map((item, idx) => (
                          <li key={idx} style={{
                            background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.05)",
                            borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12,
                            fontSize: 14, color: "#a0aec0"
                          }}>
                            <span style={{ color: "#00b4d8", fontWeight: 700 }}>✓</span> {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {exclusionsList.length > 0 && (
                    <div>
                      <h3 style={{ fontFamily: "Outfit, sans-serif", fontSize: "1.4rem", fontWeight: 700, color: "#fff", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ color: "#f87171" }}>✕</span> What&apos;s Excluded
                      </h3>
                      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                        {exclusionsList.map((item, idx) => (
                          <li key={idx} style={{
                            background: "rgba(255, 255, 255, 0.03)", border: "1px solid rgba(255, 255, 255, 0.05)",
                            borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12,
                            fontSize: 14, color: "#a0aec0", opacity: 0.85
                          }}>
                            <span style={{ color: "#f87171", fontWeight: 700 }}>✕</span> {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Payment Terms */}
            {paymentTermsList.length > 0 && (
              <div id="section-policies" style={{
                scrollMarginTop: "40px",
                background: "rgba(0, 180, 216, 0.05)", border: "1px solid rgba(0, 180, 216, 0.2)",
                borderRadius: 20, padding: 32, marginBottom: 48
              }}>
                <h2 style={{ fontFamily: "Outfit, sans-serif", fontSize: "1.6rem", fontWeight: 700, color: "#fff", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: "#00b4d8" }}>📜</span> Payment Terms & Important Notes
                </h2>
                <ol style={{ paddingLeft: 20, margin: 0, color: "#a0aec0", fontSize: 14, lineHeight: 1.7, display: "flex", flexDirection: "column", gap: 8 }}>
                  {paymentTermsList.map((term, idx) => (
                    <li key={idx}>{term}</li>
                  ))}
                </ol>
              </div>
            )}

            {/* Advisor & Agency Contact Information */}
            {(advisor.name || advisor.phone || advisor.email || agencyName) && (
              <div style={{ background: "#1a222c", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: 20, overflow: "hidden", marginBottom: 48 }}>
                <div style={{ background: "linear-gradient(90deg, #00b4d8, #0077b6)", color: "white", padding: "20px 28px", display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: "white", color: "#0077b6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 700 }}>👤</div>
                  <div>
                    <div style={{ fontSize: 13, opacity: 0.9 }}>Your Holiday Advisor</div>
                    <div style={{ fontWeight: 800, fontSize: 22, fontFamily: "Outfit, sans-serif" }}>{advisor.name || agencyName || "Travel Expert"}</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px 32px", padding: "24px 28px" }}>
                  {advisor.phone && (
                    <div>
                      <div style={{ fontSize: 12, color: "#00b4d8", marginBottom: 4 }}>📞 Phone / WhatsApp</div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>{advisor.phone}</div>
                    </div>
                  )}
                  {advisor.email && (
                    <div>
                      <div style={{ fontSize: 12, color: "#00b4d8", marginBottom: 4 }}>✉️ Email Address</div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>{advisor.email}</div>
                    </div>
                  )}
                  {agencyName && (
                    <div>
                      <div style={{ fontSize: 12, color: "#00b4d8", marginBottom: 4 }}>🏢 Travel Agency</div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: "#fff" }}>{agencyName}</div>
                    </div>
                  )}
                  {agencyAddress && (
                    <div>
                      <div style={{ fontSize: 12, color: "#00b4d8", marginBottom: 4 }}>📍 Office Address</div>
                      <div style={{ fontWeight: 500, fontSize: 14, color: "#a0aec0", lineHeight: 1.4 }}>{agencyAddress}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            <div style={{ textAlign: "center", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: 36, marginTop: 24 }}>
              {hasAgencyBranding && (
                <div style={{ marginBottom: 12 }}>
                  {agencyName && <h3 style={{ fontFamily: "Outfit, sans-serif", fontSize: "1.4rem", fontWeight: 700, color: "#fff", marginBottom: 4 }}>{agencyName}</h3>}
                  {agencyAddress && <p style={{ color: "#a0aec0", fontSize: 13 }}>{agencyAddress}</p>}
                </div>
              )}
              <div style={{ fontSize: 12, color: "#64748b" }}>
                Crafted for an exceptional journey · All rights reserved.
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .dark-sidebar-desktop {
          position: sticky;
          top: 40px;
          height: fit-content;
        }
        .dark-chips-mobile {
          display: none;
        }
        @media (max-width: 768px) {
          .dark-sidebar-desktop {
            display: none !important;
          }
          .dark-chips-mobile {
            display: flex !important;
            position: sticky !important;
            top: 0 !important;
            z-index: 100 !important;
            background: rgba(10, 14, 20, 0.85) !important;
            backdrop-filter: blur(12px) !important;
            -webkit-backdrop-filter: blur(12px) !important;
            overflow-x: auto !important;
            white-space: nowrap !important;
            gap: 8px !important;
            padding: 10px 4px 10px 4px !important;
            margin-bottom: 20px !important;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
            -webkit-overflow-scrolling: touch !important;
            scrollbar-width: none !important;
          }
          .dark-chips-mobile::-webkit-scrollbar {
            display: none !important;
          }
          .dark-chip-item {
            display: inline-flex !important;
            align-items: center !important;
            gap: 6px !important;
            background: #1a222c !important;
            border: 1px solid rgba(0, 180, 216, 0.3) !important;
            color: #00b4d8 !important;
            padding: 8px 16px !important;
            border-radius: 999px !important;
            font-size: 13px !important;
            font-weight: 600 !important;
            text-decoration: none !important;
            flex-shrink: 0 !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3) !important;
            transition: all 0.2s ease !important;
          }
          .dark-chip-item:active {
            background: #00b4d8 !important;
            color: #0a0e14 !important;
          }
          .dark-share-container {
            padding: 0 12px 36px !important;
          }
          .dark-layout-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
          .dark-hero-banner {
            min-height: auto !important;
            padding: 32px 16px !important;
            margin-bottom: 24px !important;
            border-radius: 16px !important;
          }
          .dark-hero-title {
            font-size: 2.1rem !important;
            letter-spacing: 2px !important;
          }
          .dark-card-box {
            padding: 20px 16px !important;
            border-radius: 16px !important;
            margin-bottom: 24px !important;
          }
          .dark-inc-grid {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
          }
        }
        @media print {
          .no-print { display: none !important; }
          body { background: #0a0e14 !important; color: #f0f4f8 !important; }
          @page { margin: 12mm; size: A4; }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          .dark-layout-grid { display: block !important; width: 100% !important; }
        }
      `}</style>
    </div>
  );
}

