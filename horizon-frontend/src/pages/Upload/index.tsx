import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

// ── Design tokens ──────────────────────────────────────────────────────────
const C = {
  bg: "#0d141d", bgCard: "#19202a", bgCardH: "#242a34", bgHigh: "#2e353f",
  bgBright: "#333a44", bgLowest: "#080f18", bgLow: "#151c26",
  border: "rgba(68,71,77,0.1)", borderV: "rgba(68,71,77,0.15)",
  text: "#dce3f0", muted: "#c4c6ce", dim: "#8e9098", slate: "#64748b",
  cyan: "#4cd6ff", primary: "#9ccaff", secondary: "#a6c9fa",
  cyanCont: "#00222c", primCont: "#00203a", white: "#ffffff",
};
const M = "'Manrope', sans-serif";
const I = "'Inter', sans-serif";

const PROF_IMG =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuAO8ljqlvLx15UuNrHjnbb-nqCSFThCnawPCu6z956HFbdmORHXSOe_rEf9JGLADpWCg_7k1GcOyEDJJs4-toEg21JWIFMkvunkfiDwlGOvOXyTu7DcErpl1DRxvqtXEb2YMMAJ4Nex5iOPyiE77ci2PjO1KSAWs7oTZNPusu9T9k2Y137lOfuaiynUqw1bGwrDeXM4QZntpSS7AOWcJxILcDSjqjE2NKGc5Hr_55BRkLxK0MkW7AZa5RoBHyiSVznHSSeUz_XoRmOy";

// ── Static data ────────────────────────────────────────────────────────────
const STEPS = [
  { n: 1, label: "Profile",       sub: "Vessel identity established",  done: true,  active: false },
  { n: 2, label: "Documentation", sub: "Upload active certifications", done: false, active: true  },
  { n: 3, label: "Verification",  sub: "Awaiting ledger confirmation", done: false, active: false },
];

const LIVE_STATUS = [
  { label: "Certificate of Registry", status: "VERIFIED", color: C.cyan      },
  { label: "Safety Management",       status: "PENDING",  color: C.secondary },
];

const REQUIREMENTS = [
  {
    icon: "description", iconColor: C.cyan, badgeBg: C.cyanCont, badgeColor: C.cyan,
    title: "International Tonnage",
    desc: "Proof of vessel dimensions and cargo capacity metrics.",
  },
  {
    icon: "security", iconColor: C.primary, badgeBg: C.primCont, badgeColor: C.primary,
    title: "ISPS Certification",
    desc: "Compliance with International Ship and Port Facility Security.",
  },
];

