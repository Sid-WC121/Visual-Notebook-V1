"""Domain layer — pure logic over Polars LazyFrames.

Holds the `History` tree and the `Operation` registry. Must not import
from `api`, `viz` (operations import viz, but only as a callable factory).
"""
