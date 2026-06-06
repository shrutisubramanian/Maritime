from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserResponse
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
