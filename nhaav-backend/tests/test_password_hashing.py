"""Password hashing must never turn a login or a registration into a 500.

The regression this pins: the app used to hash through passlib 1.7.4, which is
incompatible with bcrypt >= 4.1. Its backend self-test hashed a secret longer
than 72 bytes, newer bcrypt raised ValueError, and EVERY verify_password call
failed — so every sign-in answered 500, correct password or not.

Talking to bcrypt directly removes that failure mode. These tests hold the
contract: long passwords work, wrong passwords are simply False, and a malformed
stored hash can never raise out of a login.
"""
import bcrypt

from app.utils.password import hash_password, verify_password

PASSWORD = "Password123!"


def test_a_hash_round_trips():
    stored = hash_password(PASSWORD)
    # Stored bcrypt strings, so hashes written by the old passlib code (which
    # produced the same format) still verify.
    assert stored.startswith("$2")
    assert verify_password(PASSWORD, stored) is True


def test_a_wrong_password_is_false_not_an_error():
    stored = hash_password(PASSWORD)
    assert verify_password("WrongPassword1!", stored) is False


def test_a_password_longer_than_72_bytes_is_accepted():
    """bcrypt >= 4.1 rejects >72 bytes; hashing and verifying must agree."""
    long_password = "Pässwörd-" + "x" * 160
    assert len(long_password.encode("utf-8")) > 72

    stored = hash_password(long_password)
    assert verify_password(long_password, stored) is True
    # The 72-byte cap is applied identically on both sides, so a password that
    # differs only after the cut is the same secret (bcrypt's documented limit).
    assert verify_password(long_password[:80], stored) is True


def test_every_hash_gets_its_own_salt():
    assert hash_password(PASSWORD) != hash_password(PASSWORD)


def test_a_malformed_or_missing_hash_returns_false():
    for stored in ("", "not-a-hash", "$2b$12$broken"):
        assert verify_password(PASSWORD, stored) is False
    assert verify_password(PASSWORD, None) is False


def test_a_hash_written_by_plain_bcrypt_still_verifies():
    """The storage format is bcrypt's, not our wrapper's."""
    legacy = bcrypt.hashpw(PASSWORD.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    assert verify_password(PASSWORD, legacy) is True
