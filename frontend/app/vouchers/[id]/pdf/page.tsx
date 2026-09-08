"use client";

import { useEffect, useState, use } from "react";
import { vouchersApi, authApi, resolveAssetUrl } from "@/lib/api";

const BRAND = "#2D9B7A";

export default function VoucherPdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [voucher, setVoucher] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    vouchersApi.get(Number(id)).then(setVoucher).catch(console.error);
    authApi.me().then(setMe).catch(console.error);
  }, [id]);

  if (!voucher) return <div style={{ padding: 40, textAlign: "center", fontFamily: "sans-serif" }}>Loading PDF...</div>;

  const formatDate = (dateString?: string) => {
    if (!dateString) return "TBD";
    return new Date(dateString).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
  };

  const getDaysNights = () => {
    if (!voucher.check_in || !voucher.check_out) return "";
    const msPerDay = 1000 * 60 * 60 * 24;
    const diff = new Date(voucher.check_out).getTime() - new Date(voucher.check_in).getTime();
    const nights = Math.ceil(diff / msPerDay);
    if (nights <= 0) return "";
    return `(${nights} Nights / ${nights + 1} Days)`;
  };

  const agencyName = me?.agency_name?.trim() || "Plannatrip";
  const agencyLogoSrc = resolveAssetUrl(me?.logo_url);
  const agencyAddress = me?.agency_office_address;
  const agencyPhone = me?.advisor_phone;
  const agencyEmail = me?.advisor_email;
  const agencyWebsite = me?.website;

  const guestName = voucher.guest_name || voucher.customer_name || "Guest Name TBA";

  return (
    <div style={{ background: "#f1f5f9", minHeight: "100vh", padding: "40px 0", fontFamily: "'Inter', sans-serif" }}>
      
      {/* Print Controls (hidden when printing) */}
      <div className="print-hide" style={{ maxWidth: 850, margin: "0 auto 20px", display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button onClick={() => window.history.back()} style={{ padding: "8px 16px", background: "white", border: "1px solid #cbd5e1", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
          ← Back
        </button>
        <button onClick={() => window.print()} style={{ padding: "8px 16px", background: BRAND, color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
          🖨️ Print / Save PDF
        </button>
      </div>

      {/* A4 Page Container */}
      <div style={{
        background: "white",
        width: "210mm",
        minHeight: "297mm",
        margin: "0 auto",
        boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
        position: "relative",
        overflow: "hidden",
        color: "#1e293b",
      }}>
        
        {/* Header / Banner */}
        <div style={{ position: "relative", height: "180px", background: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)" }}>
          {voucher.banner_image_url && (
            <img 
              src={voucher.banner_image_url} 
              alt="Hotel Banner" 
              style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.6 }} 
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          )}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(0,0,0,0.7))" }}></div>
          <div style={{ position: "absolute", top: 30, left: 40, right: 40, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {agencyLogoSrc && !imgError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={agencyLogoSrc}
                  alt={agencyName}
                  style={{ height: 48, maxWidth: 200, objectFit: "contain", background: "white", borderRadius: 6, padding: "4px 8px" }}
                  onError={() => setImgError(true)}
                />
              ) : (
                <>
                  <div style={{ width: 40, height: 40, background: BRAND, color: "white", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 24 }}>
                    {agencyName.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ color: "white", fontWeight: 800, fontSize: 22, letterSpacing: "1px" }}>{agencyName}</div>
                </>
              )}
            </div>
            <div style={{ textAlign: "right", color: "white" }}>
              <div style={{ fontWeight: 800, fontSize: 24, textTransform: "uppercase", letterSpacing: "2px", opacity: 0.9 }}>
                Hotel Voucher
              </div>
              <div style={{ fontSize: 13, marginTop: 4, opacity: 0.8 }}>
                Generated on {new Date().toLocaleDateString()}
              </div>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div style={{ padding: "40px" }}>
          
          {/* Hotel Info & Conf Number */}
          <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #e2e8f0", paddingBottom: 24, marginBottom: 30 }}>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 900, color: "#0f172a", margin: 0, marginBottom: 6 }}>
                {voucher.hotel_name || "Hotel Name"}
              </h1>
              {voucher.hotel_stars && (
                <div style={{ color: "#fbbf24", fontSize: 18, marginBottom: 8 }}>
                  {"★".repeat(voucher.hotel_stars)}
                </div>
              )}
              <div style={{ color: "#64748b", fontSize: 14, maxWidth: 400, lineHeight: 1.5 }}>
                {voucher.hotel_address || "Hotel Address"}
              </div>
            </div>
            
            {(voucher.extra_data?.confirmation_number || voucher.id) && (
              <div style={{ textAlign: "right", background: "#f8fafc", padding: "16px 24px", borderRadius: 12, border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 }}>
                  Confirmation No.
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: BRAND }}>
                  {voucher.extra_data?.confirmation_number || `VCH-${voucher.id.toString().padStart(5, '0')}`}
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                  Status: <span style={{ color: "#10b981", fontWeight: 700 }}>Confirmed</span>
                </div>
              </div>
            )}
          </div>

          {/* Booking Summary Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: 40 }}>
            <div style={{ background: "#f8fafc", padding: 20, borderRadius: 12, border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={labelStyle}>Check In</div>
                  <div style={valStyle}>{formatDate(voucher.check_in)}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>From 14:00 HRS</div>
                </div>
                <div style={{ flex: 1, borderLeft: "1px solid #cbd5e1", paddingLeft: 16 }}>
                  <div style={labelStyle}>Check Out</div>
                  <div style={valStyle}>{formatDate(voucher.check_out)}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>By 12:00 HRS</div>
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: BRAND, background: BRAND + "15", display: "inline-block", padding: "4px 10px", borderRadius: 20 }}>
                Duration: {getDaysNights()}
              </div>
            </div>

            <div style={{ background: "white", padding: 20, borderRadius: 12, border: "1px solid #e2e8f0" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px 0", ...labelStyle, border: "none" }}>Primary Guest</td>
                    <td style={{ padding: "8px 0", ...valStyle, textAlign: "right" }}>{guestName}</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px 0", ...labelStyle, border: "none" }}>Total Guests</td>
                    <td style={{ padding: "8px 0", ...valStyle, textAlign: "right" }}>{voucher.num_guests || 2} Pax</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px 0", ...labelStyle, border: "none" }}>Room Type</td>
                    <td style={{ padding: "8px 0", ...valStyle, textAlign: "right" }}>{voucher.num_rooms || 1}x {voucher.room_type || "Standard Room"}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "8px 0", ...labelStyle, border: "none" }}>Meal Plan</td>
                    <td style={{ padding: "8px 0", ...valStyle, textAlign: "right" }}>{voucher.meal_plan || "Room Only"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Details & Policies */}
          <div style={{ marginBottom: 40 }}>
            {voucher.special_requests && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={sectionHeadStyle}>Special Requests</h3>
                <div style={paragraphStyle}>{voucher.special_requests}</div>
              </div>
            )}
            
            {voucher.cancellation_policy && (
              <div style={{ marginBottom: 24 }}>
                <h3 style={sectionHeadStyle}>Cancellation Policy</h3>
                <div style={paragraphStyle}>{voucher.cancellation_policy}</div>
              </div>
            )}
            
            <div>
              <h3 style={sectionHeadStyle}>Important Information</h3>
              <ul style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, margin: 0, paddingLeft: 20 }}>
                <li style={{ marginBottom: 6 }}>Valid photo ID is required at the time of check-in for all guests.</li>
                <li style={{ marginBottom: 6 }}>Early check-in or late check-out is strictly subject to hotel availability and may incur extra charges.</li>
                <li>This voucher is system generated and must be presented at the hotel reception upon arrival.</li>
              </ul>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#f8fafc", borderTop: "1px solid #e2e8f0", padding: "20px 40px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            <strong>{agencyName}</strong>
            {agencyAddress ? ` • ${agencyAddress}` : ""}
            <br/>
            {[agencyEmail, agencyPhone, agencyWebsite].filter(Boolean).join(" | ") || "hello@trippilot.com"}
          </div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>
            Page 1 of 1
          </div>
        </div>

      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body { background: white !important; margin: 0; padding: 0; }
          .print-hide { display: none !important; }
          div[style*="210mm"] { box-shadow: none !important; margin: 0 !important; width: 100% !important; min-height: 100% !important; }
        }
      `}} />
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" };
const valStyle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "#1e293b" };
const sectionHeadStyle: React.CSSProperties = { fontSize: 14, fontWeight: 800, color: "#0f172a", borderBottom: "2px solid #e2e8f0", paddingBottom: 6, marginBottom: 12, textTransform: "uppercase", letterSpacing: "1px" };
const paragraphStyle: React.CSSProperties = { fontSize: 13, color: "#475569", lineHeight: 1.6, background: "#f8fafc", padding: 16, borderRadius: 8, border: "1px solid #e2e8f0" };
