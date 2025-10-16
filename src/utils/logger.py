"""
Logging configuration for PANfm application.
Replaces custom debug logging with Python's standard logging module.
"""
import logging
import os
from logging.handlers import RotatingFileHandler
from typing import Optional


class PANfmLogger:
    """Centralized logging configuration for the application."""

    _instance: Optional[logging.Logger] = None
    _debug_enabled: bool = False

    @classmethod
    def setup(cls, debug: bool = False, log_file: Optional[str] = None) -> logging.Logger:
        """
        Set up the application logger.

        Args:
            debug: Enable debug level logging
            log_file: Path to log file (optional)

        Returns:
            Configured logger instance
        """
        if cls._instance is not None:
            return cls._instance

        # Create logger
        logger = logging.getLogger('panfm')
        logger.setLevel(logging.DEBUG if debug else logging.INFO)

        # Remove existing handlers to avoid duplicates
        logger.handlers.clear()

        # Console handler
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.DEBUG if debug else logging.INFO)

        # Create formatter
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

        # File handler (if log file specified)
        if log_file:
            try:
                # Ensure directory exists
                log_dir = os.path.dirname(log_file)
                if log_dir:
                    os.makedirs(log_dir, exist_ok=True)

                # Rotating file handler (max 10MB, keep 5 backups)
                file_handler = RotatingFileHandler(
                    log_file,
                    maxBytes=10 * 1024 * 1024,  # 10MB
                    backupCount=5
                )
                file_handler.setLevel(logging.DEBUG)
                file_handler.setFormatter(formatter)
                logger.addHandler(file_handler)
            except Exception as e:
                logger.warning(f"Could not set up file logging: {e}")

        cls._instance = logger
        cls._debug_enabled = debug

        return logger

    @classmethod
    def get_logger(cls) -> logging.Logger:
        """
        Get the application logger instance.

        Returns:
            Logger instance
        """
        if cls._instance is None:
            return cls.setup()
        return cls._instance

    @classmethod
    def set_debug(cls, enabled: bool) -> None:
        """
        Enable or disable debug logging at runtime.

        Args:
            enabled: True to enable debug logging, False to disable
        """
        cls._debug_enabled = enabled
        if cls._instance:
            cls._instance.setLevel(logging.DEBUG if enabled else logging.INFO)
            for handler in cls._instance.handlers:
                if isinstance(handler, logging.StreamHandler):
                    handler.setLevel(logging.DEBUG if enabled else logging.INFO)

    @classmethod
    def is_debug_enabled(cls) -> bool:
        """Check if debug logging is enabled."""
        return cls._debug_enabled


# Convenience function for backward compatibility
def get_logger() -> logging.Logger:
    """Get the PANfm logger instance."""
    return PANfmLogger.get_logger()
