"""History — tree of `State` nodes with a single `current` cursor.

Branching: clicking an old chip and applying a different op creates a
new branch from that state instead of overwriting "the future".
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Callable

import polars as pl

OpFn = Callable[[pl.LazyFrame], pl.LazyFrame]


@dataclass(eq=False)
class State:
    lf: pl.LazyFrame
    description: str
    parent: "State | None" = None
    children: list["State"] = field(default_factory=list)
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:8])
    _count_cache: int | None = field(default=None, repr=False)

    @property
    def count(self) -> int:
        if self._count_cache is None:
            self._count_cache = int(self.lf.select(pl.len()).collect().item())
        return self._count_cache

    @property
    def is_root(self) -> bool:
        return self.parent is None


class History:
    def __init__(self, root_lf: pl.LazyFrame, root_description: str) -> None:
        self.root: State = State(lf=root_lf, description=root_description)
        self.current: State = self.root
        self._index: dict[str, State] = {self.root.id: self.root}

    def apply(self, op_fn: OpFn, description: str) -> State:
        new_lf = op_fn(self.current.lf)
        child = State(lf=new_lf, description=description, parent=self.current)
        self.current.children.append(child)
        self._index[child.id] = child
        self.current = child
        return child

    def goto(self, state_id: str) -> State:
        if state_id not in self._index:
            raise KeyError(f"Unknown state id: {state_id!r}")
        self.current = self._index[state_id]
        return self.current

    def branch_from(self, state_id: str, op_fn: OpFn, description: str) -> State:
        self.goto(state_id)
        return self.apply(op_fn, description)

    def lineage(self) -> list[State]:
        chain: list[State] = []
        node: State | None = self.current
        while node is not None:
            chain.append(node)
            node = node.parent
        chain.reverse()
        return chain

    def find(self, state_id: str) -> State:
        if state_id not in self._index:
            raise KeyError(f"Unknown state id: {state_id!r}")
        return self._index[state_id]

    def all_states(self) -> list[State]:
        result: list[State] = []
        stack: list[State] = [self.root]
        while stack:
            node = stack.pop()
            result.append(node)
            stack.extend(reversed(node.children))
        return result
