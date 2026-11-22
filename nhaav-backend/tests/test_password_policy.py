"""Password policy is enforced by the API schemas, not only the browser."""
import pytest
from pydantic import ValidationError

from app.schemas.auth import RegisterRequest, ResetPasswordRequest
from app.utils.password import PASSWORD_REQUIREMENT_MESSAGE, password_meets_policy


@pytest.mark.parametrize("password", ["abc", "abcdefgh", "abcdefgh1", "abcdefgh!"])
def test_weak_passwords_are_rejected_by_registration_schema(password):
    with pytest.raises(ValidationError):
        RegisterRequest(
            email="policy@example.com",
            password=password,
            role="client",
            full_name="Policy Test",
        )
    assert password_meets_policy(password) is False


def test_valid_password_passes_registration_and_reset_schemas():
    password = "abcdefgh1!"
    assert password_meets_policy(password) is True
    assert RegisterRequest(
        email="policy@example.com",
        password=password,
        role="provider",
        full_name="Policy Test",
    ).password == password
    assert ResetPasswordRequest(
        token="token", new_password=password
    ).new_password == password


@pytest.mark.parametrize("password", ["abcdefgh", "abcdefgh1", "abcdefgh!"])
def test_reset_schema_uses_the_same_policy(password):
    with pytest.raises(ValidationError):
        ResetPasswordRequest(token="token", new_password=password)


def test_policy_message_names_all_three_rules():
    for expected in ("8 characters", "number", "special character"):
        assert expected in PASSWORD_REQUIREMENT_MESSAGE