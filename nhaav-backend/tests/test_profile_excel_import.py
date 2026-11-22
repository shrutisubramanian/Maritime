"""
Focused tests for the Excel profile import.

The importer is a convenience layer over the EXISTING profile: it parses a
workbook into a preview, and the normal ``PUT /profiles/me`` flow applies the
values. These tests pin that contract (no new storage, no save-on-upload) plus
the validation behaviour vendors depend on.
"""
import io
import secrets
import zipfile
from datetime import datetime

import openpyxl
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.database import Base, get_db
from app.main import app
from app.models.profile import Profile
from app.models.rate_limit_event import RateLimitEvent
from app.models.user import User, UserRole
from app.models.vendor_category import VendorCategory, VendorSubcategory, VendorType
from app.services.profile_excel_import import TEMPLATE_COLUMNS, TEMPLATE_HEADERS
from app.services.rate_limit_service import RateLimitService
from app.utils.password import hash_password

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_profile_excel_import.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

USER_EMAIL = "excel_import_vendor@nhaav.com"
SUPPLIER_EMAIL = "excel_import_supplier@nhaav.com"
PASSWORD = "Password123!"

HEADERS = [
    "Primary Business Category",
    "Other Business Categories",
    "Head Office",
    "Phone Number",
    "Other Ports They Are Available In",
    "Social Links",
    "Company Registration Number",
    "Email",
    "Address",
]

VALID_ROW = [
    "Ship Repair & Services",
    "Marine Equipment, Safety Equipment",
    "Mumbai",
    "+91 98765 43210",
    "Chennai, Kochi",
    "https://linkedin.com/company/example, https://instagram.com/example",
    "U12345MH2015PTC123456",
    "company@example.com",
    "Unit 5, Harbour Road, Mumbai 400001",
]


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _reset_import_rate_limits():
    """The import routes are rate limited per user: each test starts with a
    clear counter, so the suite tests the importer, not its own request volume."""
    db = TestingSessionLocal()
    try:
        db.query(RateLimitEvent).delete()
        db.commit()
    finally:
        db.close()
    yield


