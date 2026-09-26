FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /service
COPY pyproject.toml ./
COPY maxcalc_science ./maxcalc_science
RUN python -m pip install --upgrade pip && python -m pip install .

RUN useradd --create-home --uid 10001 maxcalc
USER maxcalc
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"
CMD ["uvicorn", "maxcalc_science.main:app", "--host", "0.0.0.0", "--port", "8000"]

