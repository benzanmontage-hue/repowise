"""Coupling read model: every co-change pair, folded once per index state.

The fold and the area grouping live in :mod:`repowise.core.analysis.coupling`;
this module reads the two columns they need, keeps the folded edges per
(database, repository, index stamp) in the shared :class:`IndexStampCache`,
and keeps each answer beside it, keyed on the query. Co-change rows are
rewritten by the index run that moves the stamp, so nothing else invalidates.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Hashable
from dataclasses import dataclass, field, replace
from typing import Any, TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from repowise.core.analysis.coupling import (
    CouplingEdge,
    CouplingGraph,
    CouplingScope,
    area_coupling,
    coupled_areas,
    coupling_edges,
    default_depth,
    graph_from_edges,
    place_edges,
)
from repowise.core.persistence.index_cache import IndexStampCache
from repowise.core.persistence.models import GitMetadata, HealthFileMetric
from repowise.core.test_paths import is_test_related_path

__all__ = [
    "CouplingModel",
    "area_coupling_payload",
    "clear_coupling_cache",
    "coupled_areas_for",
    "coupling_answer",
    "graph_payload",
]

T = TypeVar("T")

#: Folded edge lists, one per repository (older states are dropped).
_models = IndexStampCache(4)
#: Answers over them, one per distinct query a reader asks.
_answers = IndexStampCache(128)
#: One build per repository at a time, as the area model does.
_locks: dict[str, asyncio.Lock] = {}


def clear_coupling_cache() -> None:
    _models.clear()
    _answers.clear()
    # A lock is bound to the loop that first waited on it.
    _locks.clear()


@dataclass
class CouplingModel:
    edges: list[CouplingEdge]
    #: ``{path: (file_path, module, score, nloc)}`` rows, for node enrichment.
    metrics: dict[str, Any]
    #: Files the git walk recorded: the denominator of the coupled-file count.
    total_files: int
    _tests: dict[str, bool] = field(default_factory=dict, repr=False)
    _depths: dict[str, int] = field(default_factory=dict, repr=False)

    def is_test(self, path: str) -> bool:
        """Test material by path, memoised: partner files carry no stored flag."""
        found = self._tests.get(path)
        if found is None:
            found = self._tests[path] = is_test_related_path(path)
        return found

    def depth_for(self, root: str) -> int:
        """The default depth under *root*, over every coupled file so filters never move it."""
        found = self._depths.get(root)
        if found is None:
            paths = {p for e in self.edges for p in (e.source, e.target)}
            found = self._depths[root] = default_depth(paths, root)
        return found


async def _build(session: AsyncSession, repo_id: str) -> CouplingModel:
    git = select(GitMetadata.file_path, GitMetadata.co_change_partners_json).where(
        GitMetadata.repository_id == repo_id
    )
    git_rows = {row.file_path: row for row in (await session.execute(git)).all()}
    m = HealthFileMetric
    metric_q = select(m.file_path, m.module, m.score, m.nloc).where(m.repository_id == repo_id)
    metrics = {row.file_path: row for row in (await session.execute(metric_q)).all()}
    return CouplingModel(coupling_edges(git_rows), metrics, len(git_rows))


async def coupling_answer(
    session: AsyncSession,
    repo_id: str,
    query: tuple[Hashable, ...],
    build: Callable[[CouplingModel], T],
) -> T:
    """*build* over the repository's model, kept per index state and *query*."""
    base = await _models.key(session, repo_id)
    key = (*base, *query)
    if key in _answers:
        return _answers.get(key)
    return _answers.remember(key, build(await _model(session, repo_id, base)))


async def _model(session: AsyncSession, repo_id: str, key: tuple[Any, ...]) -> CouplingModel:
    """The folded model for *key*, built once even under concurrent first reads."""
    if key in _models:
        return _models.get(key)
    async with _locks.setdefault(repo_id, asyncio.Lock()):
        if key in _models:
            return _models.get(key)
        model = await _build(session, repo_id)
        _models.drop_repo(repo_id)
        return _models.remember(key, model)


def _resolved(model: CouplingModel, scope: CouplingScope) -> CouplingScope:
    """*scope* with a depth, the default for its root when it asked for none."""
    return scope if scope.depth > 0 else replace(scope, depth=model.depth_for(scope.root))


def graph_payload(model: CouplingModel, scope: CouplingScope, limit: int) -> tuple[CouplingGraph, int]:
    """The file-pair graph the scope keeps, capped, and the depth it was placed at."""
    scope = _resolved(model, scope)
    placed = place_edges(model.edges, scope, is_test=model.is_test)
    graph = graph_from_edges(
        [p.edge for p in placed], model.metrics, total_files=model.total_files, limit=limit
    )
    return graph, scope.depth


def area_coupling_payload(
    model: CouplingModel, scope: CouplingScope, limit: int, top_pairs: int
) -> dict[str, Any]:
    """Area pairs and per-area totals under the scope."""
    scope = _resolved(model, scope)
    placed = place_edges(model.edges, scope, is_test=model.is_test)
    return {
        "root": scope.root,
        "depth": scope.depth,
        **area_coupling(placed, limit=limit, top_pairs=top_pairs),
    }


def coupled_areas_for(model: CouplingModel, area: str) -> list[dict[str, Any]]:
    """The areas *area* changes with, test material left out as the coupling view's default."""
    return coupled_areas(
        model.edges,
        area,
        keep=lambda e: not (model.is_test(e.source) or model.is_test(e.target)),
    )
