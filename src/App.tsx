// src/App.tsx
import React, { useState } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import WatchlistPage from "./WatchlistPage";

const API_BASE = "http://127.0.0.1:8000";
const USER_ID = "87cf4502-4455-428c-b039-1db39237f107"; // used for Watchlist page for now

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ItemIntent = {
  id: string;
  raw_text: string;
  canonical_category: string | null;
  quantity: number;
  attributes: Record<string, any>;
  status: string;
  created_at: string | null;
};

type StoreInfo = {
  id: string;
  name: string;
  distance_minutes: number;
};

type PlanItem = {
  id?: string;
  raw_text: string;
  canonical_category: string | null;
  quantity: number;
  estimated_price?: number;
  store_id?: string;
  store_name?: string;
  travel_minutes?: number;
};

export type WatchedItemWithDrop = {
  item_id: string;
  raw_text: string;
  canonical_category: string | null;
  last_price: number | null;
  previous_price: number | null;
  price_drop: number | null;
};

export type WatchlistState = {
  watchedIds: Set<string>;
};

type StorePlan = {
  label: string;
  stores: StoreInfo[];
  number_of_stores: number;
  total_price: number;
  travel_minutes: number;
  items: PlanItem[];
  discounts?: string[];
};

type PlanResponse = {
  user_id: string;
  items: ItemIntent[];
  plans: Record<string, StorePlan>;
  recommended_plan?: string;
  explanation?: string;
};

type BillingProductKey = "premium" | "costco_addon";

