"""
Excel profile import: a convenience layer over the EXISTING company profile.

Vendors who already keep their company details in a spreadsheet can fill one
row of the Nhaav template and have the values mapped onto the profile fields
that already exist (`primary_category`, `subcategories`, `head_office`,
`ports_served`, `social_links`, `contacts`, `offices`, `profile_metadata`).

Nothing here invents storage or a second profile: this module only PARSES a
workbook and returns a preview. Saving goes through the normal
``PUT /profiles/me`` flow, so all existing profile validation (vendor
taxonomy, port catalogue, verification side effects) still applies.

The workbook is untrusted input: it is size-capped, read as data only
(openpyxl never evaluates formulas and macros are refused outright), and only
the recognised header row and first filled data row are read.
"""
import re
import uuid
import zipfile
from io import BytesIO
from typing import Any, Iterable, Optional
from urllib.parse import urlparse

from fastapi import HTTPException, status
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation
from sqlalchemy.orm import Session

from app.config import settings
from app.models.profile import Profile
from app.models.user import User, UserRole
from app.models.vendor_category import VendorType
from app.service_catalogue import LEGACY_SERVICE_NAMES, SERVICE_CATALOGUE
from app.services.port_catalogue_service import DEFAULT_PORTS, PortCatalogueService
from app.services.vendor_taxonomy_service import VendorTaxonomyService
from app.utils.file_signatures import is_safe_zip_bytes
from app.supplier_catalogue import SUPPLIER_PROFILE_CATEGORIES, SUPPLY_ITEM_CATEGORIES

#: Hard limits for an untrusted spreadsheet.
MAX_EXCEL_BYTES = 2 * 1024 * 1024      # 2 MB is far more than one company row
MAX_SHEET_ROWS = 200                   # rows scanned after the header row
MAX_HEADER_SCAN_ROWS = 15              # header row must appear near the top
MAX_VALUE_LENGTH = 300                 # per cell, after normalisation
MAX_MULTI_VALUES = 20                  # per multi-value field

#: The nine profile columns of the template, in template order. Nothing else is
#: part of the workbook contract; wider (legacy) sheets are still accepted
#: through the aliases below without adding new profile fields.
TEMPLATE_COLUMNS: list[tuple[str, str]] = [
    ("Primary Business Category", "primary_category"),
    ("Other Business Categories", "other_categories"),
    ("Head Office", "head_office"),
    ("Phone Number", "phone"),
    ("Other Ports They Are Available In", "other_ports"),
    ("Social Links", "social_links"),
    ("Company Registration Number", "registration_number"),
    ("Email", "email"),
    ("Address", "address"),
]

#: Review-form labels. The two category lists are named for what they store: the
#: "other business categories" cells end up either as capabilities under the
#: primary category or as additional whole categories, and the review form keeps
#: those apart so a value can never be moved from one to the other by an edit.
FIELD_LABELS: dict[str, str] = {
    "primary_category": "Primary Business Category",
    "other_categories": "Capabilities Under Your Primary Category",
    "additional_categories": "Other Business Categories",
    "head_office": "Head Office",
    "phone": "Phone Number",
    "other_ports": "Other Ports They Are Available In",
    "social_links": "Social Links",
    "registration_number": "Company Registration Number",
    "email": "Email",
    "address": "Address",
}

#: Only these two are required. Everything else may be left blank, and a blank
#: cell never touches what the profile already holds.
REQUIRED_FIELDS = {
    "primary_category",
    "head_office",
}

#: Header aliases. Keys are normalised headers (lowercase, punctuation
#: stripped, single spaces). The second group accepts the wider template some
#: vendors already use (one column per value) without changing what is stored.
HEADER_ALIASES: dict[str, str] = {
    "primary business category": "primary_category",
    "other business categories": "other_categories",
    "other business category": "other_categories",
    "head office": "head_office",
    "head office port": "head_office",
    "head office main port": "head_office",
    "phone number": "phone",
    "phone": "phone",
    "mobile number": "phone",
    "other ports they are available in": "other_ports",
    "other ports": "other_ports",
    "social links": "social_links",
    "social link": "social_links",
    "company registration number": "registration_number",
    "company registration no": "registration_number",
    "registration number": "registration_number",
    "registration no": "registration_number",
    "email": "email",
    "e mail": "email",
    "address": "address",
    "registered address": "address",
}

#: One-column-per-value headers from the wide template.
SOCIAL_COLUMN_HINTS = {
    "linkedin": "linkedin",
    "linkedin optional": "linkedin",
    "facebook": "facebook",
    "facebook optional": "facebook",
    "instagram": "instagram",
    "instagram optional": "instagram",
    "twitter": "twitter",
    "twitter x": "twitter",
    "other social": "other",
    "other socials": "other",
    "other social website optional": "other",
    "website": "website",
}

_NUMBERED_OTHER_CATEGORY = re.compile(r"^other business categor(?:y|ies) \d+$")
_NUMBERED_OTHER_PORT = re.compile(r"^other port \d+$")
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")

