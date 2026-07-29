from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from app.config import settings

# -------------------------------------------------------------------------
# 1. SQLAlchemy Engine
# -------------------------------------------------------------------------
# The engine is the core interface to the database. It manages the connection 
# pool and handles the translation between SQLAlchemy and the specific 
# database dialect (PostgreSQL).
#
# pool_size: The number of connections to keep open inside the connection pool.
# max_overflow: The number of connections that can be opened beyond the pool_size setting.
# pool_pre_ping: Ensures connections are still active before using them, preventing
#                "server has gone away" or similar dropped connection errors in production.
if settings.DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        settings.DATABASE_URL,
        connect_args={"check_same_thread": False},
        pool_pre_ping=True,
        echo=False
    )
else:
    engine = create_engine(
        settings.DATABASE_URL,
        pool_size=20,
        max_overflow=10,
        pool_pre_ping=True,
        echo=False
    )

# -------------------------------------------------------------------------
# 2. Session Factory (SessionLocal)
# -------------------------------------------------------------------------
# SessionLocal is a factory that generates new database session instances.
# Each request will get its own session to interact with the database.
#
# autoflush=False: Prevents SQLAlchemy from automatically pushing changes to the database
#                  before a query is executed. This gives us explicit control.
# autocommit=False: Ensures we explicitly call session.commit(), maintaining ACID properties.
# bind=engine: Connects the generated sessions to our PostgreSQL engine.
SessionLocal = sessionmaker(
    autocommit=False, 
    autoflush=False, 
    bind=engine
)

# -------------------------------------------------------------------------
# 3. Declarative Base
# -------------------------------------------------------------------------
# The Base class serves as a declarative registry. All our database models 
# (e.g., User, Item, Contract) will inherit from this Base class. 
# SQLAlchemy uses it to keep track of all tables, columns, and relationships 
# defined in our application, allowing for automatic table creation and migrations.
from sqlalchemy import MetaData

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s"
}

metadata = MetaData(naming_convention=NAMING_CONVENTION)
Base = declarative_base(metadata=metadata)

# -------------------------------------------------------------------------
# 4. FastAPI Database Dependency
# -------------------------------------------------------------------------
def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency to provide a database session for a single request.
    
    It creates a new session, yields it to the route handler, and ensures it is 
    properly closed after the HTTP response is sent. This follows the 
    clean architecture principle of tying database session lifecycle to the request lifecycle.
    """
    db = SessionLocal()
    try:
        # yield suspends execution, passing the session to the FastAPI route.
        # Execution resumes here after the route completes.
        yield db
    finally:
        # Ensures the connection is returned to the pool regardless of 
        # whether the request succeeded or threw an exception.
        db.close()
