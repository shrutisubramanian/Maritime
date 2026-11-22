"""Canonical supply-vendor profile categories.

These are the primary business categories a supply vendor can choose in the
company profile. They are deliberately separate from the more granular supply
listing categories: a company's profile category groups the business, while an
individual listing names the exact item supplied.

The database (``vendor_categories``) is the runtime source of truth. This tuple
is the seed input used by the taxonomy service and the data migration, so a new
install and an existing install receive the same choices.
"""

from typing import Final


SUPPLIER_PROFILE_CATEGORIES: Final[tuple[str, ...]] = (
    "Ship Chandlers",
    "Engine Stores",
    "Paints",
    "Safety Equipment",
    "Spare Parts Suppliers",
    "Marine Equipment",
    "Chemicals",
    "Lubricating Oils/Greases",
)

#: Item-level supply categories: what a supplier's listings are filed under. The
#: Excel template offers them after the profile categories, so a supplier filling
#: a spreadsheet sees the same names the marketplace filters use.
SUPPLY_ITEM_CATEGORIES: Final[tuple[str, ...]] = (
    "Deck Stores",
    "Electrical Equipment",
    "Generator Parts",
    "Lubricants",
    "Mechanical Equipment",
    "PPE",
    "Provisions",
    "Spare Parts",
    "Tools & Consumables",
)