#: Columns the wider (legacy) vendor template adds that DO exist on the company
#: profile, so they are imported rather than dropped. They are extras, not part
#: of the official nine-column template.
EXTRA_HEADER_ALIASES: dict[str, str] = {
    "company name": "company_name",
}

EXTRA_LABELS: dict[str, str] = {
    "company_name": "Company Name",
}

#: Widths of the wider template's non-profile columns, explained in the preview
#: instead of being silently discarded.
IGNORED_REASONS: dict[str, str] = {
    "price for primary category inr": (
        "Pricing is set per marketplace listing, not on the company profile, so "
        "this column is not imported."
    ),
    "price for primary category": (
        "Pricing is set per marketplace listing, not on the company profile, so "
        "this column is not imported."
    ),
    "sr": "Row number, not profile information.",
    "company type": (
        "Your account type (service provider or supplier) is fixed when the "
        "account is created and decides which categories you can choose. Ask "
        "Nhaav to change it, so this column is not imported."
    ),
}

#: The workbook's Company Type column must agree with the account's role.
_COMPANY_TYPE_ROLES: dict[str, VendorType] = {
    "service provider": VendorType.provider,
    "service providers": VendorType.provider,
    "provider": VendorType.provider,
    "services": VendorType.provider,
    "supplier": VendorType.supplier,
    "suppliers": VendorType.supplier,
    "vendor": VendorType.supplier,
    "trader": VendorType.supplier,
}

DEFAULT_IGNORED_REASON = "Not one of the profile fields this import fills."

EXAMPLE_MARKER = "example row"
EXAMPLE_ROW_VALUE = "EXAMPLE ROW — overwrite or delete this row before uploading"

_HEADER_FILL = PatternFill("solid", fgColor="E8EEF7")
_EXAMPLE_FILL = PatternFill("solid", fgColor="F3F4F6")


# --------------------------------------------------------------------------- #
# Template
# --------------------------------------------------------------------------- #
#: The workbook layout, in template order. `*` marks a field the importer
#: requires; the header text still normalises to the aliases above.
TEMPLATE_HEADERS: list[str] = [
    "Primary Business Category *",
    "Other Business Categories",
    "Head Office *",
    "Phone Number",
    "Other Ports They Are Available In",
    "Social Links",
    "Company Registration Number",
    "Email",
    "Address",
]

#: How many data rows the dropdowns cover (the importer only reads the first
#: filled row, but a wide range means nobody has to copy validation down).
TEMPLATE_MAX_ROW = 200


def _provider_category_choices() -> list[str]:
    """Service-provider dropdown: each group name, then its services."""
    choices: list[str] = []
    for group, services in SERVICE_CATALOGUE:
        choices.append(group)
        choices.extend(
            name for name in services if name not in LEGACY_SERVICE_NAMES
        )
    return choices


def _supplier_category_choices() -> list[str]:
    """Supply-provider dropdown: profile categories, then item categories."""
    return [*SUPPLIER_PROFILE_CATEGORIES, *SUPPLY_ITEM_CATEGORIES]


def _port_choices(db: Optional[Session]) -> list[str]:
    if db is not None:
        try:
            names = [port.name for port in PortCatalogueService.list_ports(db)]
            if names:
                return names
        except Exception:  # pragma: no cover - never block a download
            pass
    return [name for name, _state, _kind, _aliases in DEFAULT_PORTS]


def _add_list_sheet(workbook: Workbook, choices: dict[str, list[str]]) -> dict[str, str]:
    """Write the dropdown sources to a hidden sheet and name each range."""
    sheet = workbook.create_sheet("Lists")
    ranges: dict[str, str] = {}
    for column, (name, values) in enumerate(choices.items(), start=1):
        for row, value in enumerate(values, start=1):
            sheet.cell(row=row, column=column, value=value)
        letter = get_column_letter(column)
        ranges[name] = f"Lists!${letter}$1:${letter}${max(len(values), 1)}"
    sheet.sheet_state = "hidden"
    return ranges