// ── Component ──────────────────────────────────────────────────────────────
export const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleSelectFiles = (e: React.MouseEvent) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleRunOcr = () => {
    if (ocrLoading) return;
    setOcrLoading(true);
    setTimeout(() => navigate("/ocr-result"), 1200);
  };

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: I, minHeight: "100vh", overflowX: "hidden" }}>

      {/* ── TOP NAV ─────────────────────────────────────────────────────── */}
      <nav style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50, height: 80,
        background: "rgba(13,20,29,0.6)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" as any,
        backgroundImage: "linear-gradient(to bottom, rgba(255,255,255,0.04), transparent)",
        boxShadow: "0 1px 0 rgba(68,71,77,0.15), 0 20px 40px rgba(0,0,0,0.3)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "0 2rem",
      }}>
        {/* Left: brand + links */}
        <div style={{ display: "flex", alignItems: "center", gap: "2.5rem" }}>
          <span style={{
            fontFamily: M, fontWeight: 900, fontSize: "1.4rem",
            color: C.white, letterSpacing: "-0.04em",
          }}>
            HORIZON
          </span>
          <div style={{ display: "flex", gap: "1.5rem" }}>
            {["Marketplace", "Vessels", "Contracts", "Logistics"].map((link) => (
              <a
                key={link}
                href="#"
                onClick={(e) => { e.preventDefault(); if (link === "Marketplace") navigate("/marketplace"); }}
                style={{
                  fontFamily: M, fontSize: "0.875rem", color: C.slate,
                  textDecoration: "none", letterSpacing: "-0.01em", transition: "color 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = C.white)}
                onMouseLeave={(e) => (e.currentTarget.style.color = C.slate)}
              >
                {link}
              </a>
            ))}
          </div>
        </div>
        {/* Right: icons + avatar */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {["notifications", "anchor"].map((icon) => (
            <span
              key={icon}
              className="material-symbols-outlined"
              style={{ color: C.muted, cursor: "pointer", fontSize: "1.4rem", transition: "color 0.2s" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = C.white)}
              onMouseLeave={(e) => (e.currentTarget.style.color = C.muted)}
            >
              {icon}
            </span>
          ))}
          <div style={{
            width: 40, height: 40, borderRadius: "50%", overflow: "hidden",
            border: "1.5px solid rgba(156,202,255,0.25)", cursor: "pointer",
          }}
            onClick={() => navigate("/profile")}
          >
            <img
              src={PROF_IMG}
              alt="Profile"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        </div>
      </nav>

      {/* ── MAIN GRID ───────────────────────────────────────────────────── */}
      <main style={{
        maxWidth: 1280, margin: "0 auto",
        padding: "112px 2rem 80px",
        display: "grid", gridTemplateColumns: "1fr 2fr", gap: "2.5rem",
        alignItems: "start",
      }}>

        {/* ── LEFT SIDEBAR ──────────────────────────────────────────────── */}
        <aside style={{
          display: "flex", flexDirection: "column", gap: "2rem",
          position: "sticky", top: 100,
        }}>

          {/* Phase label + heading + description */}
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <span style={{
              fontSize: "0.65rem", color: C.muted, textTransform: "uppercase",
              letterSpacing: "0.2em", fontWeight: 600, opacity: 0.7,
            }}>
              Onboarding Phase 02
            </span>
            <h1 style={{
              fontFamily: M, fontWeight: 800,
              fontSize: "clamp(1.75rem, 3vw, 2.25rem)",
              color: C.white, letterSpacing: "-0.04em",
              margin: 0, lineHeight: 1.15,
            }}>
              Trust is our<br />primary anchor.
            </h1>
            <p style={{ fontSize: "0.875rem", color: C.muted, lineHeight: 1.75, margin: 0 }}>
              To maintain the integrity of the HORIZON ecosystem, we require verified maritime
              documentation for every vessel in your fleet. Our automated systems cross-reference
              these with global port authorities and IMO databases.
            </p>
          </div>

          {/* Stepper */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {STEPS.map((step, i) => (
              <div key={step.n}>
                <div style={{
                  display: "flex", alignItems: "center", gap: "1rem",
                  opacity: !step.done && !step.active ? 0.35 : 1,
                }}>
                  {/* Step circle */}
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: M, fontWeight: 700,
                    background: step.done ? "#1a6fc4" : step.active ? C.primCont : C.bgHigh,
                    border: step.active ? `2px solid ${C.primary}` : step.done ? "none" : `1px solid ${C.border}`,
                    color: step.done ? C.white : step.active ? C.primary : C.muted,
                    boxShadow: step.active ? `0 0 16px rgba(156,202,255,0.2)` : "none",
                  }}>
                    {step.done ? (
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: "1.1rem", fontVariationSettings: "'FILL' 1" }}
                      >
                        check
                      </span>
                    ) : (
                      <span>{step.n}</span>
                    )}
                  </div>
                  {/* Step text */}
                  <div>
                    <p style={{
                      fontSize: "0.875rem", fontWeight: 700, fontFamily: M,
                      color: step.active ? C.primary : step.done ? C.text : C.muted,
                      margin: "0 0 2px",
                    }}>
                      {step.label}
                    </p>
                    <p style={{
                      fontSize: "0.7rem",
                      color: step.active ? `${C.primary}99` : C.dim,
                      margin: 0,
                    }}>
                      {step.sub}
                    </p>
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{
                    width: 1, height: 28,
                    background: "rgba(68,71,77,0.3)",
                    margin: "6px 0 6px 19px",
                  }} />
                )}
              </div>
            ))}
          </div>

          {/* Live Verification Status card */}
          <div style={{
            padding: "1.25rem 1.5rem", background: C.bgCard, borderRadius: 12,
            border: `1px solid ${C.borderV}`,
            display: "flex", flexDirection: "column", gap: "1rem",
          }}>
            <h3 style={{
              fontSize: "0.6rem", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.18em", color: C.dim, margin: 0,
            }}>
              Live Verification Status
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              {LIVE_STATUS.map((ls) => (
                <div key={ls.label} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: C.bgLowest, padding: "0.75rem 1rem", borderRadius: 8,
                }}>
                  <span style={{ fontSize: "0.8rem", color: C.text }}>{ls.label}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{
                      width: 7, height: 7, borderRadius: "50%", background: ls.color,
                      boxShadow: `0 0 6px ${ls.color}`,
                    }} />
                    <span style={{ fontSize: "0.6rem", fontWeight: 700, color: ls.color, letterSpacing: "0.05em" }}>
                      {ls.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Vessel info block */}
          <div style={{
            display: "flex", alignItems: "center", gap: "0.875rem",
            padding: "1rem 1.25rem",
            background: "rgba(76,214,255,0.04)",
            border: "1px solid rgba(76,214,255,0.12)",
            borderRadius: 10,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 8, flexShrink: 0,
              background: "rgba(76,214,255,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span className="material-symbols-outlined" style={{ color: C.cyan, fontSize: "1.3rem" }}>
                directions_boat
              </span>
            </div>
            <div>
              <p style={{ fontSize: "0.875rem", fontWeight: 700, color: C.white, margin: 0 }}>
                Maersk Tianjin
              </p>
              <p style={{
                fontSize: "0.6rem", color: C.slate,
                textTransform: "uppercase", letterSpacing: "0.15em", margin: "2px 0 0",
              }}>
                IMO 9632117
              </p>
            </div>
          </div>
        </aside>

        {/* ── RIGHT CONTENT ─────────────────────────────────────────────── */}
        <section style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* Drop Zone */}
          <div style={{ position: "relative" }}>
            {/* Glow border effect */}
            <div style={{
              position: "absolute", inset: -6, borderRadius: 18,
              background: "linear-gradient(135deg, rgba(156,202,255,0.25), rgba(76,214,255,0.25))",
              filter: "blur(10px)",
              opacity: dragOver ? 1 : 0.3,
              transition: "opacity 0.3s",
              pointerEvents: "none",
            }} />

            {/* Drop area */}
            <label
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              style={{
                position: "relative",
                background: dragOver ? "rgba(51,58,68,0.6)" : "rgba(25,32,42,0.8)",
                backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" as any,
                borderRadius: 14,
                border: `1.5px solid ${dragOver ? "rgba(76,214,255,0.5)" : C.borderV}`,
                padding: "3rem 2rem",
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", textAlign: "center", gap: "1.5rem",
                minHeight: 340, transition: "background 0.2s, border-color 0.2s",
                cursor: "pointer", boxSizing: "border-box"
              }}
            >
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />

              {/* Upload icon */}
              <div style={{
                width: 76, height: 76, borderRadius: "50%",
                background: C.bgHigh,
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 20px 40px rgba(0,209,255,0.1)",
              }}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "2.5rem", color: C.primary }}
                >
                  cloud_upload
                </span>
              </div>

              {/* Heading + sub */}
              <div style={{ maxWidth: 420 }}>
                <h2 style={{
                  fontFamily: M, fontWeight: 700, fontSize: "1.4rem",
                  color: C.white, margin: "0 0 0.5rem", letterSpacing: "-0.02em",
                }}>
                  {selectedFile ? selectedFile.name : "Deposit Vessel Certificates"}
                </h2>
                <p style={{ fontSize: "0.875rem", color: C.muted, margin: 0, lineHeight: 1.65 }}>
                  {selectedFile
                    ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB — ready to process`
                    : "Drag and drop your IMO-certified PDF documents here, or click to browse your local terminal."}
                </p>
              </div>

              {/* Action buttons */}
              <div style={{ display: "flex", gap: "1rem" }}>
                <div
                  onClick={handleSelectFiles}
                  style={{
                    background: "linear-gradient(to right, #9ccaff, #a6c9fa)",
                    color: "#002a4a", padding: "0.75rem 2rem", borderRadius: 7,
                    fontWeight: 700, fontFamily: M, border: "none", cursor: "pointer",
                    transition: "filter 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.1)")}
                  onMouseLeave={(e) => (e.currentTarget.style.filter = "none")}
                >
                  Select Files
                </div>
                <div
                  style={{
                    background: "rgba(46,53,63,0.3)",
                    backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" as any,
                    color: C.white, padding: "0.75rem 2rem", borderRadius: 7,
                    fontWeight: 700, fontFamily: M,
                    border: `1px solid ${C.borderV}`,
                    cursor: "pointer", transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(46,53,63,0.6)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(46,53,63,0.3)")}
                >
                  Bulk Import
                </div>
              </div>

              <p style={{
                fontSize: "0.6rem", textTransform: "uppercase",
                letterSpacing: "0.2em", color: `${C.muted}70`, margin: 0,
              }}>
                Accepted Formats: PDF, PNG, JPEG (MAX 50 MB)
              </p>
            </label>
          </div>

          {/* OCR button — shown when file is selected */}
          {selectedFile && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={handleRunOcr}
                disabled={ocrLoading}
                style={{
                  display: "flex", alignItems: "center", gap: "0.5rem",
                  padding: "0.75rem 2rem",
                  background: `linear-gradient(to right, ${C.primary}, ${C.cyan})`,
                  color: "#002a4a", fontWeight: 700, fontFamily: M,
                  fontSize: "0.875rem", border: "none", borderRadius: 8,
                  cursor: ocrLoading ? "wait" : "pointer",
                  boxShadow: "0 8px 24px rgba(76,214,255,0.25)",
                  opacity: ocrLoading ? 0.75 : 1,
                  transition: "opacity 0.2s",
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "1.1rem" }}>
                  {ocrLoading ? "hourglass_empty" : "document_scanner"}
                </span>
                {ocrLoading ? "Processing..." : "Run OCR Parser"}
              </button>
            </div>
          )}

          {/* Requirement cards grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
            {REQUIREMENTS.map((r) => (
              <div
                key={r.title}
                style={{
                  background: C.bgCardH, padding: "1.5rem", borderRadius: 12,
                  border: `1px solid ${C.border}`,
                  display: "flex", flexDirection: "column", gap: "1rem",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "#2b3240")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = C.bgCardH)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <span
                    className="material-symbols-outlined"
                    style={{ color: r.iconColor, fontSize: "1.4rem" }}
                  >
                    {r.icon}
                  </span>
                  <span style={{
                    fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.08em",
                    padding: "3px 8px", background: r.badgeBg, color: r.badgeColor,
                    borderRadius: 4,
                  }}>
                    REQUIRED
                  </span>
                </div>
                <div>
                  <h4 style={{ fontFamily: M, fontWeight: 700, color: C.white, margin: "0 0 4px", fontSize: "0.9rem" }}>
                    {r.title}
                  </h4>
                  <p style={{ fontSize: "0.75rem", color: C.muted, margin: 0, lineHeight: 1.55 }}>
                    {r.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Footer bar */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            paddingTop: "1.75rem",
            borderTop: `1px solid ${C.border}`,
          }}>
            {/* Status indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: C.cyan, boxShadow: `0 0 8px ${C.cyan}`,
              }} />
              <span style={{
                fontSize: "0.6rem", fontWeight: 700, color: C.muted,
                textTransform: "uppercase", letterSpacing: "0.15em",
              }}>
                System Online: Encrypted Connection
              </span>
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontWeight: 600, fontSize: "0.875rem", color: C.muted,
                  transition: "color 0.2s", padding: "0.5rem 1rem",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = C.white)}
                onMouseLeave={(e) => (e.currentTarget.style.color = C.muted)}
              >
                Save Progress
              </button>
              <button
                onClick={() => navigate(-1)}
                style={{
                  background: C.bgBright, color: C.white, fontFamily: M,
                  padding: "0.5rem 1.5rem", borderRadius: 7,
                  fontWeight: 700, fontSize: "0.875rem",
                  border: `1px solid ${C.border}`,
                  cursor: "pointer", transition: "background 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = C.bgBright)}
              >
                Previous Step
              </button>
            </div>
          </div>

        </section>
      </main>
    </div>
  );
};

export default UploadPage;