@pytest.fixture(scope="module", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db

    db = TestingSessionLocal()
    try:
        user = User(
            email=USER_EMAIL,
            password_hash=hash_password(PASSWORD),
            role=UserRole.provider,
            full_name="Excel Import Vendor",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        db.add(
            Profile(
                user_id=user.id,
                company_name="Excel Import Ltd",
                contacts=[],
                offices=[],
                ports_served=[],
                social_links={},
                profile_metadata={},
            )
        )

        # A provider category with capabilities, as an admin would create it.
        category = VendorCategory(
            vendor_type=VendorType.provider,
            name="Ship Repair & Services",
            created_by=user.id,
            sort_order=0,
        )
        db.add(category)
        db.flush()
        for name in ("Marine Equipment", "Safety Equipment", "UWILD"):
            db.add(VendorSubcategory(category_id=category.id, name=name))

        # A second category, so "other categories" can legitimately be a whole
        # category the account is not primarily filed under.
        second = VendorCategory(
            vendor_type=VendorType.provider,
            name="Inspections & Surveys",
            created_by=user.id,
            sort_order=1,
        )
        db.add(second)
        db.flush()
        db.add(VendorSubcategory(category_id=second.id, name="Cargo Survey"))

        # A supply provider with two categories, for the "Ship Chandlers plus
        # Paints" case: a company can *also* work in a category it is not filed
        # under, without changing how the marketplace files it.
        supplier = User(
            email=SUPPLIER_EMAIL,
            password_hash=hash_password(PASSWORD),
            role=UserRole.supplier,
            full_name="Excel Import Supplier",
        )
        db.add(supplier)
        db.commit()
        db.refresh(supplier)
        db.add(
            Profile(
                user_id=supplier.id,
                company_name="Harbour Supply Co",
                contacts=[],
                offices=[],
                ports_served=[],
                social_links={},
                profile_metadata={},
            )
        )
        for index, name in enumerate(("Ship Chandlers", "Paints")):
            db.add(
                VendorCategory(
                    vendor_type=VendorType.supplier,
                    name=name,
                    created_by=supplier.id,
                    sort_order=index,
                )
            )
        db.commit()
    finally:
        db.close()

    yield
    app.dependency_overrides.pop(get_db, None)


client = TestClient(app)


@pytest.fixture(scope="module")
def token():
    response = client.post("/auth/login", json={"email": USER_EMAIL, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


@pytest.fixture(scope="module")
def supplier_token():
    response = client.post("/auth/login", json={"email": SUPPLIER_EMAIL, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _workbook(rows: list[list[str]], sheet_title: str = "Company Profile") -> bytes:
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.title = sheet_title
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _preview_as(token: str, data: bytes, filename: str = "profile.xlsx"):
    return _preview(token, data, filename)


def _preview(token: str, data: bytes, filename: str = "profile.xlsx"):
    return client.post(
        "/profiles/me/import-excel",
        headers=_auth(token),
        files={
            "file": (
                filename,
                data,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )


def _profile(token: str) -> dict:
    response = client.get("/profiles/me", headers=_auth(token))
    assert response.status_code == 200, response.text
    return response.json()


def _field(body: dict, key: str) -> dict:
    return next(f for f in body["fields"] if f["key"] == key)


def _ui_payload(token: str, values: dict) -> dict:
    """The exact PUT body handleExcelImportConfirm builds.

    Kept separate from the request so the contract can be asserted directly: a
    list is included ONLY when the import supplied values, because an empty list
    is an explicit "clear" to the server.
    """
    current = _profile(token)
    contacts = list(current.get("contacts") or [])
    first = dict(contacts[0]) if contacts and isinstance(contacts[0], dict) else {}
    if values.get("phone"):
        first["phone"] = values["phone"]
    if values.get("email"):
        first["email"] = values["email"]
    if first:
        contacts = [first] + contacts[1:]

    meta = dict(current.get("profile_metadata") or {})
    if values.get("registration_number"):
        meta["regNumber"] = values["registration_number"]
    if values.get("address"):
        meta["address"] = values["address"]

    social = dict(current.get("social_links") or {})
    social.update(values.get("social_links") or {})

    payload: dict = {"contacts": contacts, "social_links": social}
    if values.get("registration_number") or values.get("address"):
        payload["profile_metadata"] = meta
    if values.get("primary_category"):
        payload["primary_category"] = values["primary_category"]
        # Exactly what the UI sends: each list only when the import filled it,
        # because an empty list means "clear" to the server.
        if values.get("other_categories"):
            payload["subcategories"] = values["other_categories"]
        if values.get("additional_categories"):
            payload["additional_categories"] = values["additional_categories"]
    if values.get("head_office"):
        payload["head_office"] = values["head_office"]
    if values.get("other_ports"):
        payload["ports_served"] = values["other_ports"]
    return payload


def _apply(token: str, values: dict) -> None:
    """The save the UI performs after confirmation — the existing endpoint."""
    response = client.put(
        "/profiles/me", headers=_auth(token), json=_ui_payload(token, values)
    )
    assert response.status_code == 200, response.text


# --------------------------------------------------------------------------- #
# 1-3. Field coverage and required/optional handling
# --------------------------------------------------------------------------- #
def test_valid_excel_with_all_nine_fields(token):
    response = _preview(token, _workbook([HEADERS, VALID_ROW]))
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["fields_found"] == 9
    assert body["can_confirm"] is True
    assert body["issues"] == []
    assert body["values"]["primary_category"] == "Ship Repair & Services"
    assert body["values"]["head_office"] == "Mumbai"
    assert body["values"]["registration_number"] == "U12345MH2015PTC123456"
    assert body["values"]["email"] == "company@example.com"
    assert body["values"]["address"] == "Unit 5, Harbour Road, Mumbai 400001"
    assert all(field["status"] != "review" for field in body["fields"])


def test_missing_required_field_blocks_confirmation(token):
    row = list(VALID_ROW)
    row[2] = ""  # Head Office, one of the only two required fields
    response = _preview(token, _workbook([HEADERS, row]))
    assert response.status_code == 200, response.text
    body = response.json()

    head_office = _field(body, "head_office")
    assert head_office["status"] == "missing"
    assert head_office["required_missing"] is True
    assert body["can_confirm"] is False


def test_optional_field_missing_is_not_an_error(token):
    row = list(VALID_ROW)
    row[1] = ""  # Other business categories
    row[4] = ""  # Other ports
    row[5] = ""  # Social links
    response = _preview(token, _workbook([HEADERS, row]))
    body = response.json()

    for key in ("other_categories", "other_ports", "social_links"):
        assert _field(body, key)["status"] == "not_provided"
    assert body["can_confirm"] is True
    assert body["fields_found"] == 6


# --------------------------------------------------------------------------- #
# 4-6. Multi-value fields
# --------------------------------------------------------------------------- #
def test_multiple_business_categories(token):
    body = _preview(token, _workbook([HEADERS, VALID_ROW])).json()
    assert body["values"]["other_categories"] == ["Marine Equipment", "Safety Equipment"]


def test_multiple_ports(token):
    body = _preview(token, _workbook([HEADERS, VALID_ROW])).json()
    # "Kochi" is an alias of the canonical "Cochin" port.
    assert body["values"]["other_ports"] == ["Chennai", "Cochin"]


def test_multiple_social_links(token):
    body = _preview(token, _workbook([HEADERS, VALID_ROW])).json()
    links = body["values"]["social_links"]
    assert links["linkedin"] == "https://linkedin.com/company/example"
    assert links["instagram"] == "https://instagram.com/example"


# --------------------------------------------------------------------------- #
# 7-9. Normalisation and review
# --------------------------------------------------------------------------- #
def test_category_normalization(token):
    row = list(VALID_ROW)
    row[0] = "  ship   repair & SERVICES "
    row[1] = " marine   EQUIPMENT "
    body = _preview(token, _workbook([HEADERS, row])).json()

    assert body["values"]["primary_category"] == "Ship Repair & Services"
    assert body["values"]["other_categories"] == ["Marine Equipment"]
    assert body["can_confirm"] is True


def test_port_normalization_uses_canonical_resolver(token):
    row = list(VALID_ROW)
    row[2] = "mumbai"
    row[4] = "Mumbai (Maharashtra) - Major, kochi"
    body = _preview(token, _workbook([HEADERS, row])).json()

    assert body["values"]["head_office"] == "Mumbai"
    assert body["values"]["other_ports"] == ["Cochin"]


def test_unrecognized_category_requires_review(token):
    row = list(VALID_ROW)
    row[0] = "Marine Engine Works"
    body = _preview(token, _workbook([HEADERS, row])).json()

    assert body["can_confirm"] is False
    issue = next(i for i in body["issues"] if i["field"] == "primary_category")
    assert "couldn't recognise" in issue["message"]
    assert "Ship Repair & Services" in issue["allowed"]
    # The typed value is kept for editing, never silently mapped elsewhere.
    assert body["raw_values"]["primary_category"] == "Marine Engine Works"


def test_unknown_capability_is_flagged_against_the_primary(token):
    row = list(VALID_ROW)
    row[1] = "Marine Equipment, Paints"
    body = _preview(token, _workbook([HEADERS, row])).json()

    assert body["can_confirm"] is False
    issue = next(i for i in body["issues"] if i["field"] == "other_categories")
    assert "Paints" in issue["message"]
    assert "Marine Equipment" in issue["allowed"]


# --------------------------------------------------------------------------- #
# 10-12. Existing data, confirmation, and no save on upload
# --------------------------------------------------------------------------- #
def test_existing_profile_values_are_preserved_when_cells_are_empty(token):
    current = _profile(token)
    client.put(
        "/profiles/me",
        headers=_auth(token),
        json={
            "head_office": "Chennai",
            "ports_served": ["Mumbai"],
            "contacts": [{"name": "Ops", "phone": "+91 11111 11111", "email": "old@example.com"}],
            "offices": ["Old Office, Chennai"],
        },
    )

    row = list(VALID_ROW)
    row[4] = ""  # no other ports in the workbook
    body = _preview(token, _workbook([HEADERS, row])).json()

    assert _field(body, "other_ports")["status"] == "not_provided"
    # The UI never sends the empty optional field, so the stored ports survive.
    values = dict(body["values"])
    values.pop("other_ports")
    _apply(token, values)

    after = _profile(token)
    assert after["ports_served"] == ["Mumbai"]
    assert after["head_office"] == "Chennai" or after["head_office"] == "Mumbai"

    # leave the profile clean for the next test
    client.put(
        "/profiles/me",
        headers=_auth(token),
        json={"head_office": "", "ports_served": [], "offices": [], "contacts": []},
    )
    assert current  # sanity: the profile existed before the import


def test_imported_values_replace_existing_when_confirmed(token):
    client.put(
        "/profiles/me",
        headers=_auth(token),
        json={
            "head_office": "Chennai",
            "ports_served": ["Mumbai"],
            "contacts": [{"name": "Ops", "phone": "+91 11111 11111", "email": "old@example.com"}],
            "offices": ["Old Office, Chennai"],
        },
    )

    body = _preview(token, _workbook([HEADERS, VALID_ROW])).json()
    phone = _field(body, "phone")
    assert phone["action"] == "will_update"
    assert phone["current"] == "+91 11111 11111"
    assert body["has_existing"] is True
    assert "already contain information" in body["warning"]

    _apply(token, body["values"])
    after = _profile(token)

    assert after["head_office"] == "Mumbai"
    assert after["ports_served"] == ["Chennai", "Cochin"]
    assert after["contacts"][0]["phone"] == "+91 98765 43210"
    assert after["contacts"][0]["email"] == "company@example.com"
    assert after["profile_metadata"]["address"] == "Unit 5, Harbour Road, Mumbai 400001"
    # The Offices list keeps its own city/country entries untouched.
    assert after["offices"] == ["Old Office, Chennai"]
    assert after["profile_metadata"]["regNumber"] == "U12345MH2015PTC123456"
    assert after["primary_category_name"] == "Ship Repair & Services"
    assert after["subcategory_names"] == ["Marine Equipment", "Safety Equipment"]
    assert after["social_links"]["linkedin"] == "https://linkedin.com/company/example"


def test_upload_endpoint_does_not_save_profile_data(token):
    before = _profile(token)
    response = _preview(token, _workbook([HEADERS, VALID_ROW]))
    assert response.status_code == 200
    after = _profile(token)

    # A preview writes nothing, not even the required values it resolved.
    assert after["head_office"] == before["head_office"]
    assert after["updated_at"] == before["updated_at"]


# --------------------------------------------------------------------------- #
# 13-15. Untrusted input
# --------------------------------------------------------------------------- #
def test_non_xlsx_upload_is_rejected(token):
    for filename in ("profile.csv", "profile.xls", "profile.txt"):
        response = _preview(token, b"a,b,c", filename=filename)
        assert response.status_code == 400, filename
        assert response.json()["detail"]["code"] == "unsupported_file_type"


def test_missing_required_columns_is_rejected(token):
    headers = [h for h in HEADERS if h != "Head Office"]
    response = _preview(token, _workbook([headers, ["Ship Repair & Services", "", "1", "", "", "R"]]))
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["code"] == "missing_columns"
    assert "Head Office" in detail["message"]


def test_oversized_workbook_is_rejected(token):
    # Incompressible filler, so the stored .xlsx really is over the 2 MB cap
    # (a sheet of repeated characters zips down to a few KB).
    rows = [HEADERS] + [["Ship Repair & Services"]] + [
        [secrets.token_hex(250)] for _ in range(9000)
    ]
    data = _workbook(rows)
    assert len(data) > 2 * 1024 * 1024, len(data)

    response = _preview(token, data)
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "file_too_large"


def test_macro_workbook_is_rejected(token):
    data = _workbook([HEADERS, VALID_ROW])
    buffer = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as source, zipfile.ZipFile(buffer, "w") as target:
        for item in source.namelist():
            target.writestr(item, source.read(item))
        target.writestr("xl/vbaProject.bin", b"fake macro bytes")

    response = _preview(token, buffer.getvalue())
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "macro_not_allowed"


def test_formula_cells_are_not_evaluated(token):
    row = list(VALID_ROW)
    row[8] = "=1+1"  # Address as a formula, with no cached value
    data = _workbook([HEADERS, row])

    response = _preview(token, data)
    assert response.status_code == 200, response.text
    body = response.json()

    address = _field(body, "address")
    # openpyxl never runs formulas: no cached result means an empty cell.
    assert address["imported"] is None
    # Address is optional, so the empty cell is reported but never blocks.
    assert address["status"] == "not_provided"
    assert body["can_confirm"] is True


def test_wide_template_with_numbered_columns_is_supported(token):
    headers = [
        "Sr.", "Company Name *", "Company Type *", "Primary Business Category *",
        "Price for Primary Category (INR)", "Other Business Category 1",
        "Other Business Category 2", "Head Office (Port) *", "Other Port 1",
        "Other Port 2", "Phone Number *", "Email *", "Address *",
        "Company Registration No. *", "LinkedIn (optional)", "Instagram (optional)",
    ]
    row = [
        "1", "Example Marine Services Pvt Ltd", "Service Provider",
        "Hull & Underwater", "25000", "UWILD", "",
        "Mumbai (Maharashtra) - Major", "JNPT (Maharashtra) - Major", "",
        "+91 98765 43210", "wide@example.com", "Ballard Estate, Mumbai",
        "U12345MH2015PTC123456", "https://linkedin.com/company/wide", "",
    ]
    # A company whose NAME merely starts with "Example" is a real company: only
    # the category cell decides whether a row is the template's sample row.
    data = _workbook([["Company Onboarding Template"], [], headers, row], sheet_title="Company Data")
    response = _preview(token, data)
    assert response.status_code == 200, response.text
    assert response.json()["values"]["company_name"] == "Example Marine Services Pvt Ltd"

    row[1] = "Real Vendor Pvt Ltd"
    data = _workbook([["Company Onboarding Template"], [], headers, row], sheet_title="Company Data")
    response = _preview(token, data)
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["values"]["head_office"] == "Mumbai"
    assert body["values"]["social_links"]["linkedin"] == "https://linkedin.com/company/wide"


def test_wide_template_imports_matching_extra_columns_and_reports_ignored(token):
    headers = [
        "Sr.", "Company Name *", "Company Type *", "Primary Business Category *",
        "Price for Primary Category (INR)", "Other Business Category 1",
        "Head Office (Port) *", "Phone Number *", "Email *", "Address *",
        "Company Registration No. *",
    ]
    row = [
        "1", "Harbourline Marine Pvt Ltd", "Service Provider",
        "Ship Repair & Services", "25000", "UWILD",
        "Mumbai (Maharashtra) - Major", "+91 98400 12345", "ops@harbourline.example",
        "12 Dock Road, Mumbai 400001", "U12345MH2019PTC654321",
    ]
    body = _preview(token, _workbook([headers, row])).json()

    # Company Name is a real profile field, so it carries over.
    assert {(e["key"], e["value"]) for e in body["extras"]} == {
        ("company_name", "Harbourline Marine Pvt Ltd"),
    }
    assert body["values"]["company_name"] == "Harbourline Marine Pvt Ltd"

    # Price has no profile field and says so, instead of disappearing.
    ignored = {c["column"]: c["reason"] for c in body["ignored_columns"]}
    assert "Price for Primary Category (INR)" in ignored
    assert "Pricing is set per marketplace listing" in ignored["Price for Primary Category (INR)"]
    assert "Sr." in ignored
    # Company Type is the account role (shown on the profile page), not a column
    # the workbook may overwrite.
    assert "Company Type *" in ignored
    assert "account type" in ignored["Company Type *"]


# --------------------------------------------------------------------------- #
# Editing without re-uploading the workbook
# --------------------------------------------------------------------------- #
def test_edited_values_are_revalidated_without_reupload(token):
    row = list(VALID_ROW)
    row[0] = "Marine Engine Works"
    first = _preview(token, _workbook([HEADERS, row])).json()
    assert first["can_confirm"] is False

    response = client.post(
        "/profiles/me/import-excel/validate",
        headers=_auth(token),
        json={
            "primary_category": "Ship Repair & Services",
            "other_categories": "Marine Equipment, Safety Equipment",
            "head_office": "Mumbai",
            "phone": "+91 98765 43210",
            "other_ports": "Chennai, Kochi",
            "social_links": "https://linkedin.com/company/example",
            "registration_number": "U12345MH2015PTC123456",
            "email": "company@example.com",
            "address": "Unit 5, Harbour Road, Mumbai 400001",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["can_confirm"] is True
    assert body["values"]["primary_category"] == "Ship Repair & Services"
    assert body["values"]["other_ports"] == ["Chennai", "Cochin"]


def test_edited_values_still_blocked_when_still_unknown(token):
    response = client.post(
        "/profiles/me/import-excel/validate",
        headers=_auth(token),
        json={
            "primary_category": "Marine Engine Works",
            "head_office": "Atlantis",
            "phone": "+91 98765 43210",
            "email": "company@example.com",
            "registration_number": "U12345MH2015PTC123456",
            "address": "Mumbai",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["can_confirm"] is False
    assert {issue["field"] for issue in body["issues"]} == {"primary_category", "head_office"}


# --------------------------------------------------------------------------- #
# Template download
# --------------------------------------------------------------------------- #
def test_template_download_has_the_full_column_set(token):
    response = client.get("/profiles/me/import-excel/template", headers=_auth(token))
    assert response.status_code == 200
    assert "spreadsheetml.sheet" in response.headers["content-type"]
    assert "attachment" in response.headers["content-disposition"]

    workbook = openpyxl.load_workbook(io.BytesIO(response.content), data_only=True)
    sheet = workbook.worksheets[0]
    assert sheet.title == "Company Profile"
    headers = [cell.value for cell in sheet[1]]
    assert headers == TEMPLATE_HEADERS
    # The sample row is clearly marked and skipped by the importer.
    assert "EXAMPLE ROW" in str(sheet["A2"].value)


def test_template_carries_dropdowns_for_categories_and_ports(token):
    response = client.get("/profiles/me/import-excel/template", headers=_auth(token))
    workbook = openpyxl.load_workbook(io.BytesIO(response.content), data_only=True)
    sheet = workbook.worksheets[0]

    validations = {dv.sqref.__str__(): dv for dv in sheet.data_validations.dataValidation}
    category_validation = next(dv for scope, dv in validations.items() if scope.startswith("A2"))
    assert category_validation.formula1 == "ServiceCategoryList"

    port_validation = next(
        dv for scope, dv in validations.items()
        if scope.startswith("C2") and "E2" in scope
    )
    assert port_validation.formula1 == "PortList"

    # The lists live on a hidden sheet, reachable only through named ranges.
    assert "Lists" in workbook.sheetnames
    assert workbook["Lists"].sheet_state == "hidden"
    assert {"ServiceCategoryList", "SupplyCategoryList", "PortList"} <= set(
        workbook.defined_names
    )


def test_template_category_lists_match_the_vendor_taxonomy(token):
    response = client.get("/profiles/me/import-excel/template", headers=_auth(token))
    workbook = openpyxl.load_workbook(io.BytesIO(response.content), data_only=True)
    lists = workbook["Lists"]
    service_values = [cell.value for cell in lists["A"] if cell.value]
    supply_values = [cell.value for cell in lists["B"] if cell.value]

    for service in (
        "Ship Repair & Services", "Inspections & Surveys",
        "Cleaning / Port / Marine Support", "General Ship Repairs / Marine Services",
        "Machinery Repairs", "Deslopping and Desludging Services",
        "Fresh Water Supply",
    ):
        assert service in service_values
    assert "Decking & Desludging Services" not in service_values

    for supply in (
        "Ship Chandlers", "Lubricating Oils/Greases", "Deck Stores",
        "PPE", "Provisions", "Tools & Consumables",
    ):
        assert supply in supply_values


def test_full_template_row_imports_every_column(token):
    row = [
        "Ship Repair & Services",
        "Marine Equipment, Safety Equipment",
        "Mumbai",
        "+91 98765 43210",
        "Chennai, Kochi",
        "https://linkedin.com/company/harbourline, https://instagram.com/harbourline",
        "U12345MH2015PTC123456",
        "company@example.com",
        "Unit 5, Harbour Road, Mumbai 400001",
    ]
    response = _preview(token, _workbook([TEMPLATE_HEADERS, row]))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["issues"] == [], body["issues"]
    assert body["can_confirm"] is True
    assert body["values"]["primary_category"] == "Ship Repair & Services"
    assert body["values"]["other_categories"] == ["Marine Equipment", "Safety Equipment"]
    assert body["values"]["head_office"] == "Mumbai"
    assert body["values"]["other_ports"] == ["Chennai", "Cochin"]  # canonical name
    assert set(body["values"]["social_links"]) >= {"linkedin", "instagram"}
    assert body["values"]["email"] == "company@example.com"
    assert body["values"]["address"] == "Unit 5, Harbour Road, Mumbai 400001"
    # The nine-column template has no ignored columns: nothing is dropped.
    assert body["ignored_columns"] == []


def test_other_category_column_that_is_a_whole_category_is_stored(token):
    """'Other business categories' can name whole categories, not just capabilities."""
    row = list(VALID_ROW)
    row[1] = "Marine Equipment, Inspections & Surveys"
    body = _preview(token, _workbook([HEADERS, row])).json()

    assert body["issues"] == [], body["issues"]
    assert body["can_confirm"] is True
    # The capability stays a capability; the separate category is kept as an
    # additional category, and the primary is unchanged.
    assert body["values"]["primary_category"] == "Ship Repair & Services"
    assert body["values"]["other_categories"] == ["Marine Equipment"]
    assert body["values"]["additional_categories"] == ["Inspections & Surveys"]


def test_primary_category_listed_again_is_not_duplicated(token):
    row = list(VALID_ROW)
    row[1] = "Marine Equipment, Ship Repair & Services"
    body = _preview(token, _workbook([HEADERS, row])).json()

    assert body["values"]["additional_categories"] == []
    assert body["values"]["other_categories"] == ["Marine Equipment"]


# --------------------------------------------------------------------------- #
# Additional (other) business categories
# --------------------------------------------------------------------------- #
def test_supplier_can_store_and_publish_several_business_categories(supplier_token):
    """Ship Chandlers + Paints: stored, published, and still filed under one."""
    save = client.put(
        "/profiles/me",
        headers=_auth(supplier_token),
        json={
            "primary_category": "Ship Chandlers",
            "additional_categories": ["Paints"],
        },
    )
    assert save.status_code == 200, save.text
    assert save.json()["profile_metadata"]["additional_categories"] == ["Paints"]

    me = client.get("/profiles/me", headers=_auth(supplier_token)).json()
    public = client.get(f"/profiles/by-user/{me['user_id']}/public")
    assert public.status_code == 200, public.text
    body = public.json()
    assert body["primary_category_name"] == "Ship Chandlers"
    assert body["additional_categories"] == ["Paints"]


def test_supplier_import_files_other_categories_as_additional(supplier_token):
    """The sheet's 'Other Business Category' cells accept whole categories."""
    row = [
        "Ship Chandlers", "Paints", "Mumbai", "+91 98765 43210", "",
        "", "U12345MH2015PTC123456", "ops@harboursupply.example",
        "Unit 2, Ballard Estate, Mumbai 400001",
    ]
    body = _preview_as(supplier_token, _workbook([TEMPLATE_HEADERS, row])).json()

    assert body["issues"] == [], body["issues"]
    assert body["can_confirm"] is True
    assert body["values"]["primary_category"] == "Ship Chandlers"
    assert body["values"]["additional_categories"] == ["Paints"]
    assert body["values"]["other_categories"] == []


def test_additional_categories_do_not_change_marketplace_filing(supplier_token):
    """Discovery stays keyed on the primary category only."""
    from app.services.vendor_taxonomy_service import VendorTaxonomyService

    db = TestingSessionLocal()
    try:
        user = db.query(User).filter(User.email == SUPPLIER_EMAIL).first()
        profile = db.query(Profile).filter(Profile.user_id == user.id).first()
        filed_under = VendorTaxonomyService.effective_category_names(db, profile, user)
    finally:
        db.close()

    assert filed_under == ["Ship Chandlers"]
    assert "Paints" not in filed_under


def test_primary_category_cannot_be_repeated_as_an_extra(supplier_token):
    save = client.put(
        "/profiles/me",
        headers=_auth(supplier_token),
        json={
            "primary_category": "Ship Chandlers",
            "additional_categories": ["Ship Chandlers", "  "],
        },
    )
    assert save.status_code == 200, save.text
    assert save.json()["profile_metadata"].get("additional_categories", []) == []


def test_unknown_additional_category_is_rejected(supplier_token):
    save = client.put(
        "/profiles/me",
        headers=_auth(supplier_token),
        json={"additional_categories": ["Submarine Sandwich Shop"]},
    )
    assert save.status_code == 400, save.text
    assert save.json()["detail"]["code"] == "unknown_additional_category"


def test_service_name_as_primary_category_resolves_to_its_group(token):
    headers = [
        "Primary Business Category", "Head Office", "Phone Number", "Email", "Address",
        "Company Registration Number",
    ]
    row = [
        "UWILD", "Mumbai", "+91 98765 43210", "ops@harbourline.example",
        "Unit 5, Harbour Road, Mumbai 400001", "U12345MH2015PTC123456",
    ]
    body = _preview(token, _workbook([headers, row])).json()
    assert body["issues"] == [], body["issues"]
    assert body["values"]["primary_category"] == "Ship Repair & Services"
    # The service the vendor named is kept as a capability under that group.
    assert body["values"]["other_categories"] == ["UWILD"]


def test_example_row_is_ignored(token):
    data = _workbook([HEADERS, VALID_ROW])
    template = client.get("/profiles/me/import-excel/template", headers=_auth(token)).content
    response = _preview(token, template)
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "no_data_row"

    assert data  # the explicit data workbook is the one that imports


def test_extras_survive_editing_the_review_form(token):
    """Editing a field must not silently drop the legacy extra columns."""
    headers = [
        "Company Name", "Company Type", "Primary Business Category",
        "Head Office", "Phone Number", "Email", "Address",
        "Company Registration Number",
    ]
    row = [
        "Harbourline Marine Pvt Ltd", "Service Provider", "Ship Repair & Services",
        "Mumbai", "+91 98400 12345", "ops@harbourline.example",
        "12 Dock Road, Mumbai 400001", "U12345MH2019PTC654321",
    ]
    first = _preview(token, _workbook([headers, row])).json()
    assert first["values"]["company_name"] == "Harbourline Marine Pvt Ltd"

    # The review form re-checks with the extra fields carried along.
    response = client.post(
        "/profiles/me/import-excel/validate",
        headers=_auth(token),
        json={
            "primary_category": first["values"]["primary_category"],
            "head_office": first["values"]["head_office"],
            "phone": "+91 98400 99999",
            "other_ports": "",
            "social_links": "",
            "registration_number": first["values"]["registration_number"],
            "email": first["values"]["email"],
            "address": first["values"]["address"],
            "company_name": "Harbourline Marine Pvt Ltd",
            "company_type": "Service Provider",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["can_confirm"] is True
    assert body["values"]["phone"] == "+91 98400 99999"
    assert {(e["key"], e["value"]) for e in body["extras"]} == {
        ("company_name", "Harbourline Marine Pvt Ltd"),
    }


def test_company_type_column_must_match_the_account_role(token):
    """A workbook may not relabel a service provider as a supplier."""
    headers = [
        "Company Name", "Company Type", "Primary Business Category",
        "Head Office", "Phone Number", "Email", "Address",
        "Company Registration Number",
    ]
    row = [
        "Harbourline Marine Pvt Ltd", "Supplier", "Ship Repair & Services",
        "Mumbai", "+91 98400 12345", "ops@harbourline.example",
        "12 Dock Road, Mumbai 400001", "U12345MH2019PTC654321",
    ]
    body = _preview(token, _workbook([headers, row])).json()

    assert any("account is a service provider" in w for w in body["warnings"])
    # The account's own taxonomy still validates the categories.
    assert body["values"]["primary_category"] == "Ship Repair & Services"


def test_social_hosts_are_classified_exactly(token):
    """'fox.com' is a website; only real X hosts count as twitter."""
    row = list(VALID_ROW)
    row[5] = "https://fox.com/acme, https://x.com/acme, https://www.linkedin.com/company/acme"
    body = _preview(token, _workbook([HEADERS, row])).json()

    links = body["values"]["social_links"]
    assert links["twitter"] == "https://x.com/acme"
    assert links["linkedin"] == "https://www.linkedin.com/company/acme"
    assert "https://fox.com/acme" in links.values()
    assert links.get("website") in (None, "https://fox.com/acme")


# --------------------------------------------------------------------------- #
# Import safety: blank cells, the nine-column contract, and edit round trips
# --------------------------------------------------------------------------- #
def test_template_is_exactly_the_nine_profile_columns(token):
    response = client.get("/profiles/me/import-excel/template", headers=_auth(token))
    workbook = openpyxl.load_workbook(io.BytesIO(response.content), data_only=True)
    headers = [cell.value for cell in workbook.worksheets[0][1]]

    assert len(headers) == 9
    assert [h.replace(" *", "") for h in headers] == [
        label for label, _key in TEMPLATE_COLUMNS
    ]
    # Only the two required fields are marked as required.
    assert [h for h in headers if h.endswith("*")] == [
        "Primary Business Category *",
        "Head Office *",
    ]


def test_supplier_template_offers_supplier_categories(supplier_token):
    response = client.get("/profiles/me/import-excel/template", headers=_auth(supplier_token))
    workbook = openpyxl.load_workbook(io.BytesIO(response.content), data_only=True)
    sheet = workbook.worksheets[0]
    category_validation = next(
        dv for dv in sheet.data_validations.dataValidation
        if str(dv.sqref).startswith("A2")
    )
    assert category_validation.formula1 == "SupplyCategoryList"


def test_optional_fields_omitted_entirely_are_confirmable(token):
    """A workbook with only the two required columns is a valid import."""
    headers = ["Primary Business Category", "Head Office"]
    response = _preview(token, _workbook([headers, ["Ship Repair & Services", "Mumbai"]]))
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["issues"] == [], body["issues"]
    assert body["can_confirm"] is True
    assert body["fields_found"] == 2
    assert _field(body, "email")["status"] == "not_provided"
    assert _field(body, "phone")["status"] == "not_provided"


def test_blank_optional_columns_do_not_block_confirmation(token):
    headers = [
        "Primary Business Category", "Other Business Categories", "Head Office",
        "Other Ports They Are Available In", "Social Links",
    ]
    row = ["Ship Repair & Services", "Marine Equipment", "Mumbai", "Chennai", ""]
    body = _preview(token, _workbook([headers, row])).json()

    assert body["issues"] == [], body["issues"]
    assert body["can_confirm"] is True
    for key in ("registration_number", "email", "address", "phone"):
        assert _field(body, key)["status"] == "not_provided", key


def test_ui_confirm_payload_keeps_existing_lists_when_cells_are_blank(token):
    """The real UI must not send `[]` for a list the workbook left blank.

    `_apply` mirrors handleExcelImportConfirm exactly: a list is included only
    when the import actually filled it.
    """
    save = client.put(
        "/profiles/me",
        headers=_auth(token),
        json={
            "primary_category": "Ship Repair & Services",
            "subcategories": ["Marine Equipment"],
            "additional_categories": ["Inspections & Surveys"],
        },
    )
    assert save.status_code == 200, save.text
    before = _profile(token)
    assert before["subcategory_names"] == ["Marine Equipment"]
    assert (before.get("profile_metadata") or {}).get("additional_categories") == [
        "Inspections & Surveys"
    ]

    row = list(VALID_ROW)
    row[1] = ""  # Other Business Categories left blank
    body = _preview(token, _workbook([HEADERS, row])).json()
    assert body["can_confirm"] is True
    assert body["values"]["other_categories"] == []
    assert body["values"]["additional_categories"] == []

    _apply(token, body["values"])

    after = _profile(token)
    assert after["subcategory_names"] == ["Marine Equipment"]
    assert (after.get("profile_metadata") or {}).get("additional_categories") == [
        "Inspections & Surveys"
    ]


def test_provided_lists_still_replace_existing_ones(token):
    """The fix must not stop an import that DOES name values from applying."""
    save = client.put(
        "/profiles/me",
        headers=_auth(token),
        json={"primary_category": "Ship Repair & Services", "subcategories": ["UWILD"]},
    )
    assert save.status_code == 200, save.text

    body = _preview(token, _workbook([HEADERS, VALID_ROW])).json()
    _apply(token, body["values"])

    after = _profile(token)
    assert after["subcategory_names"] == ["Marine Equipment", "Safety Equipment"]


def test_existing_other_ports_are_shown_as_unchanged(token):
    save = client.put(
        "/profiles/me", headers=_auth(token), json={"ports_served": ["Chennai", "Cochin"]}
    )
    assert save.status_code == 200, save.text

    row = list(VALID_ROW)
    row[4] = "Chennai, Cochin"
    body = _preview(token, _workbook([HEADERS, row])).json()

    field = _field(body, "other_ports")
    assert field["current"] == "Chennai, Cochin"
    assert field["imported"] == "Chennai, Cochin"
    assert field["status"] == "ok"
    assert field["action"] == "unchanged"


def test_category_classification_survives_an_edit_round_trip(token):
    row = list(VALID_ROW)
    row[1] = "Marine Equipment, Inspections & Surveys"
    first = _preview(token, _workbook([HEADERS, row])).json()
    assert first["values"]["other_categories"] == ["Marine Equipment"]
    assert first["values"]["additional_categories"] == ["Inspections & Surveys"]

    raw = first["raw_values"]
    response = client.post(
        "/profiles/me/import-excel/validate",
        headers=_auth(token),
        json={
            "primary_category": raw["primary_category"],
            "other_categories": ", ".join(raw["other_categories"]),
            "additional_categories": ", ".join(raw["additional_categories"]),
            "head_office": raw["head_office"],
            "phone": raw["phone"],
            "other_ports": ", ".join(raw["other_ports"]),
            "social_links": ", ".join(raw["social_links"]),
            "registration_number": raw["registration_number"],
            "email": raw["email"],
            "address": raw["address"],
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["issues"] == [], body["issues"]
    assert body["can_confirm"] is True
    assert body["values"]["other_categories"] == ["Marine Equipment"]
    assert body["values"]["additional_categories"] == ["Inspections & Surveys"]
    assert _field(body, "other_categories")["label"] == (
        "Capabilities Under Your Primary Category"
    )
    assert _field(body, "additional_categories")["label"] == "Other Business Categories"


def test_whole_category_in_the_capability_field_is_reported_not_moved(token):
    response = client.post(
        "/profiles/me/import-excel/validate",
        headers=_auth(token),
        json={
            "primary_category": "Ship Repair & Services",
            "other_categories": "Inspections & Surveys",
            "additional_categories": "",
            "head_office": "Mumbai",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["can_confirm"] is False
    assert body["values"]["additional_categories"] == []
    assert any(
        "whole business category" in issue["message"] for issue in body["issues"]
    ), body["issues"]


def test_example_in_a_normal_cell_does_not_discard_the_company(token):
    row = list(VALID_ROW)
    row[8] = "Example Wharf Road, Mumbai"  # Address
    body = _preview(token, _workbook([HEADERS, row])).json()

    assert body["values"]["address"] == "Example Wharf Road, Mumbai"


def test_social_link_containing_punctuation_is_kept_whole(token):
    row = list(VALID_ROW)
    row[5] = (
        "https://www.linkedin.com/company/acme?trk=abc,def, "
        "https://instagram.com/acme"
    )
    body = _preview(token, _workbook([HEADERS, row])).json()

    assert body["issues"] == [], body["issues"]
    links = body["values"]["social_links"]
    assert links["linkedin"] == "https://www.linkedin.com/company/acme?trk=abc,def"
    assert links["instagram"] == "https://instagram.com/acme"


def test_phone_text_is_rejected_and_email_case_is_preserved(token):
    row = list(VALID_ROW)
    row[3] = "PO Box 1234567"  # seven digits, but not a phone number
    body = _preview(token, _workbook([HEADERS, row])).json()
    assert _field(body, "phone")["status"] == "review"
    assert body["can_confirm"] is False

    row[3] = "+91 98765 43210"
    row[7] = "Ops@Example.com"
    body = _preview(token, _workbook([HEADERS, row])).json()
    assert body["issues"] == [], body["issues"]
    assert body["values"]["phone"] == "+91 98765 43210"
    assert body["values"]["email"] == "Ops@Example.com"
    assert _field(body, "email")["status"] == "ok"


def test_ignored_columns_are_reported_before_confirmation(token):
    headers = HEADERS + ["Price for Primary Category (INR)"]
    row = VALID_ROW + ["25000"]
    body = _preview(token, _workbook([headers, row])).json()

    assert [c["column"] for c in body["ignored_columns"]] == [
        "Price for Primary Category (INR)"
    ]


# --------------------------------------------------------------------------- #
# Hardening: zip-bomb guard and per-user rate limits
# --------------------------------------------------------------------------- #
def test_zip_bomb_workbook_is_rejected(token):
    """A small archive that expands past the cap is refused before parsing."""
    data = _workbook([HEADERS, VALID_ROW])
    buffer = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as source, zipfile.ZipFile(
        buffer, "w", zipfile.ZIP_DEFLATED
    ) as target:
        for item in source.namelist():
            target.writestr(item, source.read(item))
        target.writestr("xl/bomb.xml", b"\0" * (settings.PROFILE_IMPORT_MAX_UNCOMPRESSED_BYTES + 5))

    assert len(buffer.getvalue()) < 2 * 1024 * 1024

    response = _preview(token, buffer.getvalue())
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "workbook_too_large"


def test_workbook_with_too_many_parts_is_rejected(token):
    data = _workbook([HEADERS, VALID_ROW])
    buffer = io.BytesIO()
    with zipfile.ZipFile(io.BytesIO(data)) as source, zipfile.ZipFile(
        buffer, "w", zipfile.ZIP_DEFLATED
    ) as target:
        for item in source.namelist():
            target.writestr(item, source.read(item))
        for index in range(settings.PROFILE_IMPORT_MAX_ZIP_ENTRIES + 1):
            target.writestr(f"xl/pad{index}.xml", b"<x/>")

    response = _preview(token, buffer.getvalue())
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "workbook_too_large"


def test_preview_is_rate_limited_per_user(token, monkeypatch):
    monkeypatch.setattr(settings, "PROFILE_IMPORT_LIMIT", 2)
    RateLimitService._CATEGORIES = {}
    payload = _workbook([HEADERS, VALID_ROW])
    try:
        assert _preview(token, payload).status_code == 200
        assert _preview(token, payload).status_code == 200
        response = _preview(token, payload)
    finally:
        RateLimitService._CATEGORIES = {}

    assert response.status_code == 429
    detail = response.json()["detail"]
    assert detail["code"] == "rate_limit_exceeded"
    assert detail["category"] == "profile_import"
    assert "Retry-After" in response.headers


def test_validate_is_rate_limited_per_user(token, monkeypatch):
    monkeypatch.setattr(settings, "PROFILE_IMPORT_VALIDATE_LIMIT", 1)
    RateLimitService._CATEGORIES = {}
    payload = {
        "primary_category": "Ship Repair & Services",
        "head_office": "Mumbai",
    }
    try:
        first = client.post(
            "/profiles/me/import-excel/validate", headers=_auth(token), json=payload
        )
        response = client.post(
            "/profiles/me/import-excel/validate", headers=_auth(token), json=payload
        )
    finally:
        RateLimitService._CATEGORIES = {}

    assert first.status_code == 200, first.text
    assert response.status_code == 429
    assert response.json()["detail"]["category"] == "profile_import_validate"


def test_import_budgets_are_registered():
    limits = RateLimitService._categories()
    assert limits["profile_import"][0] == settings.PROFILE_IMPORT_LIMIT
    assert limits["profile_import_validate"][0] == settings.PROFILE_IMPORT_VALIDATE_LIMIT
    assert limits["profile_import"][2] == "user"


def test_ui_payload_omits_lists_the_workbook_did_not_provide(token):
    """Pins the payload shape itself, so a future "helpful" omission can't hide
    the blank-cell wipe again."""
    blank = {
        "primary_category": "Ship Repair & Services",
        "other_categories": [],
        "additional_categories": [],
        "head_office": "Mumbai",
    }
    payload = _ui_payload(token, blank)
    assert "subcategories" not in payload
    assert "additional_categories" not in payload

    filled = {
        "primary_category": "Ship Repair & Services",
        "other_categories": ["Marine Equipment"],
        "additional_categories": ["Inspections & Surveys"],
        "head_office": "Mumbai",
    }
    payload = _ui_payload(token, filled)
    assert payload["subcategories"] == ["Marine Equipment"]
    assert payload["additional_categories"] == ["Inspections & Surveys"]

