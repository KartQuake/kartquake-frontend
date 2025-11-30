// src/WatchlistPage.tsx
import React, { useEffect, useState } from "react";

const API_BASE = "http://127.0.0.1:8000";

type WatchedItemWithDrop = {
  item_id: string;
  raw_text: string;
  canonical_category: string | null;
  last_price: number | null;
  previous_price: number | null;
  price_drop: number | null; // backend may send this, but we'll also compute defensively
};

type WatchlistPageProps = {
  userId: string;
};

const WatchlistPage: React.FC<WatchlistPageProps> = ({ userId }) => {
  const [items, setItems] = useState<WatchedItemWithDrop[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch watchlist for this user
  useEffect(() => {
    if (!userId) return;

    const fetchWatchlist = async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch(`${API_BASE}/watchlist/user/${userId}`);
        if (!resp.ok) {
          const txt = await resp.text();
          console.error("Failed to fetch watchlist:", resp.status, txt);
          setError(`Failed to fetch watchlist (${resp.status})`);
          return;
        }
        const data: WatchedItemWithDrop[] = await resp.json();
        setItems(data);
      } catch (err: any) {
        console.error("Error fetching watchlist:", err);
        setError("Network error fetching watchlist.");
      } finally {
        setLoading(false);
      }
    };

    fetchWatchlist();
  }, [userId]);

  // Compute price drop per item (fallback if backend doesn't populate price_drop)
  const getPriceDrop = (item: WatchedItemWithDrop): number | null => {
    if (item.price_drop !== null && item.price_drop !== undefined) {
      return item.price_drop;
    }
    if (
      item.last_price !== null &&
      item.last_price !== undefined &&
      item.previous_price !== null &&
      item.previous_price !== undefined
    ) {
      const diff = item.previous_price - item.last_price; // positive if price went down
      return diff > 0 ? diff : 0;
    }
    return null;
  };

  const decoratedItems = items.map((it) => {
    const drop = getPriceDrop(it);
    return { ...it, effectiveDrop: drop };
  });

  const itemsWithDrop = decoratedItems.filter(
    (it) => it.effectiveDrop !== null && it.effectiveDrop > 0
  );

  const biggestDrop = itemsWithDrop.length
    ? itemsWithDrop.reduce((acc, curr) =>
        (curr.effectiveDrop || 0) > (acc.effectiveDrop || 0) ? curr : acc
      )
    : null;

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
          maxWidth: 1000,
          margin: "0 auto",
          backgroundColor: "#020617",
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 0 0 1px rgba(148,163,184,0.1)",
        }}
      >
        <h1 style={{ fontSize: "1.4rem", fontWeight: 600, marginBottom: 8 }}>
          Watchlist
        </h1>

        {!userId && (
          <div
            style={{
              marginTop: 8,
              padding: 10,
              borderRadius: 8,
              border: "1px solid #1e293b",
              backgroundColor: "#020617",
              fontSize: "0.85rem",
              color: "#f97316",
            }}
          >
            No user selected. Go back to <strong>Home</strong>, set a user
            ID, and add items to your watchlist.
          </div>
        )}

        {userId && (
          <>
            {/* Price drops banner */}
            {itemsWithDrop.length > 0 && biggestDrop && (
              <div
                style={{
                  marginTop: 8,
                  marginBottom: 12,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #14532d",
                  background:
                    "linear-gradient(135deg, rgba(22,163,74,0.25), rgba(21,128,61,0.05))",
                  fontSize: "0.9rem",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  📉 Price drops on your watchlist
                </div>
                <div>
                  You have{" "}
                  <strong>{itemsWithDrop.length} item
                  {itemsWithDrop.length === 1 ? "" : "s"}</strong> with a
                  recent price decrease.
                </div>
                <div style={{ marginTop: 4, fontSize: "0.85rem" }}>
                  Biggest drop:{" "}
                  <strong>{biggestDrop.raw_text}</strong>{" "}
                  {biggestDrop.effectiveDrop !== null &&
                    `– dropped $${biggestDrop.effectiveDrop.toFixed(2)}`}
                </div>
              </div>
            )}

            {/* Loading / error states */}
            {loading && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: "0.85rem",
                  color: "#9ca3af",
                }}
              >
                Loading watchlist…
              </div>
            )}
            {error && (
              <div
                style={{
                  marginTop: 8,
                  padding: 8,
                  borderRadius: 8,
                  border: "1px solid #b91c1c",
                  backgroundColor: "#7f1d1d",
                  color: "#fecaca",
                  fontSize: "0.85rem",
                }}
              >
                {error}
              </div>
            )}

            {!loading && !error && items.length === 0 && (
              <div
                style={{
                  marginTop: 8,
                  padding: 10,
                  borderRadius: 8,
                  border: "1px solid #1e293b",
                  backgroundColor: "#020617",
                  fontSize: "0.85rem",
                  color: "#9ca3af",
                }}
              >
                Your watchlist is empty. From the Home page, add items to
                your shopping list and click the ⭐ icon to watch them.
              </div>
            )}

            {!loading && !error && items.length > 0 && (
              <div
                style={{
                  marginTop: 12,
                  borderRadius: 8,
                  border: "1px solid #1e293b",
                  overflow: "hidden",
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "0.85rem",
                  }}
                >
                  <thead
                    style={{
                      backgroundColor: "#020617",
                      borderBottom: "1px solid #1e293b",
                    }}
                  >
                    <tr>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "8px 10px",
                          color: "#9ca3af",
                          fontWeight: 500,
                        }}
                      >
                        Item
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          padding: "8px 10px",
                          color: "#9ca3af",
                          fontWeight: 500,
                        }}
                      >
                        Category
                      </th>
                      <th
                        style={{
                          textAlign: "right",
                          padding: "8px 10px",
                          color: "#9ca3af",
                          fontWeight: 500,
                        }}
                      >
                        Previous price
                      </th>
                      <th
                        style={{
                          textAlign: "right",
                          padding: "8px 10px",
                          color: "#9ca3af",
                          fontWeight: 500,
                        }}
                      >
                        Last price
                      </th>
                      <th
                        style={{
                          textAlign: "right",
                          padding: "8px 10px",
                          color: "#9ca3af",
                          fontWeight: 500,
                        }}
                      >
                        Δ (change)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {decoratedItems.map((it) => {
                      const diff =
                        it.last_price !== null &&
                        it.previous_price !== null
                          ? it.last_price - it.previous_price
                          : null;
                      const isDrop = diff !== null && diff < 0;
                      const isRise = diff !== null && diff > 0;

                      return (
                        <tr
                          key={it.item_id}
                          style={{
                            borderBottom: "1px solid #1e293b",
                            backgroundColor: "#020617",
                          }}
                        >
                          <td
                            style={{
                              padding: "8px 10px",
                              maxWidth: 260,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {it.raw_text}
                          </td>
                          <td
                            style={{
                              padding: "8px 10px",
                              color: "#9ca3af",
                            }}
                          >
                            {it.canonical_category || "—"}
                          </td>
                          <td
                            style={{
                              padding: "8px 10px",
                              textAlign: "right",
                              color: "#9ca3af",
                            }}
                          >
                            {it.previous_price !== null
                              ? `$${it.previous_price.toFixed(2)}`
                              : "—"}
                          </td>
                          <td
                            style={{
                              padding: "8px 10px",
                              textAlign: "right",
                            }}
                          >
                            {it.last_price !== null
                              ? `$${it.last_price.toFixed(2)}`
                              : "—"}
                          </td>
                          <td
                            style={{
                              padding: "8px 10px",
                              textAlign: "right",
                              color: isDrop
                                ? "#22c55e"
                                : isRise
                                ? "#f97316"
                                : "#9ca3af",
                            }}
                          >
                            {diff === null
                              ? "—"
                              : diff === 0
                              ? "$0.00"
                              : diff < 0
                              ? `↓ $${Math.abs(diff).toFixed(2)}`
                              : `↑ $${diff.toFixed(2)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default WatchlistPage;
