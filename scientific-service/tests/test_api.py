from fastapi.testclient import TestClient

from maxcalc_science.main import app


client = TestClient(app)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_direct_cif_endpoint(silicon_cif: str):
    response = client.post("/v1/xrd/pattern/calculate", json={
        "cifContent": silicon_cif,
        "metadata": {"sourceType": "user-cif", "sourceId": "uploaded-silicon.cif"},
        "radiation": {"preset": "CuKa"},
        "twoThetaRange": {"minDeg": 10, "maxDeg": 90},
    })
    assert response.status_code == 200
    body = response.json()
    assert body["schemaVersion"] == "1.0.0"
    assert body["reference"]["sourceType"] == "user-cif"
    assert body["reflections"]


def test_api_does_not_expose_validation_stack_trace():
    response = client.post("/v1/xrd/pattern/calculate", json={})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_REQUEST"
    assert "traceback" not in response.text.lower()


def test_configured_service_token_is_required(monkeypatch):
    monkeypatch.setenv("MAXCALC_SERVICE_TOKEN", "test-service-secret")
    response = client.post("/v1/xrd/references/search", json={"codId": "7221324"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_experimental_parse_endpoint_preserves_hash_and_values():
    content = b"2theta,intensity\n10,100\n10.5,250\n11,125\n"
    response = client.post("/v1/xrd/data/parse", files={"file": ("sample.csv", content, "text/csv")}, data={"parserConfig": "{}"})
    assert response.status_code == 200
    body = response.json()
    assert body["rawArtifact"]["byteLength"] == len(content)
    assert body["measurement"]["twoThetaDeg"] == [10.0, 10.5, 11.0]
    assert body["measurement"]["intensity"] == [100.0, 250.0, 125.0]


def test_experimental_parse_endpoint_rejects_oversized_file(monkeypatch):
    monkeypatch.setenv("MAXCALC_XRD_MAX_UPLOAD_BYTES", "4")
    response = client.post("/v1/xrd/data/parse", files={"file": ("sample.xy", b"1 2\n2 3\n", "text/plain")})
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "XRD_FILE_TOO_LARGE"
