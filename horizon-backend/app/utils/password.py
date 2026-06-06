from passlib.context import CryptContext

# Set up the crypt context with bcrypt.
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)

def hash_password(password: str) -> str:
    """
    Generate a bcrypt hash for the provided plaintext password.
    """
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verify a plain password against the stored hashed version.
    """
    return pwd_context.verify(plain_password, hashed_password)