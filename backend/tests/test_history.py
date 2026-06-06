"""Tests for the History tree (mandatory per architecture)."""

from __future__ import annotations

import polars as pl
import pytest

from visual_notebook.domain.history import History, State


@pytest.fixture
def root_lf() -> pl.LazyFrame:
    return pl.LazyFrame({"x": [1, 2, 3, 4, 5], "y": ["a", "b", "c", "d", "e"]})


@pytest.fixture
def history(root_lf: pl.LazyFrame) -> History:
    return History(root_lf, "Loaded: test.csv")


def test_root_state(history: History) -> None:
    assert history.current is history.root
    assert history.root.is_root
    assert history.root.parent is None
    assert history.root.children == []


def test_state_id_unique() -> None:
    lf = pl.LazyFrame({"x": [1]})
    a = State(lf=lf, description="a")
    b = State(lf=lf, description="b")
    assert a.id != b.id
    assert len(a.id) == 8


def test_apply_advances_current(history: History) -> None:
    new_state = history.apply(lambda lf: lf.filter(pl.col("x") > 2), "x > 2")
    assert history.current is new_state
    assert new_state.parent is history.root
    assert history.root.children == [new_state]


def test_count_lazy_and_cached(history: History) -> None:
    assert history.root._count_cache is None
    assert history.root.count == 5
    assert history.root._count_cache == 5


def test_count_after_filter(history: History) -> None:
    s = history.apply(lambda lf: lf.filter(pl.col("x") > 2), "x > 2")
    assert s.count == 3


def test_goto_moves_current_without_mutating_tree(history: History) -> None:
    s1 = history.apply(lambda lf: lf.filter(pl.col("x") > 1), "f1")
    s2 = history.apply(lambda lf: lf.filter(pl.col("x") > 2), "f2")
    history.goto(history.root.id)
    assert history.current is history.root
    assert history.root.children == [s1]
    assert s1.children == [s2]


def test_goto_unknown_raises(history: History) -> None:
    with pytest.raises(KeyError):
        history.goto("nope")


def test_branch_from_creates_sibling(history: History) -> None:
    s1 = history.apply(lambda lf: lf.filter(pl.col("x") > 1), "f1")
    history.apply(lambda lf: lf.filter(pl.col("x") > 2), "f2")
    new_branch = history.branch_from(
        history.root.id,
        lambda lf: lf.filter(pl.col("x") < 3),
        "x < 3",
    )
    assert new_branch.parent is history.root
    assert s1 in history.root.children
    assert new_branch in history.root.children
    assert len(history.root.children) == 2
    assert history.current is new_branch


def test_lineage_root_to_current(history: History) -> None:
    s1 = history.apply(lambda lf: lf.filter(pl.col("x") > 1), "f1")
    s2 = history.apply(lambda lf: lf.filter(pl.col("x") > 2), "f2")
    assert history.lineage() == [history.root, s1, s2]


def test_find_does_not_change_current(history: History) -> None:
    s1 = history.apply(lambda lf: lf.filter(pl.col("x") > 1), "f1")
    found = history.find(history.root.id)
    assert found is history.root
    assert history.current is s1


def test_all_states_returns_full_tree(history: History) -> None:
    s1 = history.apply(lambda lf: lf.filter(pl.col("x") > 1), "f1")
    history.goto(history.root.id)
    s2 = history.apply(lambda lf: lf.filter(pl.col("x") > 2), "f2")
    states = history.all_states()
    assert set(states) == {history.root, s1, s2}