// ------------------------------
// Main Smart Shopper UI
// ------------------------------
const SmartShopper: React.FC = () => {
  const [userIdInput, setUserIdInput] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi, I’m Kartquake. Tell me what you want to buy (e.g. “1 gallon of 2% lactose-free milk”). I’ll build your list, then you can hit “Build My Plan”.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);

  const [shoppingList, setShoppingList] = useState<ItemIntent[]>([]);

  const [planPreference, setPlanPreference] = useState(
    "cheapest with reasonable travel"
  );
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [planResult, setPlanResult] = useState<PlanResponse | null>(null);
  const [isPlanLoading, setIsPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const [billingError, setBillingError] = useState<string | null>(null);
  const [isBillingLoading, setIsBillingLoading] = useState(false);

  // Watchlist state: which ItemIntent ids are watched
  const [watchedItemIds, setWatchedItemIds] = useState<string[]>([]);

  // --------------------------
  // Helpers
  // --------------------------

  const appendChatMessage = (msg: ChatMessage) => {
    setChatMessages((prev) => [...prev, msg]);
  };

  const mergeItemsIntoShoppingList = (newItems: ItemIntent[]) => {
    if (!newItems || newItems.length === 0) return;
    setShoppingList((prev) => {
      const byId = new Map<string, ItemIntent>();
      for (const item of prev) {
        byId.set(item.id, item);
      }
      for (const item of newItems) {
        byId.set(item.id, item);
      }
      return Array.from(byId.values()).sort((a, b) => {
        const da = a.created_at || "";
        const db = b.created_at || "";
        return da.localeCompare(db);
      });
    });
  };

  const isWatched = (id: string) => watchedItemIds.includes(id);

  const setWatchedLocally = (id: string, watched: boolean) => {
    setWatchedItemIds((prev) => {
      if (watched) {
        if (prev.includes(id)) return prev;
        return [...prev, id];
      } else {
        return prev.filter((x) => x !== id);
      }
    });
  };

  const fetchWatchlistForUser = async (uid: string) => {
    try {
      const resp = await fetch(`${API_BASE}/watchlist/user/${uid}`);
      if (!resp.ok) {
        console.warn("Failed to fetch watchlist:", resp.status);
        return;
      }
      const data = await resp.json();
      const ids = (data as any[]).map((w) => w.item_id as string);
      setWatchedItemIds(ids);
    } catch (err) {
      console.error("Error fetching watchlist:", err);
    }
  };

  // --------------------------
  // User ID handling
  // --------------------------

  const handleSetUser = async () => {
    const trimmed = userIdInput.trim();
    if (!trimmed) {
      alert("Please paste a valid user UUID.");
      return;
    }
    setUserId(trimmed);
    setPlanResult(null);
    setShoppingList([]);
    setChatMessages([
      {
        role: "assistant",
        content:
          "User set. Now tell me what you want to buy and I’ll build your shopping list.",
      },
    ]);

    await fetchWatchlistForUser(trimmed);
  };

  // --------------------------
  // Chat handler
  // --------------------------

  const handleSendMessage = async () => {
    if (!userId) {
      alert("Please set a user ID first.");
      return;
    }
    const msg = chatInput.trim();
    if (!msg) return;

    appendChatMessage({ role: "user", content: msg });
    setChatInput("");
    setIsChatLoading(true);

    try {
      const resp = await fetch(`${API_BASE}/chat/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          message: msg,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error("Chat assistant error:", resp.status, text);
        appendChatMessage({
          role: "assistant",
          content:
            "Hmm, something went wrong talking to the backend. Check if the backend is running or if the user ID is valid.",
        });
        return;
      }

      const data = await resp.json();
      const reply: string = data.reply ?? "Okay.";
      const items: ItemIntent[] = data.items ?? [];

      appendChatMessage({ role: "assistant", content: reply });
      mergeItemsIntoShoppingList(items);
    } catch (err) {
      console.error("Error sending message:", err);
      appendChatMessage({
        role: "assistant",
        content:
          "I couldn’t reach the backend. Make sure the FastAPI server is running.",
      });
    } finally {
      setIsChatLoading(false);
    }
  };

  // --------------------------
  // Watchlist handler
  // --------------------------

  const handleToggleWatch = async (itemId: string) => {
    if (!userId) {
      alert("Please set a user ID first.");
      return;
    }
    try {
      const resp = await fetch(`${API_BASE}/watchlist/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          item_id: itemId,
          current_price: null,
        }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        console.error("Watchlist toggle error:", resp.status, text);
        return;
      }
      const data = await resp.json();
      const watched = !!data.watched;
      setWatchedLocally(itemId, watched);
    } catch (err) {
      console.error("Error toggling watch:", err);
    }
  };

  // --------------------------
  // Plan builder handler
  // --------------------------

  const handleBuildPlan = async () => {
    if (!userId) {
      alert("Please set a user ID before building a plan.");
      return;
    }

    setIsPlanLoading(true);
    setPlanError(null);
    setPlanResult(null);

    try {
      const resp = await fetch(`${API_BASE}/plans/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          preference: planPreference,
          origin: origin || null,
          destination: destination || null,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error("Plan builder error:", resp.status, text);
        setPlanError(`Plan builder error (${resp.status}): ${text}`);
        return;
      }

      const data: PlanResponse = await resp.json();
      setPlanResult(data);
    } catch (err: any) {
      console.error("Error calling /plans/build:", err);
      setPlanError("Error calling /plans/build – check console and backend.");
    } finally {
      setIsPlanLoading(false);
    }
  };

  // --------------------------
  // Billing / Stripe handler
  // --------------------------

  const handleUpgradePlan = async (product: BillingProductKey) => {
    if (!userId) {
      alert("Please set a user ID before upgrading a plan.");
      return;
    }

    setBillingError(null);
    setIsBillingLoading(true);

    try {
      const resp = await fetch(`${API_BASE}/billing/create-checkout-session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          // IMPORTANT: backend expects `plan`, not `product`
          plan: product, // "premium" or "costco_addon"
        }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.error("Billing error:", resp.status, text);
        setBillingError(`Billing error (${resp.status}): ${text}`);
        return;
      }

      const data = await resp.json();
      const checkoutUrl = data.checkout_url ?? data.url;
      if (!checkoutUrl) {
        setBillingError("Billing error: no checkout URL returned.");
        return;
      }

      window.location.href = checkoutUrl;
    } catch (err: any) {
      console.error("Billing error:", err);
      setBillingError("Error calling billing API – check console and backend.");
    } finally {
      setIsBillingLoading(false);
    }
  };

  // --------------------------
  // UI helpers
  // --------------------------

  const renderAttributes = (attrs: Record<string, any>) => {
    const entries = Object.entries(attrs || {});
    if (!entries.length) return null;
    return (
      <span style={{ fontSize: "0.8rem", color: "#555" }}>
        {" ("}
        {entries
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join(", ")
          .slice(0, 120)}
        {entries.length > 0 ? ")" : ""}
      </span>
    );
  };

  const renderPlanCard = (key: string, plan: StorePlan) => {
    const isRecommended =
      planResult?.recommended_plan &&
      planResult.recommended_plan === key;

    let mapUrl: string | null = null;
    if (plan.stores && plan.stores.length > 0) {
      const originPart = origin.trim();
      const destinationPart = (destination || origin).trim();
      const storesSegment = plan.stores.map((s) => s.name).join(" to ");

      const segments: string[] = [];
      if (originPart) segments.push(originPart);
      if (storesSegment) segments.push(storesSegment);
      if (destinationPart && destinationPart !== originPart) {
        segments.push(destinationPart);
      }

      const query = segments.join(" to ");
      if (query) {
        mapUrl =
          "https://www.google.com/maps?q=" +
          encodeURIComponent(query) +
          "&output=embed";
      }
    }

    return (
      <div
        key={key}
        style={{
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 12,
          marginBottom: 12,
          backgroundColor: isRecommended ? "#f0f9ff" : "#fff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <strong>
            {plan.label}{" "}
            <span style={{ fontSize: "0.8rem", color: "#666" }}>
              ({key})
            </span>
          </strong>
          <span>
            ${plan.total_price.toFixed(2)} •{" "}
            {plan.travel_minutes.toFixed(1)} min route •{" "}
            {plan.number_of_stores} store
            {plan.number_of_stores > 1 ? "s" : ""}
          </span>
        </div>
        <div style={{ fontSize: "0.85rem", marginBottom: 4 }}>
          Stores (drive from start):{" "}
          {plan.stores
            .map(
              (s) =>
                `${s.name} (${s.distance_minutes.toFixed(1)} min)`
            )
            .join(" → ")}
        </div>
        {plan.discounts && plan.discounts.length > 0 && (
          <div
            style={{
              fontSize: "0.8rem",
              color: "#166534",
              backgroundColor: "#dcfce7",
              borderRadius: 6,
              padding: "4px 6px",
              marginBottom: 6,
            }}
          >
            {plan.discounts.map((d, idx) => (
              <div key={idx}>• {d}</div>
            ))}
          </div>
        )}
        <ul style={{ paddingLeft: 16, marginTop: 4 }}>
          {plan.items.map((item, idx) => (
            <li key={idx} style={{ fontSize: "0.85rem", marginBottom: 2 }}>
              • {item.quantity} × {item.raw_text}
              {item.estimated_price !== undefined &&
                ` – $${item.estimated_price.toFixed(2)}`}
              {item.store_name && ` @ ${item.store_name}`}
              {renderAttributes(
                {
                  ...(item.canonical_category
                    ? { cat: item.canonical_category }
                    : {}),
                } as Record<string, any>
              )}
            </li>
          ))}
        </ul>

        {mapUrl && (
          <div style={{ marginTop: 8 }}>
            <div
              style={{
                fontSize: "0.75rem",
                color: "#6b7280",
                marginBottom: 4,
              }}
            >
              Route preview (Google Maps):
            </div>
            <div
              style={{
                width: "100%",
                height: 180,
                borderRadius: 8,
                overflow: "hidden",
                border: "1px solid #e5e7eb",
              }}
            >
              <iframe
                title={`map-${key}`}
                src={mapUrl}
                style={{ width: "100%", height: "100%", border: "0" }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  // --------------------------
  // JSX
  // --------------------------

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0f172a",
        padding: "16px",
        color: "#e5e7eb",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI'",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1.1fr 0.9fr",
          gap: 16,
        }}
      >
        {/* LEFT COLUMN */}
        <div
          style={{
            backgroundColor: "#020617",
            borderRadius: 12,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            boxShadow: "0 0 0 1px rgba(148,163,184,0.1)",
          }}
        >
          <h1 style={{ fontSize: "1.4rem", fontWeight: 600 }}>
            Kartquake · Smart Shopper
          </h1>

          {/* User ID input */}
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <input
              style={{
                flex: 1,
                padding: "6px 8px",
                borderRadius: 6,
                border: "1px solid #4b5563",
                backgroundColor: "#020617",
                color: "#e5e7eb",
                fontSize: "0.85rem",
              }}
              placeholder="Paste your user UUID from /users"
              value={userIdInput}
              onChange={(e) => setUserIdInput(e.target.value)}
            />
            <button
              onClick={handleSetUser}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "none",
                backgroundColor: "#22c55e",
                color: "#022c22",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "0.85rem",
              }}
            >
              Use ID
            </button>
          </div>
          {userId && (
            <div style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
              Active user: <code>{userId}</code>
            </div>
          )}

          {/* Chat area */}
          <div
            style={{
              marginTop: 8,
              flex: 1,
              display: "flex",
              flexDirection: "column",
              borderRadius: 8,
              border: "1px solid #1e293b",
              backgroundColor: "#020617",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: 8,
                borderBottom: "1px solid #1e293b",
                fontSize: "0.85rem",
                color: "#9ca3af",
              }}
            >
              Chat with your shopping assistant
            </div>
            <div
              style={{
                padding: 8,
                height: 260,
                overflowY: "auto",
                fontSize: "0.9rem",
                background:
                  "radial-gradient(circle at top, rgba(15,23,42,0.8), #020617)",
              }}
            >
              {chatMessages.map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    marginBottom: 8,
                    textAlign: m.role === "user" ? "right" : "left",
                  }}
                >
                  <div
                    style={{
                      display: "inline-block",
                      padding: "6px 10px",
                      borderRadius: 10,
                      backgroundColor:
                        m.role === "user" ? "#1d4ed8" : "#111827",
                      color: "#e5e7eb",
                      maxWidth: "80%",
                      fontSize: "0.9rem",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {m.role === "assistant" && (
                      <span style={{ fontWeight: 600, marginRight: 4 }}>
                        Assistant:
                      </span>
                    )}
                    {m.content}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                  Assistant is thinking…
                </div>
              )}
            </div>
            <div
              style={{
                padding: 8,
                borderTop: "1px solid #1e293b",
                display: "flex",
                gap: 8,
              }}
            >
              <input
                style={{
                  flex: 1,
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #4b5563",
                  backgroundColor: "#020617",
                  color: "#e5e7eb",
                  fontSize: "0.85rem",
                }}
                placeholder='e.g. "1 gallon of 2% lactose-free milk"'
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              <button
                onClick={handleSendMessage}
                disabled={isChatLoading}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  border: "none",
                  backgroundColor: isChatLoading ? "#6b7280" : "#2563eb",
                  color: "#e5e7eb",
                  fontWeight: 600,
                  cursor: isChatLoading ? "default" : "pointer",
                  fontSize: "0.85rem",
                }}
              >
                Send
              </button>
            </div>
          </div>

          {/* Current shopping list */}
          <div
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 8,
              border: "1px solid #1e293b",
              backgroundColor: "#020617",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: "0.85rem", color: "#9ca3af" }}>
                Current shopping list
              </span>
              <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                {shoppingList.length} item
                {shoppingList.length === 1 ? "" : "s"}
              </span>
            </div>
            {shoppingList.length === 0 ? (
              <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                Nothing yet. Tell the assistant what you want to buy.
              </div>
            ) : (
              <ul style={{ paddingLeft: 0, listStyle: "none" }}>
                {shoppingList.map((item) => (
                  <li
                    key={item.id}
                    style={{
                      fontSize: "0.85rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 4,
                      gap: 8,
                    }}
                  >
                    <div>
                      • {item.quantity} × {item.raw_text}
                      {renderAttributes(item.attributes)}
                    </div>
                    <button
                      onClick={() => handleToggleWatch(item.id)}
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        fontSize: "1rem",
                        color: isWatched(item.id) ? "#facc15" : "#6b7280",
                      }}
                      title={
                        isWatched(item.id)
                          ? "Remove from watchlist"
                          : "Add to watchlist"
                      }
                    >
                      {isWatched(item.id) ? "★" : "☆"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div
          style={{
            backgroundColor: "#020617",
            borderRadius: 12,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            boxShadow: "0 0 0 1px rgba(148,163,184,0.1)",
          }}
        >
          <h2 style={{ fontSize: "1.2rem", fontWeight: 600 }}>
            Build my shopping plan
          </h2>

          <div style={{ fontSize: "0.85rem", color: "#9ca3af" }}>
            Kartquake will look at your shopping list and build one or more
            store plans. Use preferences like:
            <ul
              style={{
                marginTop: 4,
                paddingLeft: 18,
                listStyleType: "disc",
              }}
            >
              <li>"cheapest overall"</li>
              <li>"fewest stores"</li>
              <li>"limit to 2 stores"</li>
              <li>"shortest travel time"</li>
            </ul>
          </div>

          {/* Routing inputs */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              marginTop: 4,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "0.8rem",
                  color: "#9ca3af",
                  marginBottom: 2,
                }}
              >
                Start location
              </div>
              <input
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #4b5563",
                  backgroundColor: "#020617",
                  color: "#e5e7eb",
                  fontSize: "0.85rem",
                }}
                placeholder="Home ZIP or address"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
              />
            </div>
            <div>
              <div
                style={{
                  fontSize: "0.8rem",
                  color: "#9ca3af",
                  marginBottom: 2,
                }}
              >
                End location
              </div>
              <input
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  borderRadius: 6,
                  border: "1px solid #4b5563",
                  backgroundColor: "#020617",
                  color: "#e5e7eb",
                  fontSize: "0.85rem",
                }}
                placeholder="Leave empty to return to start"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
              />
            </div>
          </div>

          <input
            style={{
              width: "100%",
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid #4b5563",
              backgroundColor: "#020617",
              color: "#e5e7eb",
              fontSize: "0.85rem",
              marginTop: 4,
            }}
            value={planPreference}
            onChange={(e) => setPlanPreference(e.target.value)}
          />

          <button
            onClick={handleBuildPlan}
            disabled={isPlanLoading || !userId}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              backgroundColor: isPlanLoading ? "#6b7280" : "#22c55e",
              color: "#022c22",
              fontWeight: 600,
              cursor: isPlanLoading || !userId ? "default" : "pointer",
              fontSize: "0.9rem",
              marginTop: 4,
            }}
          >
            {isPlanLoading ? "Building your plan…" : "Build My Plan"}
          </button>

          {planError && (
            <div
              style={{
                marginTop: 8,
                padding: 8,
                borderRadius: 8,
                border: "1px solid #b91c1c",
                backgroundColor: "#7f1d1d",
                color: "#fecaca",
                fontSize: "0.8rem",
              }}
            >
              {planError}
            </div>
          )}

          {/* Plans display */}
          <div
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 8,
              border: "1px solid #1e293b",
              backgroundColor: "#020617",
              flex: 1,
              overflowY: "auto",
            }}
          >
            {!planResult && !planError && (
              <div style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                No plan yet. Add some items via chat, choose your start/end
                locations, then click <strong>Build My Plan</strong>.
              </div>
            )}

            {planResult && (
              <>
                {planResult.explanation && (
                  <div
                    style={{
                      marginBottom: 10,
                      padding: 8,
                      borderRadius: 8,
                      backgroundColor: "#0b1120",
                      fontSize: "0.85rem",
                    }}
                  >
                    <strong>Recommended plan: </strong>
                    <code>{planResult.recommended_plan}</code>
                    <div style={{ marginTop: 4 }}>
                      {planResult.explanation}
                    </div>
                  </div>
                )}

                <div style={{ fontSize: "0.9rem", marginBottom: 6 }}>
                  Candidate plans:
                </div>
                {Object.entries(planResult.plans).map(([key, plan]) =>
                  renderPlanCard(key, plan)
                )}
              </>
            )}
          </div>

          {/* Plans & Pricing section */}
          <div
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 8,
              border: "1px solid #1e293b",
              backgroundColor: "#020617",
            }}
          >
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              Plans & Pricing
            </h3>

            <button
              onClick={() => handleUpgradePlan("premium")}
              disabled={isBillingLoading || !userId}
              style={{
                width: "100%",
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #1e293b",
                backgroundColor: "#020617",
                color: "#e5e7eb",
                fontSize: "0.85rem",
                textAlign: "left",
                marginBottom: 6,
                cursor:
                  isBillingLoading || !userId ? "default" : "pointer",
              }}
            >
              ⭐ <strong>Premium Plan</strong> — $11.99/month
              <div style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                Unlimited items, multi-store planning, and smarter route
                optimization.
              </div>
            </button>

            <button
              onClick={() => handleUpgradePlan("costco_addon")}
              disabled={isBillingLoading || !userId}
              style={{
                width: "100%",
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #1e293b",
                backgroundColor: "#020617",
                color: "#e5e7eb",
                fontSize: "0.85rem",
                textAlign: "left",
                marginBottom: 6,
                cursor:
                  isBillingLoading || !userId ? "default" : "pointer",
              }}
            >
              🏷 <strong>Costco Add-On</strong> — $5.99/year
              <div style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                Unlock Costco-style warehouse optimization if you don’t
                already have a membership. Billed annually.
              </div>
            </button>

            <div
              style={{
                fontSize: "0.75rem",
                color: "#6b7280",
                marginTop: 4,
              }}
            >
              • Free tier: up to 5 items and limited plan builds
              <br />
              • Premium: unlimited items and plans
              <br />
              • Costco Add-On: for non-members who still want warehouse savings
            </div>

            {billingError && (
              <div
                style={{
                  marginTop: 8,
                  padding: 6,
                  borderRadius: 6,
                  border: "1px solid #b91c1c",
                  backgroundColor: "#7f1d1d",
                  color: "#fecaca",
                  fontSize: "0.75rem",
                }}
              >
                {billingError}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ------------------------------
// Router wrapper
// ------------------------------

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <nav style={{ padding: "0.5rem", borderBottom: "1px solid #eee" }}>
        <Link to="/">Home</Link>{" | "}
        <Link to="/watchlist">Watchlist</Link>
      </nav>
      <Routes>
        <Route path="/" element={<SmartShopper />} />
        <Route path="/watchlist" element={<WatchlistPage userId={USER_ID} />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
