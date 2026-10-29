from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Sequence


@dataclass
class PnLPoint:
    day: date
    pnl: float
    is_verified: bool = False


@dataclass
class PerformanceStats:
    total_records: int
    total_pnl: float
    verified_pnl: float
    verified_records: int
    best_day: float
    worst_day: float
    win_rate: float
    avg_trade_size: float
    max_drawdown: float
    volatility: float
    best_streak: int
    worst_streak: int
    consistency_score: float
    sharpe_like: float
    win_days: int = 0
    loss_days: int = 0


def compute_stats(points: Sequence[PnLPoint]) -> PerformanceStats:
    if not points:
        return PerformanceStats(
            total_records=0,
            total_pnl=0.0,
            verified_pnl=0.0,
            verified_records=0,
            best_day=0.0,
            worst_day=0.0,
            win_rate=0.0,
            avg_trade_size=0.0,
            max_drawdown=0.0,
            volatility=0.0,
            best_streak=0,
            worst_streak=0,
            consistency_score=0.0,
            sharpe_like=0.0,
            win_days=0,
            loss_days=0,
        )

    ordered = sorted(points, key=lambda p: p.day)
    pnls = [p.pnl for p in ordered]

    total = sum(pnls)
    verified_pnls = [p.pnl for p in ordered if p.is_verified]
    verified_pnl = sum(verified_pnls)
    verified_records = len(verified_pnls)
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p < 0]

    mean = total / len(pnls)
    variance = sum((p - mean) ** 2 for p in pnls) / len(pnls)
    volatility = math.sqrt(variance)

    best_streak, worst_streak, current = _streaks(pnls)
    max_drawdown = _max_drawdown(pnls)

    # Sharpe-like: mean daily return over daily volatility, annualised loosely.
    sharpe_like = 0.0
    if volatility > 0:
        sharpe_like = round((mean / volatility) * math.sqrt(252), 3)

    # Consistency blends win-rate with low dispersion relative to the mean.
    win_rate = round((len(wins) / len(pnls)) * 100, 2)
    dispersion = abs(volatility) / abs(mean) if mean else 0.0
    consistency = round(max(0.0, min(1.0, (win_rate / 100) * (1 / (1 + dispersion)))), 4)

    # "Best/worst day" mean best/worst single-day P&L: if no wins, best is 0. If no losses, worst is 0.


    best_day_val = max(pnls) if wins else 0.0
    if losses:
        worst_day_val = min(pnls)
    else:
        worst_day_val = 0.0



    return PerformanceStats(
        total_records=len(pnls),
        total_pnl=round(total, 2),
        verified_pnl=round(verified_pnl, 2),
        verified_records=verified_records,
        best_day=round(best_day_val, 2),
        worst_day=round(worst_day_val, 2),
        win_rate=win_rate,
        avg_trade_size=round(mean, 2),
        max_drawdown=round(max_drawdown, 2),
        volatility=round(volatility, 2),
        best_streak=best_streak,
        worst_streak=worst_streak,
        consistency_score=consistency,
        sharpe_like=sharpe_like,
        win_days=len(wins),
        loss_days=len(losses),
    )


def _streaks(pnls: Sequence[float]) -> tuple[int, int, int]:
    best = worst = 0
    best_run = worst_run = 0
    for pnl in pnls:
        if pnl > 0:
            best_run += 1
            worst_run = 0
        elif pnl < 0:
            worst_run += 1
            best_run = 0
        else:
            best_run = 0
            worst_run = 0
        best = max(best, best_run)
        worst = max(worst, worst_run)
    return best, worst, best_run


def _max_drawdown(pnls: Sequence[float]) -> float:
    """Largest peak-to-trough decline of the cumulative equity curve."""
    equity = 0.0
    peak = 0.0
    max_dd = 0.0
    for pnl in pnls:
        equity += pnl
        peak = max(peak, equity)
        max_dd = min(max_dd, equity - peak)
    return abs(max_dd)


def cumulative_curve(points: Sequence[PnLPoint]) -> list[tuple[date, float]]:
    running = 0.0
    curve: list[tuple[date, float]] = []
    for point in sorted(points, key=lambda p: p.day):
        running += point.pnl
        curve.append((point.day, round(running, 2)))
    return curve
