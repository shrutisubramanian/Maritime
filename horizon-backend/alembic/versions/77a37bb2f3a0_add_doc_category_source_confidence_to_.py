"""add doc_category source confidence to documents

Revision ID: 77a37bb2f3a0
Revises: 
Create Date: 2026-07-10 10:46:43.148475

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '77a37bb2f3a0'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ### end Alembic commands ###
    op.create_table('documents',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('document_type', sa.Enum('cdc', 'coc', 'surveyor_license', 'vendor_registration', 'kyc_due_diligence', 'form_10f', 'no_pe_declaration', 'tax_invoice', 'other', name='documenttype'), nullable=False),
    sa.Column('file_url', sa.String(), nullable=False, comment='URL to the stored document file (e.g., S3 or Supabase Storage)'),
    sa.Column('ocr_extracted', sa.JSON(), nullable=True, comment='Raw structured data extracted via OCR'),
    sa.Column('verification_score', sa.Float(), nullable=True, comment='Confidence score from the OCR/verification pipeline'),
    sa.Column('status', sa.Enum('pending', 'verified', 'rejected', 'extracted', name='documentstatus'), nullable=False),
    sa.Column('doc_category', sa.String(), nullable=True),
    sa.Column('source', sa.String(), nullable=True),
    sa.Column('confidence', sa.String(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_documents_id'), 'documents', ['id'], unique=False)
    op.create_table('profiles',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('user_id', sa.Uuid(), nullable=False),
    sa.Column('position', sa.String(), nullable=True, comment='Job title or role description'),
    sa.Column('company_name', sa.String(), nullable=True, comment='Name of the company or vessel'),
    sa.Column('bio', sa.String(), nullable=True, comment='Short biography or description'),
    sa.Column('years_experience', sa.Integer(), nullable=False),
    sa.Column('skills', sa.JSON(), nullable=True, comment='List of technical or maritime skills'),
    sa.Column('ports_served', sa.JSON(), nullable=True, comment='List of ports where the provider operates'),
    sa.Column('availability_status', sa.Enum('available', 'busy', 'unavailable', name='availabilitystatus'), nullable=False),
    sa.Column('verification_status', sa.Enum('pending', 'verified', 'rejected', name='verificationstatus'), nullable=False),
    sa.Column('badge_label', sa.String(), nullable=True, comment="e.g., 'Top Rated', 'Verified Tech'"),
    sa.Column('rating_avg', sa.Float(), nullable=False),
    sa.Column('jobs_completed', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id')
    )
    op.create_index(op.f('ix_profiles_id'), 'profiles', ['id'], unique=False)
    op.create_table('service_requests',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('client_id', sa.Uuid(), nullable=False),
    sa.Column('service_type', sa.String(), nullable=False, comment="Category of service required (e.g., 'Hull Inspection')"),
    sa.Column('port', sa.String(), nullable=False, comment='Port or location where the service is needed'),
    sa.Column('description', sa.String(), nullable=True, comment='Detailed scope of work and vessel specifics'),
    sa.Column('urgency', sa.Enum('low', 'medium', 'high', name='urgencylevel'), nullable=False),
    sa.Column('status', sa.Enum('open', 'quoted', 'assigned', 'completed', 'cancelled', name='requeststatus'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['client_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_service_requests_id'), 'service_requests', ['id'], unique=False)
    op.create_table('quotes',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('request_id', sa.Uuid(), nullable=False),
    sa.Column('provider_id', sa.Uuid(), nullable=False),
    sa.Column('amount', sa.Float(), nullable=False, comment='Proposed price for the service'),
    sa.Column('currency', sa.String(), nullable=False),
    sa.Column('message', sa.String(), nullable=True, comment='Message or terms included with the quote'),
    sa.Column('status', sa.Enum('pending', 'accepted', 'rejected', name='quotestatus'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['provider_id'], ['users.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['request_id'], ['service_requests.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_quotes_id'), 'quotes', ['id'], unique=False)
    op.create_table('jobs',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('request_id', sa.Uuid(), nullable=False),
    sa.Column('provider_id', sa.Uuid(), nullable=False),
    sa.Column('quote_id', sa.Uuid(), nullable=False),
    sa.Column('status', sa.Enum('active', 'completed', 'cancelled', name='jobstatus'), nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=True, comment='When the job officially commenced'),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True, comment='When the job was marked completed'),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['provider_id'], ['users.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['quote_id'], ['quotes.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['request_id'], ['service_requests.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('quote_id'),
    sa.UniqueConstraint('request_id')
    )
    op.create_index(op.f('ix_jobs_id'), 'jobs', ['id'], unique=False)
    op.create_table('reviews',
    sa.Column('id', sa.Uuid(), nullable=False),
    sa.Column('job_id', sa.Uuid(), nullable=False),
    sa.Column('reviewer_id', sa.Uuid(), nullable=False),
    sa.Column('reviewed_user_id', sa.Uuid(), nullable=False),
    sa.Column('rating', sa.Integer(), nullable=False),
    sa.Column('comment', sa.String(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['job_id'], ['jobs.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['reviewed_user_id'], ['users.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['reviewer_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('job_id')
    )
    # ### end Alembic commands ###


def downgrade() -> None:
    """Downgrade schema."""
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table('reviews')
    op.drop_index(op.f('ix_jobs_id'), table_name='jobs')
    op.drop_table('jobs')
    op.drop_index(op.f('ix_quotes_id'), table_name='quotes')
    op.drop_table('quotes')
    op.drop_index(op.f('ix_service_requests_id'), table_name='service_requests')
    op.drop_table('service_requests')
    op.drop_index(op.f('ix_profiles_id'), table_name='profiles')
    op.drop_table('profiles')
    op.drop_index(op.f('ix_documents_id'), table_name='documents')
    op.drop_table('documents')
    # ### end Alembic commands ###
