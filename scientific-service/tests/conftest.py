from pathlib import Path

import pytest


FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def silicon_cif() -> str:
    return (FIXTURES / "silicon.cif").read_text(encoding="utf-8")

