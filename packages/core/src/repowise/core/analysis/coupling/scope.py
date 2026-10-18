"""Which couplings a view covers, and which areas each one joins.

A coupling view is read at one *depth* under one *root* area: every file is
placed in the area :func:`~repowise.core.analysis.areas.area_at` names for it,
so ``packages/ui/src/a.tsx`` at depth 2 is in ``packages/ui``. A file outside
the root is placed one level down from the repository at the root's own depth,
so drilling into ``packages/ui`` still shows it changing with ``packages/web``.

The filters narrow edges before anything is counted, so the totals a view
prints describe the edges it holds. Pure: callers pass loaded edges and a test
classifier and get placed edges back.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, replace
from datetime import date, timedelta

from repowise.core.analysis.areas import ROOT_AREA, area_at, area_depth, in_area

from ...co_change import STRUCTURAL_UNEXPLAINED
from .graph import CouplingEdge

__all__ = [
    "MAX_DEPTH",
    "CouplingScope",
    "PlacedEdge",
    "default_depth",
    "place_edges",
]

#: Deepest level a view groups by. Below it areas are single files' folders.
MAX_DEPTH = 6

#: An area holding more than this share of the coupled files is split one
#: level further when the depth is chosen for the reader.
_DOMINANT_SHARE = 0.5


@dataclass(frozen=True)
class CouplingScope:
    """The view: where it is rooted, how deep it groups, and what it keeps."""

    depth: int
    root: str = ROOT_AREA
    #: Shared commits a pair needs to count.
    min_support: int = 0
    #: Only pairs the dependency graph could explain and does not.
    unexplained: bool = False
    #: Only pairs whose two files sit in different areas.
    cross_area: bool = False
    #: Leave out pairs touching test material. A test is expected to change
    #: with its code, the rule the hidden-coupling finding applies.
    exclude_tests: bool = False
    #: Only pairs that last changed together within this many days of the
    #: newest co-change in the index (not of today, so an old index still reads).
    recent_days: int | None = None
    #: Only pairs with a file placed in this area at ``depth``, and with
    #: ``partner`` its other file placed there: one area-pair row's file pairs.
    area: str | None = None
    partner: str | None = None


@dataclass(frozen=True, slots=True)
class PlacedEdge:
    """An edge with the two areas its files sit in, in the edge's own order."""

    edge: CouplingEdge
    source_area: str
    target_area: str


def _area_of(path: str, scope: CouplingScope, floor: int) -> str:
    if in_area(path, scope.root):
        return area_at(path, floor + scope.depth)
    return area_at(path, floor)


def _cutoff(edges: Sequence[CouplingEdge], days: int | None) -> str | None:
    """The oldest ``last_co_change`` a recency filter keeps, as an ISO date."""
    if days is None:
        return None
    newest = max((e.last_co_change[:10] for e in edges if e.last_co_change), default=None)
    if newest is None:
        return None
    try:
        return (date.fromisoformat(newest) - timedelta(days=days)).isoformat()
    except ValueError:
        return None


def _between(placed: PlacedEdge, area: str, partner: str | None) -> bool:
    """Whether the pair has a file placed in *area* and, given *partner*, its
    other file placed there. Placed areas, not path prefixes, so the root-files
    area ``""`` names only the files at the root, as its area-pair row does."""
    ends = (placed.source_area, placed.target_area)
    for here, there in (ends, ends[::-1]):
        if here == area and (partner is None or there == partner):
            return True
    return False


def place_edges(
    edges: Sequence[CouplingEdge],
    scope: CouplingScope,
    *,
    is_test: Callable[[str], bool],
) -> list[PlacedEdge]:
    """The edges *scope* keeps, each stamped ``cross_area`` and placed in its areas.

    Order is preserved, so strongest-first input stays strongest first. An
    edge needs a file under the root to be in the view.
    """
    floor = area_depth(scope.root)
    cutoff = _cutoff(edges, scope.recent_days)
    areas: dict[str, str] = {}

    def area_of(path: str) -> str:
        found = areas.get(path)
        if found is None:
            found = areas[path] = _area_of(path, scope, floor)
        return found

    out: list[PlacedEdge] = []
    for e in edges:
        if not (in_area(e.source, scope.root) or in_area(e.target, scope.root)):
            continue
        if e.support < scope.min_support:
            continue
        if scope.unexplained and e.structural != STRUCTURAL_UNEXPLAINED:
            continue
        if cutoff is not None and (e.last_co_change or "")[:10] < cutoff:
            continue
        if scope.exclude_tests and (is_test(e.source) or is_test(e.target)):
            continue
        a, b = area_of(e.source), area_of(e.target)
        if scope.cross_area and a == b:
            continue
        placed = PlacedEdge(replace(e, cross_area=a != b), a, b)
        if scope.area is not None and not _between(placed, scope.area, scope.partner):
            continue
        out.append(placed)
    return out


def default_depth(paths: Iterable[str], root: str = ROOT_AREA) -> int:
    """The shallowest depth below *root* at which no area holds most of *paths*.

    A repository whose code all lives under ``src/`` or ``packages/`` groups
    one level further down rather than opening on one area that holds
    everything. Stops early once no path reaches deeper.
    """
    floor = area_depth(root)
    inside = [p for p in paths if in_area(p, root)]
    if not inside:
        return 1
    deepest = max(area_depth(p) - 1 for p in inside) - floor
    for depth in range(1, MAX_DEPTH + 1):
        counts: dict[str, int] = {}
        for path in inside:
            key = area_at(path, floor + depth)
            counts[key] = counts.get(key, 0) + 1
        if max(counts.values()) <= _DOMINANT_SHARE * len(inside) or depth >= deepest:
            return depth
    return MAX_DEPTH
