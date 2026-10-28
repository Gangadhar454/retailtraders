export type BrokerName = "Upstox" | "Zerodha" | "Angel One";

export interface PublicUser {
  user_id: string;
  display_name: string;
  username: string;
  bio: string | null;
  avatar_seed: string;
  created_at: string;
  is_verified_publisher: boolean;
}

export interface LinkedBroker {
  link_id: string;
  broker_name: string;
  broker_legal_name: string | null;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
}

export interface BrokerOption {
  key: string;
  name: string;
  status: "available" | "coming_soon";
  detail: string;
}

export interface CurrentUser extends PublicUser {
  email: string;
  verified_upi_id: string | null;
  upi_verification_status: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  upi_verified_name: string | null;
  linked_brokers: LinkedBroker[];
  has_upi_id: boolean;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface PnLRecord {
  record_id: string;
  user_id: string;
  date: string;
  net_pnl: number;
  total_pnl?: number;
  is_verified: boolean;
  broker_source: string | null;
  source: "MANUAL" | "UPSTOX" | "ZERODHA" | "ANGEL_ONE";
  trade_count: number;
  win_rate: number | null;
  notes: string | null;
  manual_net_pnl?: number | null;
  manual_trade_count?: number;
  has_manual_entry?: boolean;
  created_at: string;
}

export interface PublishItem {
  kind: "manual" | "broker" | "legacy";
  id: string;
  net_pnl: number;
  total_pnl?: number;
  notes: string | null;
  trade_count: number;
  win_rate: number | null;
  source: "MANUAL" | "UPSTOX" | "ZERODHA" | "ANGEL_ONE";
  broker_name: string | null;
  created_at: string;
  can_edit: boolean;
  can_delete: boolean;
}

export interface PublishDay {
  date: string;
  net_pnl: number;
  total_pnl?: number;
  is_verified: boolean;
  broker_source: string | null;
  trade_count: number;
  notes: string | null;
  items: PublishItem[];
}

export interface PublishHistoryResponse {
  days: PublishDay[];
  total: number;
  has_more: boolean;
}

export interface FeedEntry {
  record: PnLRecord;
  user: PublicUser;
  rank: number | null;
}

export interface FeedResponse {
  entries: FeedEntry[];
  total: number;
  has_more: boolean;
}

export interface Sentiment {
  date: string;
  net_pnl_total: number;
  since_launch_net_pnl: number;
  since_launch_verified_pnl?: number;
  since_launch_date: string;
  trader_count: number;
  verified_net_pnl: number;
  unverified_net_pnl: number;
  verified_count: number;
  unverified_count: number;
  profitable_count: number;
  losing_count: number;
  average_pnl: number;
  biggest_loss: number;
  biggest_gain: number;
  updated_at: string;
}

export interface LeaderboardEntry {
  rank: number;
  user: PublicUser;
  net_pnl: number;
  total_pnl?: number;
  is_verified: boolean;
  broker_source: string | null;
  trade_count: number;
  record_date: string;
  note: string | null;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  total: number;
  scope: string;
}

export interface UpiStatus {
  status: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  upi_id: string | null;
  resolved_name: string | null;
  can_tip: boolean;
}

export interface UpiVerifyResponse {
  status: string;
  upi_id: string;
  resolved_name: string | null;
  can_tip: boolean;
  message: string;
}

export interface UpiIntent {
  upi_id: string;
  payee_name: string;
  amount: number;
  note: string;
  intent_url: string;
}

export interface ProfileStats {
  total_records: number;
  total_pnl: number;
  verified_pnl: number;
  verified_records?: number;
  best_day: number;
  worst_day: number;
  win_rate: number;
  avg_trade_size: number;
  max_drawdown: number;
  volatility: number;
  best_streak: number;
  worst_streak: number;
  consistency_score: number;
  sharpe_like: number;
}

export interface PerformancePoint {
  date: string;
  net_pnl: number;
  total_pnl?: number;
  is_verified: boolean;
  cumulative: number;
}

export interface UserProfile {
  user: PublicUser;
  stats: ProfileStats;
  timeline: PerformancePoint[];
  today: PnLRecord | null;
  upi: UpiStatus;
  linked_broker: LinkedBroker | null;
  can_tip: boolean;
}

export interface VerifyPnlResponse {
  status: string;
  message: string;
  record: PnLRecord | null;
  broker_fetched_pnl: number | null;
  broker_name: string | null;
}

export interface DonateEligibility {
  eligible: boolean;
  upi_id: string | null;
  resolved_name: string | null;
  reason: string | null;
}
