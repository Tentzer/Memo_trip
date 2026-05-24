"""Shared logging for Modal worker modules (stdout, consistent prefix)."""

from __future__ import annotations

import logging
import sys
import time
from contextlib import contextmanager
from typing import Iterator

_CONFIGURED = False


def configure_logging() -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
        stream=sys.stdout,
        force=True,
    )
    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    configure_logging()
    return logging.getLogger(name)


@contextmanager
def log_step(logger: logging.Logger, step: str, **fields: object) -> Iterator[None]:
    """Log step start/end with elapsed seconds; re-raises on failure."""
    extra = " ".join(f"{k}={v!r}" for k, v in fields.items())
    logger.info("step=%s status=start %s", step, extra)
    t0 = time.monotonic()
    try:
        yield
    except Exception:
        elapsed = time.monotonic() - t0
        logger.exception("step=%s status=error elapsed_s=%.2f %s", step, elapsed, extra)
        raise
    else:
        elapsed = time.monotonic() - t0
        logger.info("step=%s status=done elapsed_s=%.2f %s", step, elapsed, extra)
