"""/coupling filters, /coupling/areas and the area card's coupled areas over a seeded store."""

from __future__ import annotations

import json

from httpx import AsyncClient

from repowise.core.persistence import crud
from tests.unit.server.conftest import create_test_repo


def _partner(path: str, count: float, structural: str, support: int = 4) -> dict:
    return {
        "file_path": path,
        "co_change_count": count,
        "frequency": support,
        "self_commits": 10,
        "partner_commits": 10,
        "last_co_change": "2026-06-01",
        "structural": structural,
    }


PARTNERS = {
    "src/ui/a.ts": [
        _partner("src/web/b.ts", 3.0, "unexplained"),
        _partner("src/ui/c.ts", 2.0, "corroborated"),
    ],
    "src/core/x.py": [
        _partner("src/web/b.ts", 1.0, "corroborated", support=2),
        _partner("tests/test_x.py", 0.5, "unexplained"),
    ],
}


async def _seed(app, client: AsyncClient) -> str:
    repo_id = (await create_test_repo(client))["id"]
    async with app.state.session_factory() as session:
        await crud.save_health_metrics(
            session,
            repo_id,
            [
                {
                    "file_path": path,
                    "score": 8.0,
                    "max_ccn": 1,
                    "max_nesting": 1,
                    "nloc": 10,
                    "duplication_pct": 0.0,
                    "has_test_file": False,
                    "line_coverage_pct": None,
                    "branch_coverage_pct": None,
                    "module": path.split("/")[1],
                }
                for path in ("src/ui/a.ts", "src/ui/c.ts", "src/web/b.ts", "src/core/x.py")
            ],
        )
        for path, partners in PARTNERS.items():
            await crud.upsert_git_metadata(
                session,
                repository_id=repo_id,
                file_path=path,
                co_change_partners_json=json.dumps(partners),
            )
        await session.commit()
    return repo_id


async def test_graph_filters_and_stamps_cross_area(app, client):
    repo_id = await _seed(app, client)
    url = f"/api/repos/{repo_id}/coupling"
    whole = (await client.get(url)).json()
    assert whole["total_edges"] == 4 and whole["depth"] == 2
    cross = {(e["source"], e["target"]): e["cross_area"] for e in whole["edges"]}
    assert cross[("src/ui/a.ts", "src/ui/c.ts")] is False
    assert cross[("src/ui/a.ts", "src/web/b.ts")] is True

    hidden = (
        await client.get(url, params={"unexplained": True, "exclude_tests": True})
    ).json()
    assert [(e["source"], e["target"]) for e in hidden["edges"]] == [
        ("src/ui/a.ts", "src/web/b.ts")
    ]
    assert hidden["total_edges"] == 1 and hidden["coupled_files"] == 2

    between = (
        await client.get(url, params={"area": "src/core", "partner": "src/web"})
    ).json()
    assert [(e["source"], e["target"]) for e in between["edges"]] == [
        ("src/core/x.py", "src/web/b.ts")
    ]
    assert (await client.get(url, params={"min_support": 3})).json()["total_edges"] == 3


async def test_area_pairs_rank_unexplained_first(app, client):
    repo_id = await _seed(app, client)
    out = (
        await client.get(
            f"/api/repos/{repo_id}/coupling/areas",
            params={"cross_area": True, "exclude_tests": True, "depth": 2},
        )
    ).json()
    assert out["depth"] == 2 and out["root"] == ""
    assert out["totals"] == {
        "pairs": 2,
        "cross_area_pairs": 2,
        "unexplained_pairs": 1,
        "area_pairs": 2,
        "unexplained_area_pairs": 1,
    }
    first = out["area_pairs"][0]
    assert (first["source"], first["target"], first["unexplained_share"]) == (
        "src/ui",
        "src/web",
        1.0,
    )
    assert first["top_pairs"][0]["structural"] == "unexplained"
    missing = await client.get("/api/repos/nope/coupling/areas")
    assert missing.status_code == 404


async def test_area_card_lists_the_areas_it_changes_with(app, client):
    repo_id = await _seed(app, client)
    card = (await client.get(f"/api/repos/{repo_id}/areas/src/ui")).json()
    assert [(c["path"], c["pairs"], c["unexplained_pairs"]) for c in card["coupled_areas"]] == [
        ("src/web", 1, 1)
    ]
    # The test partner is left out, so the core card lists web alone.
    core = (await client.get(f"/api/repos/{repo_id}/areas/src/core")).json()
    assert [c["path"] for c in core["coupled_areas"]] == ["src/web"]
