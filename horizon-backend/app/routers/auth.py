from fastapi import HTTPException
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.auth import (
    RegisterRequest, LoginRequest, TokenResponse, UserResponse,
    RefreshTokenRequest, ForgotPasswordRequest, ResetPasswordRequest, VerifyEmailRequest
)
from app.services.auth_service import AuthService
from app.middleware.auth_guard import get_current_user

# Create the router with a standard prefix and grouping tag for OpenAPI docs.
router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)

# -----------------------------------------------------------------------------
# Routes
# -----------------------------------------------------------------------------
@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED, 
             summary="Register a new user", response_description="The newly created user profile.")
def register(request: RegisterRequest, db: Session = Depends(get_db)):
    """
    Register a new user to the platform.
    
    **Request Flow**:
    1. Client sends a JSON body matching `RegisterRequest`.
    2. FastAPI validates the JSON automatically.
    3. The `get_db` dependency injects a fresh database session.
    4. We pass the request and session to the `AuthService` to handle business logic.
    5. A new `User` is returned and automatically serialized into `UserResponse` (hiding the password).
    
    **Database Lifecycle**: The session is opened when the request hits, used by `AuthService`, 
    and closed automatically by FastAPI when the response is sent.
    """
    new_user = AuthService.register_user(db=db, request=request)
    return new_user


@router.post("/login", response_model=TokenResponse, summary="Login and receive a JWT token")
def login(request: LoginRequest, db: Session = Depends(get_db)):
    """
    Authenticate a user and return an access token.
    
    **Request Flow**:
    1. Client provides email and password.
    2. The `AuthService` verifies credentials against the database.
    3. If valid, a JWT token is signed and returned.
    """
    token_response = AuthService.login_user(db=db, request=request)
    return token_response


@router.get("/me", response_model=UserResponse, summary="Get current logged-in user")
def get_me(current_user: User = Depends(get_current_user)):
    """
    Retrieve the profile of the currently authenticated user.
    
    **Dependency Injection Flow**:
    1. The client sends an `Authorization: Bearer <token>` header.
    2. `Depends(get_current_user)` intercepts the request.
    3. It extracts the token, decodes it, and queries the database for the user.
    4. The verified `User` object is injected into this route handler as `current_user`.
    5. The route simply returns the user object, which Pydantic converts to `UserResponse`.
    """
    return current_user

@router.post("/refresh", response_model=TokenResponse, summary="Refresh access token")
def refresh_token(request: RefreshTokenRequest, db: Session = Depends(get_db)):
    """
    Exchanges a valid refresh token for a new access token and refresh token.
    """
    return AuthService.refresh_access_token(db=db, refresh_token=request.refresh_token)

@router.post("/forgot-password", status_code=status.HTTP_200_OK, summary="Request password reset")
def forgot_password(request: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Initiates the password reset flow.
    Mocks sending an email by printing the reset token to the console.
    """
    user = AuthService.get_user_by_email(db, request.email)
    if user:
        reset_token = AuthService.generate_password_reset_token(user.email)
        print(f"\n[MOCK EMAIL] To reset password for {user.email}, use token: {reset_token}\n")
    # Always return success to prevent email enumeration
    return {"message": "If that email exists, a password reset link has been sent."}

@router.post("/reset-password", status_code=status.HTTP_200_OK, summary="Reset password using token")
def reset_password(request: ResetPasswordRequest, db: Session = Depends(get_db)):
    """
    Resets the user's password using the token received via email.
    """
    success = AuthService.reset_password(db=db, token=request.token, new_password=request.new_password)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token."
        )
    return {"message": "Password has been successfully reset."}

@router.post("/verify-email", status_code=status.HTTP_200_OK, summary="Verify user email")
def verify_email(request: VerifyEmailRequest, db: Session = Depends(get_db)):
    """
    Verifies the user's email address using the token received via email.
    """
    success = AuthService.verify_email_token(db=db, token=request.token)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token."
        )
    return {"message": "Email has been successfully verified."}

@router.post("/resend-verification", status_code=status.HTTP_200_OK, summary="Resend verification email")
def resend_verification(request: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Resends the email verification link.
    """
    user = AuthService.get_user_by_email(db, request.email)
    if user and not user.is_verified:
        verification_token = AuthService.generate_verification_token(user.email)
        print(f"\n[MOCK EMAIL] To verify email for {user.email}, use token: {verification_token}\n")
    return {"message": "If that email exists and is unverified, a new verification link has been sent."}