def build_template(
    db: Optional[Session] = None, user: Optional[User] = None
) -> bytes:
    """The single-row template vendors download and fill in.

    Nine columns, one per profile field, with dropdowns built from the account's
    own taxonomy (service providers get the service catalogue, supply providers
    the supply catalogue) and the live port catalogue, so a vendor can only pick
    a value the importer can resolve.
    """
    vendor_type: Optional[VendorType] = None
    if user is not None and user.role in (UserRole.provider, UserRole.supplier):
        vendor_type = VendorType(user.role.value)

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Company Profile"

    widths = {1: 34, 2: 34, 3: 18, 4: 22, 5: 34, 6: 46, 7: 26, 8: 26, 9: 44}
    for index, label in enumerate(TEMPLATE_HEADERS, start=1):
        cell = sheet.cell(row=1, column=index, value=label)
        cell.font = Font(bold=True, color="0D3B66")
        cell.fill = _HEADER_FILL
        cell.alignment = Alignment(vertical="center", wrap_text=True)
        sheet.column_dimensions[get_column_letter(index)].width = widths.get(index, 24)
    sheet.row_dimensions[1].height = 32

    example = [
        EXAMPLE_ROW_VALUE,
        "Machinery Repairs, Safety Equipment",
        "Mumbai",
        "+91 98765 43210",
        "Chennai, Kochi",
        "https://linkedin.com/company/example, https://instagram.com/example",
        "U12345MH2015PTC123456",
        "company@example.com",
        "Unit 5, Harbour Road, Mumbai 400001, Maharashtra",
    ]
    for index, value in enumerate(example, start=1):
        cell = sheet.cell(row=2, column=index, value=value)
        cell.fill = _EXAMPLE_FILL
        cell.font = Font(italic=True, color="6B7280")

    ranges = _add_list_sheet(
        workbook,
        {
            "ServiceCategoryList": _provider_category_choices(),
            "SupplyCategoryList": _supplier_category_choices(),
            "PortList": _port_choices(db),
        },
    )
    for name, target in ranges.items():
        workbook.defined_names[name] = DefinedName(name, attr_text=target)

    # The dropdown follows the account's own taxonomy: a supplier is never
    # offered service-provider categories (and the reverse).
    category = DataValidation(
        type="list",
        formula1=(
            "SupplyCategoryList" if vendor_type == VendorType.supplier
            else "ServiceCategoryList"
        ),
        allow_blank=True,
        errorTitle="Category",
        error="Pick a category from the dropdown list.",
        promptTitle="Business category",
        prompt="Pick from the list. Primary category is required; the rest are optional.",
    )
    ports = DataValidation(
        type="list",
        formula1="PortList",
        allow_blank=True,
        errorTitle="Port",
        error="Pick a port from the Nhaav list.",
        promptTitle="Port",
        prompt="Head office port is required. The other ports are optional.",
    )
    for validation in (category, ports):
        sheet.add_data_validation(validation)

    category.add(f"A2:A{TEMPLATE_MAX_ROW}")
    ports.add(f"C2:C{TEMPLATE_MAX_ROW}")
    ports.add(f"E2:E{TEMPLATE_MAX_ROW}")

    guide = workbook.create_sheet("How to fill this in")
    guide.column_dimensions["A"].width = 110
    lines = [
        "Nhaav company profile — how to fill this in",
        "",
        "1. Fill in ONE row (row 3). Delete the grey example row when you are done.",
        "2. Only two values are required: Primary Business Category and Head Office.",
        "3. Phone Number, Email, Address and Company Registration Number are optional — "
        "leave a cell empty and your profile keeps the value it already has.",
        "4. Separate multiple values with commas, for example: Chennai, Kochi",
        "5. Use the dropdowns where they appear; a value outside the list cannot be matched.",
        "6. Nothing is saved on upload: you review every value in Nhaav before confirming.",
    ]
    for row, line in enumerate(lines, start=1):
        cell = guide.cell(row=row, column=1, value=line)
        if row == 1:
            cell.font = Font(bold=True, size=13, color="0D3B66")

    sheet.freeze_panes = "A2"

    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _normalise_header(value: Any) -> str:
    text = re.sub(r"[^a-z0-9 ]+", " ", str(value or "").lower())
    return re.sub(r"\s+", " ", text).strip()


def _clean(value: Any) -> Optional[str]:
    """Whitespace-normalised cell text; empty cells become None."""
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = re.sub(r"\s+", " ", str(value)).strip()
    if not text:
        return None
    return text[:MAX_VALUE_LENGTH]


