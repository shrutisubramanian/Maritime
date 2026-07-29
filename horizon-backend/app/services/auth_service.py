from datetime import datetime, timedelta
from typing import Optional
import uuid
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from jose import jwt, JWTError

from app.models.user import User
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse
from app.utils.password import hash_password, verify_password
from app.config import settings

class AuthService:
    """
    AuthService handles the core business logic for user authentication.
    It acts as the bridge between the API routers and the database,
    ensuring that business rules (like unique emails) are enforced.
    """

    @staticmethod
    def get_user_by_email(db: Session, email: str) -> Optional[User]:
        """
        Retrieves a user from the database by their email address.
        Returns None if no user is found.
        """
        return db.query(User).filter(User.email == email).first()

    @staticmethod
    def register_user(db: Session, request: RegisterRequest) -> User:
        """
        Registers a new user in the system.
        
        Steps:
        1. Check if the email is already taken.
        2. Hash the provided plain text password.
        3. Create a new SQLAlchemy User model instance.
        4. Add it to the session and commit the transaction.
        5. Refresh to get the generated ID and defaults.
        """
        # 1. Check email uniqueness
        existing_user = AuthService.get_user_by_email(db, request.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )

        # 2. Hash password
        hashed_pwd = hash_password(request.password)

        # 3. Create user
        new_user = User(
            email=request.email,
            password_hash=hashed_pwd,
            role=request.role,
            full_name=request.full_name,
            phone=request.phone
        )

        # 4. Save to database
        try:
            db.add(new_user)
            db.commit()
            db.refresh(new_user)
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="A database error occurred during registration."
            )

        # 5. Generate and print verification link (mocking email)
        verification_token = AuthService.generate_verification_token(new_user.email)
        print(f"\n[MOCK EMAIL] To verify email for {new_user.email}, use token: {verification_token}\n")

        # 6. Return User object
        return new_user

    @staticmethod
    def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
        """
        Generates a JWT access token encoding user identity and permissions.
        
        The payload contains:
        - sub: Subject identifier (user ID)
        - email: User's email
        - role: User's role for authorization
        - exp: Expiration timestamp
        """
        to_encode = data.copy()
        
        # Determine token expiration time
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
            
        to_encode.update({"exp": expire})
        
        # Sign the token with the secret key using the configured algorithm
        encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
        
        return encoded_jwt

    @staticmethod
    def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
        """
        Generates a JWT refresh token with a longer expiration time.
        """
        to_encode = data.copy()
        to_encode.update({"type": "refresh"})
        
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(days=7) # Default 7 days
            
        to_encode.update({"exp": expire})
        
        encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
        return encoded_jwt

    @staticmethod
    def generate_verification_token(email: str) -> str:
        """Generates a token for email verification."""
        expire = datetime.utcnow() + timedelta(hours=24)
        to_encode = {"email": email, "type": "verify_email", "exp": expire}
        return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

    @staticmethod
    def generate_password_reset_token(email: str) -> str:
        """Generates a token for password reset."""
        expire = datetime.utcnow() + timedelta(hours=1)
        to_encode = {"email": email, "type": "reset_password", "exp": expire}
        return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)

    @staticmethod
    def login_user(db: Session, request: LoginRequest) -> TokenResponse:
        """
        Authenticates a user and generates an access token.
        
        Steps:
        1. Find user by email.
        2. Verify the plain text password against the stored hash.
        3. Update the last_login timestamp.
        4. Generate a JWT token containing identity and role.
        5. Return the TokenResponse.
        """
        # 1. Find user by email
        user = AuthService.get_user_by_email(db, request.email)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # 2. Verify password
        if not verify_password(request.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # 3. Update last_login timestamp
        user.last_login = datetime.utcnow()
        db.commit()

        # 4. Generate JWT token
        # Converting UUID to string for the 'sub' claim
        token_payload = {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role.value
        }
        access_token = AuthService.create_access_token(data=token_payload)
        refresh_token = AuthService.create_refresh_token(data={"sub": str(user.id)})

        # 5. Return TokenResponse
        return TokenResponse(access_token=access_token, refresh_token=refresh_token)

    @staticmethod
    def refresh_access_token(db: Session, refresh_token: str) -> TokenResponse:
        """Validates refresh token and issues new access and refresh tokens."""
        try:
            payload = jwt.decode(refresh_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
            if payload.get("type") != "refresh":
                raise HTTPException(status_code=401, detail="Invalid token type")
                
            user_id_str = payload.get("sub")
            if not user_id_str:
                raise HTTPException(status_code=401, detail="Invalid token payload")
                
            user_id = uuid.UUID(user_id_str)
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                raise HTTPException(status_code=401, detail="User not found")
                
            token_payload = {
                "sub": str(user.id),
                "email": user.email,
                "role": user.role.value
            }
            new_access = AuthService.create_access_token(data=token_payload)
            new_refresh = AuthService.create_refresh_token(data={"sub": str(user.id)})
            
            return TokenResponse(access_token=new_access, refresh_token=new_refresh)
            
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid refresh token")

    @staticmethod
    def verify_email_token(db: Session, token: str) -> bool:
        """Verifies the email verification token and updates the user."""
        try:
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
            if payload.get("type") != "verify_email":
                return False
                
            email = payload.get("email")
            user = AuthService.get_user_by_email(db, email)
            if user and not user.is_verified:
                user.is_verified = True
                db.commit()
                return True
            return False
        except JWTError:
            return False

    @staticmethod
    def reset_password(db: Session, token: str, new_password: str) -> bool:
        """Verifies the reset token and updates the user's password."""
        try:
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
            if payload.get("type") != "reset_password":
                return False
                
            email = payload.get("email")
            user = AuthService.get_user_by_email(db, email)
            if user:
                user.password_hash = hash_password(new_password)
                db.commit()
                return True
            return False
        except JWTError:
            return False
