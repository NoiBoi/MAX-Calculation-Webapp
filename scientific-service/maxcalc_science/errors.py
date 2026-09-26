from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class ScientificError(Exception):
    code: str
    message: str
    status_code: int = 400
    detail: str | None = None

    def __str__(self) -> str:
        return self.message