def _split_multi(values: Iterable[Optional[str]]) -> list[str]:
    """Comma-separated cells (and one-column-per-value sheets) -> list."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in values:
        if not raw:
            continue
        for part in re.split(r"[,\n;]", raw):
            item = re.sub(r"\s+", " ", part).strip()
            if not item:
                continue
            key = item.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(item)
            if len(out) >= MAX_MULTI_VALUES:
                return out
    return out


def _split_links(values: Iterable[Optional[str]]) -> list[str]:
    """Social links -> list of links, without cutting a URL in half.

    A URL may legally contain a comma or a semicolon (query strings), so a plain
    split would corrupt it. Links are separated by newlines, or by a comma that
    is immediately followed by the start of another link.
    """
    out: list[str] = []
    seen: set[str] = set()
    for raw in values:
        if not raw:
            continue
        for line in str(raw).splitlines():
            parts = re.split(r",\s*(?=(?:https?://|www\.|@))", line, flags=re.I)
            for part in parts:
                item = re.sub(r"\s+", " ", part).strip().strip(",;").strip()
                if not item:
                    continue
                key = item.lower()
                if key in seen:
                    continue
                seen.add(key)
                out.append(item)
                if len(out) >= MAX_MULTI_VALUES:
                    return out
    return out


def _strip_port_decoration(value: str) -> str:
    """'Mumbai (Maharashtra) - Major' -> 'Mumbai'.

    Exact-match only: the canonical resolver still decides the port, so this
    can never turn one port into a different one.
    """
    text = re.sub(r"\([^)]*\)", " ", value or "")
    text = text.split(" - ")[0]
    return re.sub(r"\s+", " ", text).strip()


def _social_key(url: str) -> str:
    host = (urlparse(url).netloc or "").lower()
    if "linkedin." in host:
        return "linkedin"
    if "facebook." in host:
        return "facebook"
    if "instagram." in host:
        return "instagram"
    # Exact hosts only: "fox.com" must not be mistaken for X/Twitter.
    if "twitter." in host or host in ("x.com", "www.x.com", "mobile.x.com"):
        return "twitter"
    return "website"


def _is_valid_url(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme in ("http", "https") and bool(parsed.netloc) and "." in parsed.netloc


def _reject(detail: str, code: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail={"code": code, "message": detail},
    )


# --------------------------------------------------------------------------- #
# Workbook reading
# --------------------------------------------------------------------------- #
def _load_rows(data: bytes, filename: str) -> list[list[Any]]:
    """Return the raw rows of the first worksheet, or raise a friendly error."""
    if not filename or not filename.lower().endswith(".xlsx"):
        raise _reject(
            "Please upload an Excel workbook (.xlsx). Old .xls files, CSV files "
            "and other formats are not supported.",
            "unsupported_file_type",
        )
    if not data:
        raise _reject("That file is empty. Please upload your completed template.", "empty_file")
    if len(data) > MAX_EXCEL_BYTES:
        raise _reject(
            f"That workbook is larger than {MAX_EXCEL_BYTES // (1024 * 1024)} MB. "
            "The template only needs one company row.",
            "file_too_large",
        )

    try:
        with zipfile.ZipFile(BytesIO(data)) as archive:
            names = archive.namelist()
    except zipfile.BadZipFile:
        raise _reject(
            "That file is not a valid .xlsx workbook. Please download the template "
            "and fill it in.",
            "invalid_workbook",
        )

    # Macros and external workbook links are never processed, so refuse them
    # rather than trying to sanitise them.
    if any(name.lower().endswith("vbaproject.bin") for name in names):
        raise _reject(
            "This workbook contains macros. Please save it as a plain .xlsx file "
            "(no macros) and upload again.",
            "macro_not_allowed",
        )
    if any("/externallinks/" in name.lower() for name in names):
        raise _reject(
            "This workbook links to another file. Please remove the external links "
            "and upload again.",
            "external_links_not_allowed",
        )
    if not any(name.startswith("xl/worksheets/") for name in names):
        raise _reject("That workbook has no worksheets.", "invalid_workbook")

    # The 2 MB cap above bounds the archive, not what it expands to: a zip bomb
    # can hide hundreds of MB of XML in a few KB. Refuse it before openpyxl
    # inflates anything.
    safe, reason = is_safe_zip_bytes(
        data,
        max_entries=settings.PROFILE_IMPORT_MAX_ZIP_ENTRIES,
        max_uncompressed=settings.PROFILE_IMPORT_MAX_UNCOMPRESSED_BYTES,
    )
    if not safe:
        raise _reject(
            f"{reason} Please upload the single-row Nhaav template.",
            "workbook_too_large",
        )

    try:
        # data_only=True: cached values only. openpyxl never evaluates formulas.
        workbook = load_workbook(BytesIO(data), read_only=True, data_only=True)
    except Exception:
        raise _reject(
            "We couldn't open this workbook. Please download the template again, "
            "fill it in and upload that file.",
            "invalid_workbook",
        )

    try:
        sheet = workbook.worksheets[0]
        rows: list[list[Any]] = []
        for row in sheet.iter_rows(max_row=MAX_SHEET_ROWS, values_only=True):
            rows.append(list(row))
            if len(rows) >= MAX_SHEET_ROWS:
                break
        return rows
    finally:
        workbook.close()


def _map_headers(
    row: Iterable[Any],
) -> tuple[dict[str, int], list[int], list[int], dict[str, int], dict[str, int]]:
    """Column index per field, plus the numbered/multi/legacy-extra columns."""
    single: dict[str, int] = {}
    others: list[int] = []
    ports: list[int] = []
    socials: dict[str, int] = {}
    extras: dict[str, int] = {}

    for index, value in enumerate(row):
        header = _normalise_header(value)
        if not header:
            continue
        if _NUMBERED_OTHER_CATEGORY.match(header):
            others.append(index)
            continue
        if _NUMBERED_OTHER_PORT.match(header):
            ports.append(index)
            continue
        if header in SOCIAL_COLUMN_HINTS:
            socials.setdefault(SOCIAL_COLUMN_HINTS[header], index)
            continue
        if header in EXTRA_HEADER_ALIASES and header not in HEADER_ALIASES:
            extras.setdefault(EXTRA_HEADER_ALIASES[header], index)
            continue
        field = HEADER_ALIASES.get(header)
        if field is not None and field not in single:
            single[field] = index
            if field == "other_categories":
                others.insert(0, index)
            elif field == "other_ports":
                ports.insert(0, index)

    return single, others, ports, socials, extras


def _find_header(
    rows: list[list[Any]],
) -> tuple[int, dict[str, int], list[int], list[int], dict[str, int], dict[str, int]]:
    """Locate the header row (templates may put a title above it)."""
    for index, row in enumerate(rows[:MAX_HEADER_SCAN_ROWS]):
        single, others, ports, socials, extras = _map_headers(row)
        # The primary category column is the anchor: it is the one field that is
        # always required, so a sheet holding just it (plus Head Office) is a
        # valid workbook and must not be rejected as "no headings".
        if "primary_category" in single:
            return index, single, others, ports, socials, extras
    raise _reject(
        "We couldn't find the column headings in this workbook. Download the Nhaav "
        "template, fill in one row and upload that file.",
        "headers_not_found",
    )


def _is_example_row(primary_category: Optional[str]) -> bool:
    """The template's sample row must never be imported as a real company.

    Only the primary-category cell is inspected: that cell holds a taxonomy name
    in a real row, never prose, so this cannot discard a genuine company just
    because another cell (a company name, an address such as "Example Wharf
    Road") happens to start with "Example".
    """
    if not primary_category:
        return False
    lowered = primary_category.strip().lower()
    return EXAMPLE_MARKER in lowered or lowered.startswith("example")


# --------------------------------------------------------------------------- #
# Preview
# --------------------------------------------------------------------------- #
def _current_values(profile: Optional[Profile]) -> dict[str, Any]:
    if profile is None:
        return {}
    contacts = profile.contacts or []
    first_contact = next((c for c in contacts if isinstance(c, dict)), {}) or {}
    social = profile.social_links or {}
    meta = profile.profile_metadata or {}
    return {
        "primary_category": profile.primary_category_name,
        "other_categories": list(profile.subcategory_names),
        # The extra categories the company also works in, already stored as names.
        "additional_categories": [
            str(name).strip()
            for name in (meta.get("additional_categories") or [])
            if str(name or "").strip()
        ],
        "head_office": profile.head_office,
        # The review form asks for "other ports"; `ports_served` is kept for any
        # caller that already reads the profile field by its own name.
        "other_ports": list(profile.ports_served or []),
        "ports_served": list(profile.ports_served or []),
        "phone": first_contact.get("phone"),
        "email": first_contact.get("email"),
        "social_links": [url for url in social.values() if url] if isinstance(social, dict) else [],
        "registration_number": meta.get("regNumber"),
        # The registered address is its own field; `offices` stays the list of
        # city/country locations the page shows.
        "address": meta.get("address"),
    }


def _display(key: str, value: Any) -> Optional[str]:
    if value in (None, "", [], {}):
        return None
    if isinstance(value, dict):
        links = [str(v) for v in value.values() if v]
        return ", ".join(links) if links else None
    if isinstance(value, (list, tuple, set)):
        return ", ".join(str(v) for v in value)
    return str(value)


def parse_preview(db: Session, user: User, filename: str, data: bytes) -> dict:
    """Parse an uploaded workbook into a review payload. Never saves."""
    if user.role not in (UserRole.provider, UserRole.supplier):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only suppliers and service providers have a company profile to import into.",
        )

    rows = _load_rows(data, filename)
    header_index, single, other_cols, port_cols, social_cols, extra_cols = _find_header(rows)

    missing_columns = [
        label for label, key in TEMPLATE_COLUMNS
        if key in REQUIRED_FIELDS and key not in single
    ]
    if missing_columns:
        raise _reject(
            "This workbook is missing required column"
            f"{'s' if len(missing_columns) > 1 else ''}: {', '.join(missing_columns)}. "
            "Please download the Nhaav template and use its headings.",
            "missing_columns",
        )

    # Only mapped columns decide whether a row has data: wider templates number
    # every row ("Sr. 1, 2, 3…"), which must not read as 200 filled companies.
    relevant = (
        set(single.values())
        | set(other_cols)
        | set(port_cols)
        | set(social_cols.values())
    )

    data_row: Optional[list[Any]] = None
    primary_index = single.get("primary_category")
    for row in rows[header_index + 1:]:
        cleaned = [_clean(value) for value in row]
        if not any(cleaned):
            continue
        if (
            primary_index is not None
            and primary_index < len(cleaned)
            and _is_example_row(cleaned[primary_index])
        ):
            continue
        if not any(cleaned[i] for i in relevant if i < len(cleaned)):
            continue
        data_row = cleaned
        break

    if data_row is None:
        raise _reject(
            "We couldn't find any company details in this workbook. Fill in one row "
            "below the column headings and upload again.",
            "no_data_row",
        )

    def cell(field: str) -> Optional[str]:
        index = single.get(field)
        return data_row[index] if index is not None and index < len(data_row) else None

    raw: dict[str, Any] = {
        "primary_category": cell("primary_category"),
        "head_office": cell("head_office"),
        "phone": cell("phone"),
        "registration_number": cell("registration_number"),
        "email": cell("email"),
        "address": cell("address"),
        "other_categories": _split_multi(
            [cell("other_categories"), *(data_row[i] if i < len(data_row) else None for i in other_cols)]
        ),
        "other_ports": _split_multi(
            [cell("other_ports"), *(data_row[i] if i < len(data_row) else None for i in port_cols)]
        ),
        "social_links": _split_links(
            [cell("social_links"), *(data_row[i] if i < len(data_row) else None for i in social_cols.values())]
        ),
    }

    # Legacy wide template: company name and type are real profile fields, so
    # they ride along; anything else (e.g. the per-category price) is reported
    # as ignored instead of vanishing silently.
    for key, column in extra_cols.items():
        if column < len(data_row):
            raw[key] = data_row[column]

    mapped_columns = (
        set(single.values())
        | set(other_cols)
        | set(port_cols)
        | set(social_cols.values())
        | set(extra_cols.values())
    )
    ignored_columns: list[dict[str, str]] = []
    for column, value in enumerate(rows[header_index]):
        header = _clean(value)
        if not header:
            continue
        # Company Type is not imported, but it is read so the preview can warn
        # when it disagrees with the account's role.
        if _normalise_header(header) == "company type" and raw.get("company_type") is None:
            raw["company_type"] = data_row[column] if column < len(data_row) else None
        if column in mapped_columns:
            continue
        normalised = _normalise_header(header)
        ignored_columns.append({
            "column": header,
            "reason": IGNORED_REASONS.get(normalised, DEFAULT_IGNORED_REASON),
        })

    return _resolve_preview(db, user, raw, ignored_columns)


def _as_text(value: Any) -> Optional[str]:
    if isinstance(value, (list, tuple)):
        return ", ".join(str(item) for item in value if item not in (None, "")) or None
    if isinstance(value, dict):
        return ", ".join(str(item) for item in value.values() if item) or None
    return _clean(value)


def _raw_from_values(values: dict[str, Any]) -> dict[str, Any]:
    """Normalise the values a vendor corrected in the review form."""
    text = {
        key: _as_text(values.get(key))
        for key in (*FIELD_LABELS, *EXTRA_LABELS)
    }
    return {
        "primary_category": text["primary_category"],
        "head_office": text["head_office"],
        "phone": text["phone"],
        "registration_number": text["registration_number"],
        "email": text["email"],
        "address": text["address"],
        # The review form keeps the two lists apart, so each is checked on its
        # own: an edited value can never be re-classified into the other list.
        "other_categories": _split_multi([text["other_categories"]]),
        "additional_categories": _split_multi([text.get("additional_categories")]),
        "other_ports": _split_multi([text["other_ports"]]),
        "social_links": _split_links([text["social_links"]]),
        "company_name": text.get("company_name"),
        "company_type": text.get("company_type"),
    }


def preview_values(db: Session, user: User, values: dict[str, Any]) -> dict:
    """Re-validate edited values with the same rules — no re-upload needed."""
    if user.role not in (UserRole.provider, UserRole.supplier):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only suppliers and service providers have a company profile to import into.",
        )
    return _resolve_preview(db, user, _raw_from_values(values), classified=True)


def _resolve_preview(
    db: Session,
    user: User,
    raw: dict[str, Any],
    ignored_columns: Optional[list[dict[str, str]]] = None,
    classified: bool = False,
) -> dict:
    """Map raw values onto existing taxonomy/ports and build the review payload.

    `classified` says the capability / additional-category split has already been
    decided and reviewed: the values are then checked in the list they arrived in
    instead of being re-classified.
    """
    vendor_type: VendorType = VendorTaxonomyService.vendor_type_for_user(user)
    fields_found = sum(1 for key in FIELD_LABELS if raw.get(key))

    issues: list[dict[str, Any]] = []
    warnings: list[str] = []

    # --- company type: derived from the account, not from the sheet ----------
    if raw.get("company_type"):
        declared = _COMPANY_TYPE_ROLES.get(
            re.sub(r"\s+", " ", str(raw["company_type"]).strip().lower())
        )
        if declared is not None and declared != vendor_type:
            account_label = (
                "a service provider" if vendor_type == VendorType.provider else "a supplier"
            )
            warnings.append(
                f"This workbook lists Company Type '{raw['company_type']}', but your "
                f"account is {account_label}. Your account type is used, and only its "
                "categories apply."
            )

    # --- categories: exact/normalised matches only ---------------------------
    categories = VendorTaxonomyService.categories(db, vendor_type)
    category_by_norm = {re.sub(r"\s+", " ", c.name.strip()).lower(): c for c in categories}

    primary_raw = raw["primary_category"]
    primary_category = None
    # A service/item name is also a valid answer: the template's dropdown lists
    # the services under each group, and providers think in services ("Machinery
    # Repairs") rather than in the group they belong to. Resolution stays
    # exact-match only — the parent category is the one the name is filed under.
    service_as_capability: Optional[str] = None
    if primary_raw:
        primary_category = category_by_norm.get(primary_raw.lower())
        if primary_category is None:
            wanted = re.sub(r"\s+", " ", primary_raw.strip()).lower()
            for candidate in categories:
                found = next(
                    (
                        sub.name
                        for sub in candidate.subcategories
                        if re.sub(r"\s+", " ", sub.name.strip()).lower() == wanted
                    ),
                    None,
                )
                if found is not None:
                    primary_category = candidate
                    service_as_capability = found
                    break
        if primary_category is None:
            issues.append({
                "field": "primary_category",
                "value": primary_raw,
                "message": (
                    "We couldn't recognise this category. Please choose the closest "
                    "Nhaav category from the list."
                ),
                "allowed": [c.name for c in categories],
            })

    subcategory_names: list[str] = [service_as_capability] if service_as_capability else []
    # Two different things live in the "other business categories" cells:
    #   * a capability under the primary category ("Marine Equipment" under
    #     "Ship Repair & Services") -> stored as a subcategory;
    #   * another whole business category ("Paints" for a ship handler)
    #     -> stored as an ADDITIONAL category.
    # A workbook cell may be either, so the parser classifies it once; after that
    # the review form shows the two lists separately and a re-check keeps each
    # value in the list the vendor reviewed.
    capability_input = list(raw.get("other_categories") or [])
    additional_input = list(raw.get("additional_categories") or [])
    additional_categories: list[str] = []

    def add_additional(name: str, value: str) -> None:
        if len(additional_categories) >= 5:
            issues.append({
                "field": "additional_categories",
                "value": value,
                "message": (
                    "A company can list up to five other business categories. "
                    "Remove one, or ask Nhaav to add the rest."
                ),
                "allowed": [],
            })
        elif name not in additional_categories:
            additional_categories.append(name)

    if capability_input or additional_input:
        if primary_category is None:
            issues.append({
                "field": "other_categories" if capability_input else "additional_categories",
                "value": capability_input or additional_input,
                "message": (
                    "Choose a recognised primary business category first; the other "
                    "categories you listed belong under it."
                ),
                "allowed": [c.name for c in categories],
            })
        else:
            available = {
                re.sub(r"\s+", " ", s.name.strip()).lower(): s.name
                for s in primary_category.subcategories
            }
            for value in capability_input:
                # A whole category typed into the capability field is a real
                # mistake; it is reported, never silently moved to the other list.
                other_category = category_by_norm.get(value.lower())
                if other_category is not None:
                    if classified:
                        issues.append({
                            "field": "other_categories",
                            "value": value,
                            "message": (
                                f"'{value}' is a whole business category, not a "
                                f"capability under '{primary_category.name}'. Move it "
                                "to Other Business Categories."
                            ),
                            "allowed": sorted(available.values()),
                        })
                    elif other_category.id != primary_category.id:
                        add_additional(other_category.name, value)
                    continue
                match = available.get(value.lower())
                if match is None:
                    issues.append({
                        "field": "other_categories",
                        "value": value,
                        "message": (
                            f"'{value}' isn't one of the options under "
                            f"'{primary_category.name}'. Pick one of the options below, "
                            "or remove it."
                        ),
                        "allowed": sorted(available.values()),
                    })
                elif match not in subcategory_names:
                    subcategory_names.append(match)

            for value in additional_input:
                other_category = category_by_norm.get(value.lower())
                if other_category is None:
                    issues.append({
                        "field": "additional_categories",
                        "value": value,
                        "message": (
                            f"'{value}' isn't a Nhaav business category. Whole business "
                            "categories go here; capabilities under "
                            f"'{primary_category.name}' go in the capabilities field."
                        ),
                        "allowed": [c.name for c in categories],
                    })
                elif other_category.id != primary_category.id:
                    add_additional(other_category.name, value)

    # --- ports: the existing canonical resolver ------------------------------
    def resolve_port(value: str) -> Optional[str]:
        port = PortCatalogueService.find(db, value)
        if port is None:
            stripped = _strip_port_decoration(value)
            if stripped and stripped != value:
                port = PortCatalogueService.find(db, stripped)
        return port.name if port is not None else None

    head_office_raw = raw["head_office"]
    head_office = resolve_port(head_office_raw) if head_office_raw else None
    if head_office_raw and head_office is None:
        issues.append({
            "field": "head_office",
            "value": head_office_raw,
            "message": (
                "This isn't a port in the Nhaav list. Choose the closest port, or ask "
                "Nhaav to add it during verification."
            ),
            "allowed": [p.name for p in PortCatalogueService.list_ports(db)],
        })

    ports: list[str] = []
    for value in raw["other_ports"]:
        resolved = resolve_port(value)
        if resolved is None:
            issues.append({
                "field": "other_ports",
                "value": value,
                "message": (
                    "This isn't a port in the Nhaav list. Choose the closest port, or "
                    "remove it."
                ),
                "allowed": [p.name for p in PortCatalogueService.list_ports(db)],
            })
        elif resolved not in ports and resolved != head_office:
            ports.append(resolved)

    # --- social links (optional; never blocks) -------------------------------
    social_links: dict[str, str] = {}
    for url in raw["social_links"]:
        candidate = url if re.match(r"^https?://", url, re.I) else f"https://{url}"
        if not _is_valid_url(candidate):
            warnings.append(f"'{url}' doesn't look like a web link, so it was skipped.")
            continue
        key = _social_key(candidate)
        if key in social_links:
            key = "other"
        social_links[key if key not in social_links else f"other_{len(social_links)}"] = candidate

    email_raw = raw["email"]
    # The address is stored exactly as the vendor typed it: the profile system
    # keeps contact email casing, so the importer must not change it either.
    email = email_raw if email_raw and _EMAIL_RE.match(email_raw) else None
    if email_raw and email is None:
        issues.append({
            "field": "email",
            "value": email_raw,
            "message": "This doesn't look like an email address. Please correct it.",
            "allowed": [],
        })

    phone = raw["phone"]
    if phone:
        digits = re.sub(r"\D", "", phone)
        # A phone number is digits plus separators: text such as "PO Box 1234567"
        # must not pass just because it happens to contain seven digits.
        looks_typed = re.search(r"[A-Za-z]", phone) is not None
        if looks_typed or not re.fullmatch(r"[+\d\s\-()./]+", phone) or not 7 <= len(digits) <= 15:
            issues.append({
                "field": "phone",
                "value": phone,
                "message": "This doesn't look like a phone number. Please correct it.",
                "allowed": [],
            })

    resolved: dict[str, Any] = {
        "primary_category": primary_category.name if primary_category else None,
        "other_categories": subcategory_names,
        "additional_categories": additional_categories,
        "head_office": head_office,
        "phone": phone,
        "other_ports": ports,
        "social_links": social_links,
        "registration_number": raw["registration_number"],
        "email": email,
        "address": raw["address"],
    }

    # Raw values stay available so "Edit import" can show what was typed even
    # when it could not be resolved. Each list carries only its own concept, so
    # editing one can never re-classify a value from the other.
    capability_raw = [*subcategory_names]
    additional_raw = [*additional_categories]
    for issue in issues:
        value = issue.get("value")
        if not isinstance(value, str):
            continue
        if issue.get("field") == "other_categories" and value not in capability_raw:
            capability_raw.append(value)
        elif issue.get("field") == "additional_categories" and value not in additional_raw:
            additional_raw.append(value)

    raw_values = {
        "primary_category": raw["primary_category"],
        "other_categories": capability_raw,
        "additional_categories": additional_raw,
        "head_office": raw["head_office"],
        "phone": raw["phone"],
        "other_ports": raw["other_ports"],
        "social_links": raw["social_links"],
        "registration_number": raw["registration_number"],
        "email": raw["email"],
        "address": raw["address"],
    }

    profile = db.query(Profile).filter(Profile.user_id == user.id).first()
    current = _current_values(profile)
    issue_fields = {issue["field"] for issue in issues}

    fields: list[dict[str, Any]] = []
    for key in FIELD_LABELS:
        label = FIELD_LABELS[key]
        imported_value = resolved.get(key) if key not in issue_fields else raw_values.get(key)
        imported_display = _display(key, imported_value)
        current_display = _display(key, current.get(key))
        required = key in REQUIRED_FIELDS

        if key in issue_fields:
            state = "review"
        elif imported_display is None:
            state = "missing" if required else "not_provided"
        else:
            state = "ok"

        if state == "ok":
            action = "will_update" if imported_display != current_display else "unchanged"
        elif state == "not_provided":
            action = "not_provided"
        else:
            action = "blocked"

        fields.append({
            "key": key,
            "label": label,
            "required": required,
            "required_missing": state == "missing",
            "imported": imported_display,
            "current": current_display,
            "status": state,
            "action": action,
            "message": next((i["message"] for i in issues if i["field"] == key), None),
        })

    extras = [
        {"key": key, "label": EXTRA_LABELS[key], "value": raw.get(key)}
        for key in EXTRA_LABELS
        if raw.get(key)
    ]

    has_existing = any(value for value in current.values())
    can_confirm = all(field["status"] in ("ok", "not_provided") for field in fields)

    return {
        "fields_found": fields_found,
        "extras": extras,
        "ignored_columns": ignored_columns or [],
        "fields": fields,
        "issues": issues,
        "warnings": warnings,
        "values": {
            **resolved,
            "company_name": raw.get("company_name"),
            "company_type": raw.get("company_type"),
        },
        "raw_values": raw_values,
        "current": current,
        "has_existing": has_existing,
        "warning": (
            "Some profile fields already contain information. Imported values will "
            "replace those fields after confirmation."
            if has_existing else None
        ),
        "can_confirm": can_confirm,
    }
