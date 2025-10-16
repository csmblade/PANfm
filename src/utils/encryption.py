"""
Encryption utilities for securing sensitive data.
Handles encryption/decryption of API keys and other secrets.
"""
import os
from cryptography.fernet import Fernet
from typing import Optional
from .logger import get_logger

logger = get_logger()

# Path to encryption key file
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'data')
ENCRYPTION_KEY_FILE = os.path.join(DATA_DIR, '.encryption_key')


class EncryptionService:
    """Service for encrypting and decrypting sensitive data."""

    _cipher_suite: Optional[Fernet] = None

    @classmethod
    def _get_cipher(cls) -> Fernet:
        """Get or initialize the cipher suite."""
        if cls._cipher_suite is None:
            key = cls._get_or_create_key()
            cls._cipher_suite = Fernet(key)
        return cls._cipher_suite

    @classmethod
    def _get_or_create_key(cls) -> bytes:
        """
        Get or create encryption key for securing sensitive data.

        Returns:
            Encryption key bytes
        """
        # Ensure data directory exists
        os.makedirs(DATA_DIR, exist_ok=True)

        if os.path.exists(ENCRYPTION_KEY_FILE):
            with open(ENCRYPTION_KEY_FILE, 'rb') as f:
                return f.read()
        else:
            # Generate a new key
            key = Fernet.generate_key()
            with open(ENCRYPTION_KEY_FILE, 'wb') as f:
                f.write(key)
            # Set file permissions to be readable only by owner
            os.chmod(ENCRYPTION_KEY_FILE, 0o600)
            logger.info(f"Created new encryption key at {ENCRYPTION_KEY_FILE}")
            return key

    @classmethod
    def encrypt(cls, value: str) -> str:
        """
        Encrypt a string value.

        Args:
            value: Plain text string to encrypt

        Returns:
            Encrypted string (or original if encryption fails)
        """
        if not value:
            return ""
        try:
            cipher = cls._get_cipher()
            encrypted = cipher.encrypt(value.encode())
            return encrypted.decode()
        except Exception as e:
            logger.warning(f"Encryption error: {e}")
            return value

    @classmethod
    def decrypt(cls, encrypted_value: str) -> str:
        """
        Decrypt a string value.

        Args:
            encrypted_value: Encrypted string to decrypt

        Returns:
            Decrypted string (or original if decryption fails)
        """
        if not encrypted_value:
            return ""
        try:
            cipher = cls._get_cipher()
            decrypted = cipher.decrypt(encrypted_value.encode())
            return decrypted.decode()
        except Exception as e:
            logger.debug(f"Decryption error (value may be unencrypted): {e}")
            # If decryption fails, assume it's unencrypted and return as-is
            return encrypted_value


# Convenience functions for backward compatibility
def encrypt_value(value: str) -> str:
    """Encrypt a string value."""
    return EncryptionService.encrypt(value)


def decrypt_value(encrypted_value: str) -> str:
    """Decrypt a string value."""
    return EncryptionService.decrypt(encrypted_value)
