"""Profile skills + `quotation` document type

Two independent, additive changes:

* ``profiles.skills`` — the JSON list the marketplace `skill` filter reads.
  ``ProfileService.search_providers`` / ``search_suppliers`` already referenced
  it, so any ``?skill=`` request raised AttributeError and returned 500. The
  column is nullable, so every existing profile keeps working with no skills
  listed.
* ``documenttype`` gains ``quotation``. Uploading a quotation was rejected at
  the schema boundary (422) because the enum had no such member, so the
  selected document type could never be persisted.

No row is rewritten and no data is dropped. The downgrade refuses while any
document is stored as ``quotation``, because dropping the member would orphan
those rows.

Revision ID: b5a6c7d8e9f4
Revises: b7c8d9e0f1a2
Create Date: 2026-11-01
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = 'b5a6c7d8e9f4'
down_revision: Union[str, Sequence[str], None] = 'b7c8d9e0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_OLD_DOC_ENUM = sa.Enum(
    'cdc', 'coc', 'surveyor_license', 'vendor_registration',
    'kyc_due_diligence', 'form_10f', 'no_pe_declaration', 'tax_invoice',
    'other',
    name='documenttype',
)
_NEW_DOC_ENUM = sa.Enum(
    'cdc', 'coc', 'surveyor_license', 'vendor_registration',
    'kyc_due_diligence', 'form_10f', 'no_pe_declaration', 'tax_invoice',
    'quotation', 'other',
    name='documenttype',
)


def upgrade() -> None:
    with op.batch_alter_table('profiles', schema=None) as batch_op:
        batch_op.add_column(sa.Column('skills', sa.JSON(), nullable=True))

    with op.batch_alter_table('documents', schema=None) as batch_op:
        batch_op.alter_column(
            'document_type',
            existing_type=_OLD_DOC_ENUM,
            type_=_NEW_DOC_ENUM,
            nullable=False,
        )


def downgrade() -> None:
    # Refuse to drop the value while documents still use it.
    check = sa.text("SELECT COUNT(*) FROM documents WHERE document_type = 'quotation'")
    count = op.get_bind().execute(check).scalar() or 0
    if count:
        raise RuntimeError(
            "Cannot downgrade: documents.document_type='quotation' rows exist. "
            "Reclassify them first."
        )

    with op.batch_alter_table('documents', schema=None) as batch_op:
        batch_op.alter_column(
            'document_type',
            existing_type=_NEW_DOC_ENUM,
            type_=_OLD_DOC_ENUM,
            nullable=False,
        )

    with op.batch_alter_table('profiles', schema=None) as batch_op:
        batch_op.drop_column('skills')
