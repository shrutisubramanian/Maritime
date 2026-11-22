# Nhaav Maritime backend — production container.
#
# Installs the SYSTEM OCR dependencies (tesseract-ocr, poppler-utils) that the
# document pipeline requires — these cannot go into requirements.txt. There is
# NO OCR runtime preflight in app/main.py: this image provides the binaries, but
# a non-Docker deployment must install them itself or OCR jobs will fail at run
# time while the process still reports healthy.
#
# Required runtime environment (dashboard → Variables):
#   ENVIRONMENT=production, DATABASE_URL, JWT_SECRET, CORS_ORIGINS,
#   FRONTEND_URL, EMAIL_BACKEND=smtp + EMAIL_HOST/EMAIL_FROM/EMAIL_HOST_USER/
#   EMAIL_HOST_PASSWORD, PAYMENT_BANK_ACCOUNT_HOLDER/PAYMENT_BANK_NAME/
#   PAYMENT_BANK_ACCOUNT_NUMBER/PAYMENT_BANK_IFSC
# No secrets are baked into the image.
#
# IMPORTANT — uploads are on the LOCAL FILESYSTEM (uploads/, profile_brochures/,
# uploads/payment_receipts/). There is no S3/object-storage backend in this
# codebase. Attach a persistent volume at /app/uploads and
# /app/profile_brochures, or uploaded KYC documents, brochures and payment
# receipts are lost on every redeploy.

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# System dependencies:
#   tesseract-ocr      -> OCR engine binary used by pytesseract
#   poppler-utils      -> pdftoppm/pdfinfo used by pdf2image (scanned PDFs)
#   libglib2.0-0 libgl1 -> runtime libs opencv needs on slim images
RUN apt-get update && apt-get install -y --no-install-recommends \
        tesseract-ocr \
        poppler-utils \
        libglib2.0-0 \
        libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app

# Non-root runtime user
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Migrations are NOT run automatically. Set RUN_MIGRATIONS_ON_START=true only
# when you deliberately want this container to apply them on boot; otherwise
# apply `alembic upgrade head` as a reviewed release step before the new image
# receives traffic. Schema is never created/mutated by the application itself;
# DATABASE_URL must point at a live PostgreSQL.
CMD ["sh", "-c", "if [ \"$RUN_MIGRATIONS_ON_START\" = \"true\" ]; then alembic upgrade head; fi && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
