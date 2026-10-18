"""Coupling between areas: which directories change together, and how much of
it the dependency graph cannot explain.

Folds placed file pairs (:func:`~.scope.place_edges`) into area pairs. An
area pair's figures are sums over its file pairs, so ``co_changes`` counts a
commit once per file pair it touched, not once per commit: the distinct-commit
count is not stored. Pure: no DB access.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import asdict, dataclass, field
from typing import Any

from repowise.core.analysis.areas import area_at, area_depth, in_area

from ...co_change import STRUCTURAL_UNEXPLAINED
from .graph import CouplingEdge
from .scope import PlacedEdge

__all__ = [
    "AREA_PAIR_LIMIT",
    "COUPLED_AREA_LIMIT",
    "TOP_PAIRS",
    "area_coupling",
    "coupled_areas",
]

#: Area pairs one answer carries, ranked; the total is always reported.
AREA_PAIR_LIMIT = 50
#: File pairs carried under each area pair.
TOP_PAIRS = 5
#: Areas an area card lists as changing with it.
COUPLED_AREA_LIMIT = 5


@dataclass
class _Tally:
    """Running sums for one area or one area pair."""

    pairs: int = 0
    unexplained: int = 0
    strength: float = 0.0
    co_changes: int = 0
    last: str | None = None
    edges: list[CouplingEdge] = field(default_factory=list)

    def add(self, edge: CouplingEdge, *, keep: bool = False) -> None:
        self.pairs += 1
        self.unexplained += edge.structural == STRUCTURAL_UNEXPLAINED
        self.strength += edge.strength
        self.co_changes += edge.support
        if edge.last_co_change and (self.last is None or edge.last_co_change > self.last):
            self.last = edge.last_co_change
        if keep:
            self.edges.append(edge)

    def figures(self) -> dict[str, Any]:
        return {
            "pairs": self.pairs,
            "unexplained_pairs": self.unexplained,
            "unexplained_share": round(self.unexplained / self.pairs, 3) if self.pairs else 0.0,
            "strength": round(self.strength, 3),
            "co_changes": self.co_changes,
            "last_co_change": self.last,
        }


def _rank(tally: _Tally) -> tuple[int, float]:
    """Unexplained pairs first, the finding; strength breaks ties."""
    return (tally.unexplained, tally.strength)


def _top_edges(edges: list[CouplingEdge], limit: int) -> list[CouplingEdge]:
    """The strongest unexplained pairs first, then the strongest of the rest."""
    unexplained = [e for e in edges if e.structural == STRUCTURAL_UNEXPLAINED]
    rest = [e for e in edges if e.structural != STRUCTURAL_UNEXPLAINED]
    return (unexplained + rest)[:limit]


def area_coupling(
    placed: Sequence[PlacedEdge],
    *,
    limit: int = AREA_PAIR_LIMIT,
    top_pairs: int = TOP_PAIRS,
) -> dict[str, Any]:
    """Area pairs and per-area totals over *placed* edges.

    *placed* is strongest first (as :func:`~.scope.place_edges` keeps it), so
    each pair's file list is too. A pair inside one area is an area pair with
    itself, present only when the scope kept same-area edges.
    """
    pairs: dict[tuple[str, str], _Tally] = {}
    areas: dict[str, _Tally] = {}
    cross = unexplained = 0
    for p in placed:
        key = (p.source_area, p.target_area)
        if key[0] > key[1]:
            key = (key[1], key[0])
        pairs.setdefault(key, _Tally()).add(p.edge, keep=True)
        for area in set(key):
            areas.setdefault(area, _Tally()).add(p.edge)
        cross += key[0] != key[1]
        unexplained += p.edge.structural == STRUCTURAL_UNEXPLAINED

    ranked = sorted(pairs.items(), key=lambda kv: _rank(kv[1]), reverse=True)
    return {
        "totals": {
            "pairs": len(placed),
            "cross_area_pairs": cross,
            "unexplained_pairs": unexplained,
            "area_pairs": len(pairs),
            "unexplained_area_pairs": sum(1 for t in pairs.values() if t.unexplained),
        },
        "areas": [
            {"path": area, **tally.figures()}
            for area, tally in sorted(areas.items(), key=lambda kv: _rank(kv[1]), reverse=True)
        ],
        "area_pairs": [
            {
                "source": a,
                "target": b,
                **tally.figures(),
                "top_pairs": [asdict(e) for e in _top_edges(tally.edges, top_pairs)],
            }
            for (a, b), tally in ranked[:limit]
        ],
    }


def coupled_areas(
    edges: Sequence[CouplingEdge],
    area: str,
    *,
    keep: Callable[[CouplingEdge], bool] = lambda e: True,
    limit: int = COUPLED_AREA_LIMIT,
) -> list[dict[str, Any]]:
    """The areas outside *area* its files change with, most strongly first.

    A partner file is named by its area at *area*'s own depth, so
    ``packages/ui`` lists ``packages/web`` and ``tests/unit``, not single
    folders. The root has nothing outside it and lists nothing.
    """
    depth = area_depth(area)
    if depth == 0:
        return []
    tallies: dict[str, _Tally] = {}
    for e in edges:
        inside_a, inside_b = in_area(e.source, area), in_area(e.target, area)
        if inside_a == inside_b or not keep(e):
            continue
        other = e.target if inside_a else e.source
        tallies.setdefault(area_at(other, depth), _Tally()).add(e)
    ranked = sorted(tallies.items(), key=lambda kv: kv[1].strength, reverse=True)
    return [{"path": path, **tally.figures()} for path, tally in ranked[:limit]]
