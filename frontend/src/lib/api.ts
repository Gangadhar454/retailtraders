import type {
  BrokerOption,
  CurrentUser,
  DonateEligibility,
  FeedResponse,
  LeaderboardResponse,
  LinkedBroker,
  PublishHistoryResponse,
  Sentiment,
  TokenPair,
  UpiIntent,
  UpiStatus,
  UpiVerifyResponse,
  UserProfile,
  VerifyPnlResponse,
} from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8000";

const TOKEN_KEY = "netpnl.access_token";
const REFRESH_KEY = "netpnl.refresh_token";

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function setTokens(tokens: TokenPair): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, tokens.access_token);
  window.localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

function cleanErrorMsg(msg: string): string {
  if (!msg) return "Invalid request";
  return msg.replace(/^Value error,\s*/i, "").trim();
}

function extractDetail(payload: unknown): string {
  if (!payload) return "Something went wrong";
  if (typeof payload === "string") return cleanErrorMsg(payload);
  if (Array.isArray(payload)) {
    if (payload.length === 0) return "Invalid request";
    const first = payload[0];
    if (typeof first === "string") return cleanErrorMsg(first);
    if (typeof first === "object" && first !== null) {
      const item = first as { msg?: string; detail?: string; message?: string };
      return cleanErrorMsg(item.msg ?? item.detail ?? item.message ?? "Invalid request");
    }
    return cleanErrorMsg(String(first));
  }
  if (typeof payload === "object" && payload !== null) {
    const record = payload as Record<string, unknown>;
    if (typeof record.detail === "string") return cleanErrorMsg(record.detail);
    if (typeof record.message === "string") return cleanErrorMsg(record.message);
    if (Array.isArray(record.detail)) {
      return extractDetail(record.detail);
    }
    if (typeof record.detail === "object" && record.detail !== null) {
      return extractDetail(record.detail);
    }
  }
  return "Something went wrong";
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  auth?: boolean;
  raw?: boolean;
}

/**
 * Renews the access token. Concurrent callers share one in-flight refresh so
 * a burst of 401s does not trigger a burst of token exchanges.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    try {
      const response = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: "no-store",
      });
      if (!response.ok) {
        clearTokens();
        return false;
      }
      const tokens = (await response.json()) as TokenPair;
      setTokens(tokens);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
  isRetry = false,
): Promise<T> {
  const { body, auth = false, raw = false, headers, ...rest } = options;

  const requestHeaders: Record<string, string> = {
    Accept: "application/json",
    ...((headers as Record<string, string>) ?? {}),
  };

  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
  }

  if (auth) {
    const token = getAccessToken();
    if (token) requestHeaders.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  // The access token expired mid-session: renew it once and replay the call.
  if (response.status === 401 && auth && !isRetry) {
    if (await refreshAccessToken()) {
      return apiFetch<T>(path, options, true);
    }
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(extractDetail(payload), response.status, payload);
  }

  return (raw ? payload : payload) as T;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const authApi = {
  async register(input: {
    email: string;
    password: string;
    display_name: string;
  }): Promise<TokenPair> {
    const tokens = await apiFetch<TokenPair>("/api/v1/auth/register", {
      method: "POST",
      body: input,
    });
    setTokens(tokens);
    return tokens;
  },

  async login(input: { email: string; password: string }): Promise<TokenPair> {
    const tokens = await apiFetch<TokenPair>("/api/v1/auth/login", {
      method: "POST",
      body: input,
    });
    setTokens(tokens);
    return tokens;
  },

  async updateProfile(input: { display_name: string }): Promise<CurrentUser> {
    return apiFetch<CurrentUser>("/api/v1/auth/me", {
      method: "PATCH",
      body: input,
      auth: true,
    });
  },

  async me(): Promise<CurrentUser> {
    return apiFetch<CurrentUser>("/api/v1/auth/me", { auth: true });
  },

  /** Renews the access token ahead of expiry. Returns false if the session is over. */
  async refresh(): Promise<boolean> {
    return refreshAccessToken();
  },

  async changePassword(input: {
    current_password: string;
    new_password: string;
  }): Promise<{ message: string }> {
    return apiFetch<{ message: string }>("/api/v1/auth/change-password", {
      method: "POST",
      body: input,
      auth: true,
    });
  },

  async logout(): Promise<void> {
    clearTokens();
  },
};

