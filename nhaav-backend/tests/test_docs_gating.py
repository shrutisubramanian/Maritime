"""
OpenAPI documentation surface gating (deployment security gate, Finding B).

Production must not expose the API documentation surface: /docs (Swagger UI),
/redoc and /openapi.json are disabled *together* — disabling only the Swagger
page would leave the underlying OpenAPI schema publicly reachable.
Development/test keep the interactive docs. See DEPLOY_SECURITY_GATE.md.
"""
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import app, openapi_surface


class TestOpenapiSurfaceDecision:
    """The pure decision function behind the FastAPI kwargs."""

    def test_production_disables_all_three(self):
        urls = openapi_surface("production")
        assert urls == {"docs_url": None, "redoc_url": None, "openapi_url": None}

    def test_production_match_is_normalized(self):
        # "Production", " production " etc. must not sneak docs into prod.
        assert openapi_surface("Production")["openapi_url"] is None
        assert openapi_surface(" PRODUCTION ")["docs_url"] is None

    def test_development_keeps_all_three(self):
        urls = openapi_surface("development")
        assert urls == {
            "docs_url": "/docs",
            "redoc_url": "/redoc",
            "openapi_url": "/openapi.json",
        }

    def test_test_environment_keeps_all_three(self):
        # The suite itself runs with a non-production environment.
        assert openapi_surface("test")["docs_url"] == "/docs"


class TestDocumentationSurface:
    """End-to-end: the whole surface is up in dev/test and closed in prod."""

    def test_running_app_serves_docs_redoc_and_schema(self):
        client = TestClient(app)
        assert client.get("/docs").status_code == 200
        assert client.get("/redoc").status_code == 200
        assert client.get("/openapi.json").status_code == 200

    def test_production_app_serves_none_of_the_three(self):
        # Build a FastAPI app exactly the way main.py does in production and
        # prove all three paths are gone — guards against a typo'd kwarg
        # (e.g. doc_url) silently leaving the surface enabled.
        prod_app = FastAPI(title="prod", **openapi_surface("production"))
        client = TestClient(prod_app)
        assert client.get("/docs").status_code == 404
        assert client.get("/redoc").status_code == 404
        assert client.get("/openapi.json").status_code == 404
