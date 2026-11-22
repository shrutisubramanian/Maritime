"""Deployment probes.

`/health` is liveness only; `/health/ready` additionally proves the configured
DATABASE_URL is reachable, which is what a deployer should gate traffic on.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_health_readiness.db")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("EMAIL_BACKEND", "console")

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_liveness_is_io_free():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readiness_confirms_the_database_answers():
    response = client.get("/health/ready")
    assert response.status_code == 200, response.text
    assert response.json() == {"status": "ready"}