// ---------------------------------------------------------------------------
// Public data
// ---------------------------------------------------------------------------
export const publicApi = {
  sentiment: (day?: string): Promise<Sentiment> =>
    apiFetch<Sentiment>(
      `/api/v1/leaderboard/sentiment${day ? `?day=${day}` : ""}`,
    ),

  leaderboard: (params: {
    day?: string;
    scope?: "today" | "cumulative" | "all_time";
    verifiedOnly?: boolean;
    sort?: "worst" | "best";
    limit?: number;
    offset?: number;
  } = {}): Promise<LeaderboardResponse> => {
    const query = new URLSearchParams();
    if (params.day) query.set("day", params.day);
    if (params.scope) query.set("scope", params.scope);
    if (params.verifiedOnly !== undefined) {
      query.set("verified_only", String(params.verifiedOnly));
    }
    if (params.sort) query.set("sort", params.sort);
    if (params.limit) query.set("limit", String(params.limit));
    if (params.offset !== undefined) query.set("offset", String(params.offset));
    const suffix = query.toString();
    return apiFetch<LeaderboardResponse>(
      `/api/v1/leaderboard/${suffix ? `?${suffix}` : ""}`,
    );
  },

  feed: (params: {
    day?: string;
    verifiedOnly?: boolean;
    sort?: "worst" | "best" | "recent";
    limit?: number;
    offset?: number;
  } = {}): Promise<FeedResponse> => {
    const query = new URLSearchParams();
    if (params.day) query.set("day", params.day);
    if (params.verifiedOnly) query.set("verified_only", "true");
    if (params.sort) query.set("sort", params.sort);
    if (params.limit) query.set("limit", String(params.limit));
    if (params.offset) query.set("offset", String(params.offset));
    const suffix = query.toString();
    return apiFetch<FeedResponse>(`/api/v1/pnl/feed${suffix ? `?${suffix}` : ""}`);
  },

  profile: (username: string): Promise<UserProfile> =>
    apiFetch<UserProfile>(`/api/v1/users/${encodeURIComponent(username)}`),

  /** Brokers the user can pick when publishing P&L. */
  supportedBrokers: (): Promise<BrokerOption[]> =>
    apiFetch<BrokerOption[]>("/api/v1/brokers/supported"),

  upiForUser: (username: string): Promise<UpiStatus> =>
    apiFetch<UpiStatus>(`/api/v1/users/${encodeURIComponent(username)}/qr`),

  tipIntent: (username: string, amount = 0): Promise<UpiIntent> =>
    apiFetch<UpiIntent>(
      `/api/v1/users/${encodeURIComponent(username)}/intent?amount=${amount}`,
    ),

  donateEligibility: (username: string): Promise<DonateEligibility> =>
    apiFetch<DonateEligibility>(
      `/api/v1/users/${encodeURIComponent(username)}/donate-eligible`,
    ),
};

// ---------------------------------------------------------------------------
// Authenticated data
// ---------------------------------------------------------------------------
export const userApi = {
  publishPnl: (input: {
    net_pnl: number;
    date?: string;
    notes?: string | null;
    trade_count?: number;
    win_rate?: number | null;
  }) => apiFetch("/api/v1/pnl/", { method: "POST", body: input, auth: true }),

  publishHistory: (params: { limit?: number; offset?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.limit) query.set("limit", String(params.limit));
    if (params.offset) query.set("offset", String(params.offset));
    const suffix = query.toString();
    return apiFetch<PublishHistoryResponse>(
      `/api/v1/pnl/history${suffix ? `?${suffix}` : ""}`,
      { auth: true },
    );
  },

  syncPnl: (broker?: string): Promise<VerifyPnlResponse> =>
    apiFetch<VerifyPnlResponse>(
      `/api/v1/pnl/sync${broker ? `?broker=${encodeURIComponent(broker)}` : ""}`,
      { method: "POST", auth: true },
    ),

  myRecords: () => apiFetch("/api/v1/pnl/mine", { auth: true }),

  deleteRecord: (id: string) =>
    apiFetch<void>(`/api/v1/pnl/${id}`, { method: "DELETE", auth: true }),

  deleteBrokerFetch: (id: string) =>
    apiFetch<void>(`/api/v1/pnl/broker/${id}`, { method: "DELETE", auth: true }),

  brokerAuthorizeUrl: (
    broker: string,
  ): Promise<{ authorization_url: string; state: string; broker_name?: string }> =>
    apiFetch(
      `/api/v1/brokers/${encodeURIComponent(
        broker.toLowerCase(),
      )}/authorize?origin=${encodeURIComponent(
        typeof window === "undefined" ? "" : window.location.origin,
      )}`,
      { auth: true },
    ),

  brokerCallback: (
    broker: string,
    payload: { state: string; code?: string; request_token?: string },
  ) =>
    apiFetch(`/api/v1/brokers/${encodeURIComponent(broker.toLowerCase())}/callback`, {
      method: "POST",
      body: payload,
      auth: true,
    }),

  brokers: (): Promise<LinkedBroker[]> =>
    apiFetch<LinkedBroker[]>("/api/v1/brokers/", { auth: true }),

  unlinkBroker: (linkId: string) =>
    apiFetch<void>(`/api/v1/brokers/${linkId}`, { method: "DELETE", auth: true }),

  verifyUpi: (upiId: string): Promise<UpiVerifyResponse> =>
    apiFetch<UpiVerifyResponse>("/api/v1/upi/verify", {
      method: "POST",
      body: { upi_id: upiId },
      auth: true,
    }),

  upiStatus: (): Promise<UpiStatus> =>
    apiFetch<UpiStatus>("/api/v1/upi/status", { auth: true }),

  upiIntent: (amount = 0): Promise<UpiIntent> =>
    apiFetch<UpiIntent>(`/api/v1/upi/intent?amount=${amount}`, { auth: true }),
};
