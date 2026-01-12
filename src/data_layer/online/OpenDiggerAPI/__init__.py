"""
OpenDiggerAPI package.

This package provides a minimal, standalone Python client for fetching
metrics from the OpenDigger OSS data service.
"""

from .client import OpenDiggerClient

__all__ = ['OpenDiggerClient']
